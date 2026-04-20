const { Aisle, Location, ItemLocation, Item, PickPath, sequelize } = require('../models');

const VALID_SECTION_TEMPERATURES = new Set(['ambient', 'chilled', 'frozen', 'hot']);

const compareAisleNumbers = (left, right) => {
  return String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });
};

const parsePositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeSectionTemperature = (value, fallback = 'ambient') => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_SECTION_TEMPERATURES.has(normalized) ? normalized : fallback;
};

const normalizeAisleName = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const toLocationCommodity = (temperature) => normalizeSectionTemperature(temperature);

const parseSectionOrdinal = (sectionValue) => {
  const match = String(sectionValue || '').match(/(\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getNextMissingOrdinalLabel = (values) => {
  const used = new Set(values.map(parseSectionOrdinal).filter(Boolean));
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return String(candidate);
};

const getNextMissingAisleNumber = async (storeId, transaction) => {
  const aisles = await Aisle.findAll({
    where: { storeId },
    attributes: ['aisleNumber'],
    transaction
  });

  return getNextMissingOrdinalLabel(aisles.map((aisle) => aisle.aisleNumber));
};

const getLockedAisleById = async (aisleId, transaction) => {
  const aisle = await Aisle.findByPk(aisleId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!aisle) {
    return null;
  }

  const locations = await Location.findAll({
    where: { aisleId: aisle.id },
    attributes: ['id', 'section', 'temperature'],
    order: [['section', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  aisle.locations = locations;
  return aisle;
};

const getLockedLocationWithAisle = async (locationId, transaction) => {
  const location = await Location.findByPk(locationId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!location) {
    return null;
  }

  const aisle = await Aisle.findByPk(location.aisleId, {
    attributes: ['id', 'storeId', 'aisleNumber', 'aisleName'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!aisle) {
    return null;
  }

  location.aisle = aisle;
  return location;
};

const returnAssignmentsToUnassigned = async ({ locationIds, transaction, allowedTemperature = null }) => {
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    return;
  }

  const itemLocations = await ItemLocation.findAll({
    where: { locationId: locationIds },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const itemIds = [...new Set(itemLocations.map((itemLocation) => Number(itemLocation?.itemId)).filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
  const items = itemIds.length > 0
    ? await Item.findAll({
        where: { id: itemIds },
        attributes: ['id', 'temperature', 'unassignedQuantity'],
        transaction,
        lock: transaction.LOCK.UPDATE
      })
    : [];
  const itemsById = new Map(items.map((item) => [Number(item.id), item]));

  const quantityToReturnByItemId = new Map();
  const itemLocationIdsToDelete = [];

  itemLocations.forEach((itemLocation) => {
    const itemId = Number(itemLocation?.itemId);
    if (!Number.isInteger(itemId) || itemId < 1) {
      return;
    }

    const item = itemsById.get(itemId);
    const itemTemperature = normalizeSectionTemperature(item?.temperature, 'ambient');
    if (allowedTemperature && itemTemperature === allowedTemperature) {
      return;
    }

    const quantity = Math.max(0, Number(itemLocation?.quantityOnHand || 0));
    quantityToReturnByItemId.set(itemId, (quantityToReturnByItemId.get(itemId) || 0) + quantity);
    itemLocationIdsToDelete.push(itemLocation.id);
  });

  for (const [itemId, quantityToReturn] of quantityToReturnByItemId.entries()) {
    const item = itemsById.get(itemId);

    if (!item) {
      continue;
    }

    const nextUnassignedQuantity = Math.max(0, Number(item.unassignedQuantity || 0)) + quantityToReturn;
    await item.update({ unassignedQuantity: nextUnassignedQuantity }, { transaction });
  }

  if (itemLocationIdsToDelete.length > 0) {
    await ItemLocation.destroy({
      where: { id: itemLocationIdsToDelete },
      transaction
    });
  }
};

const removeLocationsFromPickPaths = async ({ storeId, locationIds, transaction }) => {
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    return;
  }

  const pickPaths = await PickPath.findAll({
    where: { storeId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  for (const pickPath of pickPaths) {
    const existingSequence = Array.isArray(pickPath.pathSequence) ? pickPath.pathSequence : [];
    const nextSequence = existingSequence.filter((locationId) => !locationIds.includes(Number(locationId)));
    if (nextSequence.length !== existingSequence.length) {
      await pickPath.update({ pathSequence: nextSequence }, { transaction });
    }
  }
};

// Get all aisles for a store, optionally ordered by path sequence
const getAisles = async (req, res) => {
  try {
    const { storeId } = req.params;

    const aisles = await Aisle.findAll({
      where: { storeId },
      include: [
        {
          model: Location,
          as: 'locations',
          attributes: ['id', 'section', 'temperature'],
          required: false
        }
      ],
      order: [
        ['aisleNumber', 'ASC'],
        [{ model: Location, as: 'locations' }, 'section', 'ASC']
      ]
    });

    aisles.sort((left, right) => compareAisleNumbers(left?.aisleNumber, right?.aisleNumber));

    res.json({
      success: true,
      count: aisles.length,
      aisles
    });
  } catch (error) {
    console.error('Get aisles error:', error);
    res.status(500).json({ message: 'Server error retrieving aisles' });
  }
};

// Get a single aisle
const getAisle = async (req, res) => {
  try {
    const { id } = req.params;

    const aisle = await Aisle.findByPk(id, {
      include: [
        {
          model: Location,
          as: 'locations',
          attributes: ['id', 'section', 'temperature'],
          required: false
        }
      ]
    });

    if (!aisle) {
      return res.status(404).json({ message: 'Aisle not found' });
    }

    res.json({
      success: true,
      aisle
    });
  } catch (error) {
    console.error('Get aisle error:', error);
    res.status(500).json({ message: 'Server error retrieving aisle' });
  }
};

// Create a new aisle
const createAisle = async (req, res) => {
  try {
    const transaction = await sequelize.transaction();

    try {
      const { storeId, aisleNumber, aisleName, zone, category, coordinates, sectionTemperature } = req.body;
      const resolvedStoreId = parsePositiveInteger(storeId);

      if (!resolvedStoreId) {
        await transaction.rollback();
        return res.status(400).json({ message: 'storeId is required' });
      }

      const resolvedAisleNumber = String(aisleNumber || '').trim() || await getNextMissingAisleNumber(resolvedStoreId, transaction);

      const existing = await Aisle.findOne({
        where: {
          storeId: resolvedStoreId,
          aisleNumber: resolvedAisleNumber
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (existing) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Aisle number already exists for this store' });
      }

      const aisle = await Aisle.create({
        storeId: resolvedStoreId,
        aisleNumber: resolvedAisleNumber,
        aisleName: normalizeAisleName(aisleName),
        zone: zone || null,
        category: category || null,
        coordinates: coordinates || null
      }, { transaction });

      const location = await Location.create({
        storeId: resolvedStoreId,
        aisleId: aisle.id,
        section: '1',
        temperature: normalizeSectionTemperature(sectionTemperature),
        commodity: toLocationCommodity(sectionTemperature)
      }, { transaction });

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Aisle created successfully',
        aisle: {
          ...aisle.toJSON(),
          locations: [location]
        }
      });
    } catch (transactionError) {
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error) {
    console.error('Create aisle error:', error);
    res.status(500).json({ message: 'Server error creating aisle' });
  }
};

const addAisleSection = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const aisleId = parsePositiveInteger(req.params.id);
    const aisle = await getLockedAisleById(aisleId, transaction);

    if (!aisle) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Aisle not found' });
    }

    const section = getNextMissingOrdinalLabel((aisle.locations || []).map((location) => location.section));
    const temperature = normalizeSectionTemperature(req.body?.temperature);

    const location = await Location.create({
      storeId: aisle.storeId,
      aisleId: aisle.id,
      section,
      temperature,
      commodity: toLocationCommodity(temperature)
    }, { transaction });

    await transaction.commit();
    return res.status(201).json({ success: true, location });
  } catch (error) {
    await transaction.rollback();
    console.error('Add aisle section error:', error);
    return res.status(500).json({ message: 'Server error creating aisle section' });
  }
};

const updateAisleSection = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const locationId = parsePositiveInteger(req.params.locationId);
    const location = await getLockedLocationWithAisle(locationId, transaction);

    if (!location || !location.aisle) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Section not found' });
    }

    const nextTemperature = normalizeSectionTemperature(req.body?.temperature, location.temperature);
    const temperatureChanged = nextTemperature !== location.temperature;

    if (temperatureChanged) {
      await returnAssignmentsToUnassigned({
        locationIds: [location.id],
        allowedTemperature: nextTemperature,
        transaction
      });

      await removeLocationsFromPickPaths({
        storeId: location.aisle.storeId,
        locationIds: [location.id],
        transaction
      });
    }

    await location.update({
      temperature: nextTemperature,
      commodity: toLocationCommodity(nextTemperature)
    }, { transaction });

    await transaction.commit();
    return res.json({ success: true, location });
  } catch (error) {
    await transaction.rollback();
    console.error('Update aisle section error:', error);
    return res.status(500).json({ message: 'Server error updating aisle section' });
  }
};

const deleteAisleSection = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const locationId = parsePositiveInteger(req.params.locationId);
    const location = await getLockedLocationWithAisle(locationId, transaction);

    if (!location || !location.aisle) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Section not found' });
    }

    await returnAssignmentsToUnassigned({
      locationIds: [location.id],
      transaction
    });

    await removeLocationsFromPickPaths({
      storeId: location.aisle.storeId,
      locationIds: [location.id],
      transaction
    });

    await location.destroy({ transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Section deleted successfully' });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete aisle section error:', error);
    return res.status(500).json({ message: 'Server error deleting aisle section' });
  }
};

const getAisleSectionItems = async (req, res) => {
  try {
    const locationId = parsePositiveInteger(req.params.locationId);
    const location = await Location.findByPk(locationId, {
      include: [
        {
          model: Aisle,
          as: 'aisle',
          attributes: ['id', 'aisleNumber', 'aisleName']
        }
      ]
    });

    if (!location || !location.aisle) {
      return res.status(404).json({ message: 'Section not found' });
    }

    const itemLocations = await ItemLocation.findAll({
      where: { locationId: location.id },
      include: [
        {
          model: Item,
          as: 'item',
          attributes: ['id', 'name', 'temperature', 'commodity', 'unassignedQuantity']
        }
      ],
      order: [[{ model: Item, as: 'item' }, 'name', 'ASC']]
    });

    return res.json({
      success: true,
      location,
      count: itemLocations.length,
      items: itemLocations.map((itemLocation) => ({
        itemLocationId: itemLocation.id,
        itemId: itemLocation.itemId,
        name: itemLocation.item?.name || 'Unknown item',
        quantityOnHand: Math.max(0, Number(itemLocation.quantityOnHand || 0)),
        unassignedQuantity: Math.max(0, Number(itemLocation.item?.unassignedQuantity || 0)),
        temperature: itemLocation.item?.temperature || null,
        commodity: itemLocation.item?.commodity || null
      }))
    });
  } catch (error) {
    console.error('Get aisle section items error:', error);
    return res.status(500).json({ message: 'Server error retrieving aisle section items' });
  }
};

const deleteAisle = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const aisleId = parsePositiveInteger(req.params.id);
    const aisle = await getLockedAisleById(aisleId, transaction);

    if (!aisle) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Aisle not found' });
    }

    const locationIds = (aisle.locations || []).map((location) => location.id);

    await returnAssignmentsToUnassigned({
      locationIds,
      transaction
    });

    await removeLocationsFromPickPaths({
      storeId: aisle.storeId,
      locationIds,
      transaction
    });

    if (locationIds.length > 0) {
      await Location.destroy({
        where: { id: locationIds },
        transaction
      });
    }

    await aisle.destroy({ transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Aisle deleted successfully' });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete aisle error:', error);
    return res.status(500).json({ message: 'Server error deleting aisle' });
  }
};

// Update aisle (coordinates, name, zone, category, etc.)
const updateAisle = async (req, res) => {
  try {
    const { id } = req.params;
    const { coordinates, aisleName, zone, category } = req.body;

    const aisle = await Aisle.findByPk(id);
    if (!aisle) {
      return res.status(404).json({ message: 'Aisle not found' });
    }

    const updateData = {};
    if (coordinates !== undefined) updateData.coordinates = coordinates;
    if (aisleName !== undefined) updateData.aisleName = normalizeAisleName(aisleName);
    if (zone !== undefined) updateData.zone = zone;
    if (category !== undefined) updateData.category = category;

    await aisle.update(updateData);

    res.json({
      success: true,
      message: 'Aisle updated successfully',
      aisle
    });
  } catch (error) {
    console.error('Update aisle error:', error);
    res.status(500).json({ message: 'Server error updating aisle' });
  }
};

// Batch update aisle coordinates (for saving map layout)
const batchUpdateAisles = async (req, res) => {
  try {
    const { aisles } = req.body;

    if (!Array.isArray(aisles)) {
      return res.status(400).json({ message: 'aisles must be an array' });
    }

    const updates = [];
    for (const aisleData of aisles) {
      const aisle = await Aisle.findByPk(aisleData.id);
      if (aisle) {
        const updateObj = {};
        if (aisleData.coordinates !== undefined) {
          updateObj.coordinates = aisleData.coordinates;
        }
        if (Object.keys(updateObj).length > 0) {
          updates.push(aisle.update(updateObj));
        }
      }
    }

    await Promise.all(updates);

    res.json({
      success: true,
      message: `Updated ${updates.length} aisles successfully`
    });
  } catch (error) {
    console.error('Batch update aisles error:', error);
    res.status(500).json({ message: 'Server error updating aisles' });
  }
};

module.exports = {
  getAisles,
  getAisle,
  createAisle,
  addAisleSection,
  updateAisleSection,
  deleteAisleSection,
  getAisleSectionItems,
  deleteAisle,
  updateAisle,
  batchUpdateAisles
};
