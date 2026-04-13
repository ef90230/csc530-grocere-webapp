const { Item, ItemLocation, Location, Aisle, Store, Order, OrderItem, sequelize } = require('../models');
const { Op } = require('sequelize');

const TERMINAL_ORDER_STATUSES = new Set(['completed', 'complete', 'cancelled', 'canceled', 'deleted']);
const CANCELED_ORDER_ITEM_STATUSES = new Set(['canceled', 'cancelled', 'out_of_stock', 'skipped', 'not_found']);

const toNonNegativeInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed));
};

const getAssignedQuantityTotal = (item) => {
  return (item?.locations || []).reduce((sum, loc) => sum + toNonNegativeInteger(loc?.quantityOnHand, 0), 0);
};

const getUnassignedQuantity = (item) => toNonNegativeInteger(item?.unassignedQuantity, 0);

const getTotalOnHandQuantity = (item) => getAssignedQuantityTotal(item) + getUnassignedQuantity(item);

const toNullableDecimal = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const deriveCommodity = ({ temperature, weight, isRestricted }) => {
  if (isRestricted) {
    return 'restricted';
  }

  const normalizedTemperature = String(temperature || '').trim().toLowerCase();
  if (normalizedTemperature === 'chilled' || normalizedTemperature === 'frozen' || normalizedTemperature === 'hot') {
    return normalizedTemperature;
  }

  const resolvedWeight = toNullableDecimal(weight);
  if (normalizedTemperature === 'ambient' && resolvedWeight !== null && resolvedWeight >= 20) {
    return 'oversized';
  }

  return 'ambient';
};

const buildItemWritePayload = (source = {}, existingItem = null) => {
  const resolvedTemperature = source.temperature ?? existingItem?.temperature ?? 'ambient';
  const resolvedWeight = source.weight ?? existingItem?.weight ?? null;
  const restrictedFlag = source.isRestricted !== undefined
    ? Boolean(source.isRestricted)
    : String(existingItem?.commodity || '').trim().toLowerCase() === 'restricted';

  return {
    ...(source.upc !== undefined ? { upc: source.upc } : {}),
    ...(source.name !== undefined ? { name: source.name } : {}),
    ...(source.description !== undefined ? { description: source.description } : {}),
    ...(source.category !== undefined ? { category: source.category } : {}),
    ...(source.department !== undefined ? { department: source.department } : {}),
    ...(source.price !== undefined ? { price: source.price } : {}),
    ...(source.imageUrl !== undefined ? { imageUrl: source.imageUrl } : {}),
    ...(source.unassignedQuantity !== undefined ? { unassignedQuantity: toNonNegativeInteger(source.unassignedQuantity, 0) } : {}),
    temperature: resolvedTemperature,
    weight: toNullableDecimal(resolvedWeight),
    commodity: deriveCommodity({
      temperature: resolvedTemperature,
      weight: resolvedWeight,
      isRestricted: restrictedFlag
    })
  };
};

const recalculateOrderTotalAmount = async (orderId, transaction) => {
  const orderItems = await OrderItem.findAll({
    where: { orderId },
    attributes: ['quantity', 'unitPrice', 'status'],
    transaction
  });

  const nextTotal = orderItems.reduce((sum, orderItem) => {
    const normalizedStatus = String(orderItem?.status || '').toLowerCase();
    if (CANCELED_ORDER_ITEM_STATUSES.has(normalizedStatus)) {
      return sum;
    }

    const quantity = Math.max(0, Number(orderItem?.quantity || 0));
    const unitPrice = Math.max(0, Number(orderItem?.unitPrice || 0));
    return sum + (quantity * unitPrice);
  }, 0);

  await Order.update(
    { totalAmount: Number(nextTotal.toFixed(2)) },
    { where: { id: orderId }, transaction }
  );
};

const getItems = async (req, res) => {
  try {
    const {
      storeId,
      category,
      department,
      commodity,
      temperature,
      search,
      inStock,
      noLocation,
      sortBy,
      includeInactive
    } = req.query;

    const where = {};
    if (includeInactive !== 'true') {
      where.isActive = true;
    }
    
    if (search) {
      // allow searching by name or UPC (case-insensitive)
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { upc: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (category) where.category = category;
    if (department) where.department = department;
    if (commodity) where.commodity = commodity;
    if (temperature) where.temperature = temperature;
    if (inStock !== undefined) where.isActive = inStock === 'true';

    let order = [['name', 'ASC']];
    if (sortBy === 'name_desc') order = [['name', 'DESC']];
    if (sortBy === 'price_asc') order = [['price', 'ASC']];
    if (sortBy === 'price_desc') order = [['price', 'DESC']];
    if (sortBy === 'category') order = [['category', 'ASC'], ['name', 'ASC']];

    // always include locations so clients can compute stock / aisle info;
    // if a storeId is provided, add it to the where clause on the join
    const includeOptions = [
      {
        model: ItemLocation,
        as: 'locations',
        required: noLocation === 'true' ? false : false,
        include: [
          {
            model: Location,
            as: 'location',
            include: [
              {
                model: Aisle,
                as: 'aisle',
                attributes: ['id', 'aisleNumber', 'aisleName', 'category']
              }
            ]
          }
        ]
      }
    ];
    if (storeId) {
      includeOptions[0].where = { storeId };
    }

    const items = await Item.findAll({
      where,
      include: includeOptions,
      order
    });

    let filteredItems = items;
    if (noLocation === 'true') {
      // "No Location" means no location rows assigned at all (regardless of stock).
      filteredItems = items.filter((item) => (item.locations || []).length === 0);
    }

    res.json({
      success: true,
      count: filteredItems.length,
      items: filteredItems
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ message: 'Server error retrieving items' });
  }
};

const getItem = async (req, res) => {
  try {
    const { storeId } = req.query;

    const includeOptions = storeId ? [
      {
        model: ItemLocation,
        as: 'locations',
        where: { storeId },
        required: false,
        include: [
          {
            model: Location,
            as: 'location',
            include: [
              {
                model: Aisle,
                as: 'aisle',
                attributes: ['id', 'aisleNumber', 'aisleName', 'category']
              }
            ]
          }
        ]
      }
    ] : [];

    const item = await Item.findByPk(req.params.id, {
      include: includeOptions
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ message: 'Server error retrieving item' });
  }
};

const createItem = async (req, res) => {
  try {
    const item = await Item.create(buildItemWritePayload(req.body));

    res.status(201).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Create item error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: error.errors?.[0]?.message || 'Invalid item data' });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Item with this UPC already exists' });
    }
    res.status(500).json({ message: 'Server error creating item' });
  }
};

const updateItem = async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await item.update(buildItemWritePayload(req.body, item));

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Update item error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: error.errors?.[0]?.message || 'Invalid item data' });
    }
    res.status(500).json({ message: 'Server error updating item' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ message: 'Invalid item id' });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const item = await Item.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE });

      if (!item) {
        return { notFound: true };
      }

      const orderItems = await OrderItem.findAll({
        where: { itemId },
        include: [
          {
            model: Order,
            as: 'order',
            attributes: ['id', 'status'],
            required: true
          }
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const activeOrderIds = Array.from(new Set(
        orderItems
          .map((orderItem) => {
            const normalizedOrderStatus = String(orderItem?.order?.status || '').toLowerCase();
            if (!orderItem?.order?.id || TERMINAL_ORDER_STATUSES.has(normalizedOrderStatus)) {
              return null;
            }
            return orderItem.order.id;
          })
          .filter(Boolean)
      ));

      if (activeOrderIds.length > 0) {
        await OrderItem.update(
          {
            status: 'canceled',
            pickedQuantity: 0,
            pickedAt: null
          },
          {
            where: {
              itemId,
              orderId: { [Op.in]: activeOrderIds }
            },
            transaction
          }
        );

        for (const orderId of activeOrderIds) {
          await recalculateOrderTotalAmount(orderId, transaction);
        }
      }

      await ItemLocation.destroy({
        where: { itemId },
        transaction
      });

      await item.update(
        {
          isActive: false,
          unassignedQuantity: 0
        },
        { transaction }
      );

      return {
        notFound: false,
        canceledOrderCount: activeOrderIds.length
      };
    });

    if (result.notFound) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json({
      success: true,
      message: 'Item deleted from inventory and canceled in active orders.',
      canceledOrderCount: result.canceledOrderCount
    });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ message: 'Server error deleting item' });
  }
};

const getAvailableItems = async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const { category, department, inStockOnly } = req.query;

    const itemWhere = { isActive: true };
    if (category) itemWhere.category = category;
    if (department) itemWhere.department = department;

    const items = await Item.findAll({
      where: itemWhere,
      include: [
        {
          model: ItemLocation,
          as: 'locations',
          where: { storeId },
          required: false,
          include: [
            {
              model: Location,
              as: 'location',
              include: [
                {
                  model: Aisle,
                  as: 'aisle',
                  attributes: ['aisleNumber', 'aisleName']
                }
              ]
            }
          ]
        }
      ],
      order: [['category', 'ASC'], ['name', 'ASC']]
    });

    const filteredItems = inStockOnly === 'true'
      ? items.filter((item) => getTotalOnHandQuantity(item) > 0)
      : items;

    res.json({
      success: true,
      count: filteredItems.length,
      items: filteredItems
    });
  } catch (error) {
    console.error('Get available items error:', error);
    res.status(500).json({ message: 'Server error retrieving available items' });
  }
};

const checkItemAvailability = async (req, res) => {
  try {
    const { id, storeId } = req.params;

    const item = await Item.findByPk(id, {
      include: [
        {
          model: ItemLocation,
          as: 'locations',
          where: { storeId },
          required: false,
          include: [
            {
              model: Location,
              as: 'location',
              include: [
                {
                  model: Aisle,
                  as: 'aisle'
                }
              ]
            }
          ]
        }
      ]
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const totalStock = getTotalOnHandQuantity(item);
    const isAvailable = totalStock > 0 && item.isActive;
    const primaryLocation = item.locations.find(loc => loc.isPrimaryLocation);

    res.json({
      success: true,
      item: {
        id: item.id,
        name: item.name,
        upc: item.upc,
        price: item.price,
        isAvailable,
        totalStock,
        locations: item.locations,
        primaryLocation
      }
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({ message: 'Server error checking availability' });
  }
};

const updateItemInventory = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const itemId = Number(req.params.id);
    const rawLocationId = String(req.params.locationId || '').trim().toLowerCase();
    const storeId = Number(req.body?.storeId);
    const nextQuantity = toNonNegativeInteger(req.body?.quantityOnHand, 0);

    if (!Number.isInteger(itemId) || itemId < 1) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid item id.' });
    }

    const item = await Item.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found.' });
    }

    if (rawLocationId === 'unassigned') {
      await item.update({ unassignedQuantity: nextQuantity }, { transaction });
      await transaction.commit();

      return res.json({
        success: true,
        unassignedQuantity: toNonNegativeInteger(item.unassignedQuantity, 0)
      });
    }

    const resolvedLocationId = Number(req.params.locationId);
    if (!Number.isInteger(resolvedLocationId) || resolvedLocationId < 1 || !Number.isInteger(storeId) || storeId < 1) {
      await transaction.rollback();
      return res.status(400).json({ message: 'storeId and a valid locationId are required.' });
    }

    const location = await Location.findOne({ where: { id: resolvedLocationId, storeId }, transaction });
    if (!location) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Location not found for this store.' });
    }

    let itemLocation = await ItemLocation.findOne({
      where: {
        itemId,
        locationId: resolvedLocationId,
        storeId
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!itemLocation) {
      itemLocation = await ItemLocation.create({
        itemId,
        locationId: resolvedLocationId,
        storeId,
        quantityOnHand: 0,
        lastRestockedAt: new Date()
      }, { transaction });
    }

    const currentQuantity = toNonNegativeInteger(itemLocation.quantityOnHand, 0);
    const delta = nextQuantity - currentQuantity;
    const currentUnassigned = toNonNegativeInteger(item.unassignedQuantity, 0);

    if (delta > 0 && currentUnassigned < delta) {
      await transaction.rollback();
      return res.status(400).json({
        message: 'Not enough Unassigned quantity to increase this location. Add stock to Unassigned first.'
      });
    }

    const nextUnassigned = delta > 0
      ? currentUnassigned - delta
      : currentUnassigned + Math.abs(delta);

    await item.update({ unassignedQuantity: nextUnassigned }, { transaction });
    await itemLocation.update({
      quantityOnHand: nextQuantity,
      lastRestockedAt: new Date()
    }, { transaction });

    await transaction.commit();

    return res.json({
      success: true,
      itemLocation,
      unassignedQuantity: toNonNegativeInteger(item.unassignedQuantity, 0)
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update inventory error:', error);
    return res.status(500).json({ message: 'Server error updating inventory' });
  }
};

const addItemLocationAssignment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const itemId = Number(req.params.id);
    const storeId = Number(req.body?.storeId);
    const locationId = Number(req.body?.locationId);

    if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(locationId) || locationId < 1) {
      await transaction.rollback();
      return res.status(400).json({ message: 'item id, storeId, and locationId are required.' });
    }

    const item = await Item.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found.' });
    }

    const location = await Location.findOne({ where: { id: locationId, storeId }, transaction });
    if (!location) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Location not found for this store.' });
    }

    const [itemLocation] = await ItemLocation.findOrCreate({
      where: {
        itemId,
        locationId,
        storeId
      },
      defaults: {
        quantityOnHand: 0,
        isPrimaryLocation: false,
        lastRestockedAt: new Date()
      },
      transaction
    });

    await transaction.commit();
    return res.json({ success: true, itemLocation });
  } catch (error) {
    await transaction.rollback();
    console.error('Add item location assignment error:', error);
    return res.status(500).json({ message: 'Server error adding location assignment' });
  }
};

const reassignItemLocationAssignment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const itemId = Number(req.params.id);
    const sourceLocationId = Number(req.params.locationId);
    const targetLocationId = Number(req.body?.targetLocationId);
    const storeId = Number(req.body?.storeId);

    if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(sourceLocationId) || sourceLocationId < 1 || !Number.isInteger(targetLocationId) || targetLocationId < 1 || !Number.isInteger(storeId) || storeId < 1) {
      await transaction.rollback();
      return res.status(400).json({ message: 'item id, storeId, source location, and target location are required.' });
    }

    if (sourceLocationId === targetLocationId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Choose a different target location.' });
    }

    const sourceRow = await ItemLocation.findOne({
      where: {
        itemId,
        storeId,
        locationId: sourceLocationId
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sourceRow) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Source location assignment not found.' });
    }

    const targetLocation = await Location.findOne({ where: { id: targetLocationId, storeId }, transaction });
    if (!targetLocation) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Target location not found for this store.' });
    }

    const [targetRow] = await ItemLocation.findOrCreate({
      where: {
        itemId,
        storeId,
        locationId: targetLocationId
      },
      defaults: {
        quantityOnHand: 0,
        isPrimaryLocation: false,
        lastRestockedAt: new Date()
      },
      transaction
    });

    const movedQuantity = toNonNegativeInteger(sourceRow.quantityOnHand, 0);
    const nextTargetQuantity = toNonNegativeInteger(targetRow.quantityOnHand, 0) + movedQuantity;

    await targetRow.update({
      quantityOnHand: nextTargetQuantity,
      lastRestockedAt: new Date()
    }, { transaction });

    await sourceRow.destroy({ transaction });

    await transaction.commit();
    return res.json({ success: true, itemLocation: targetRow });
  } catch (error) {
    await transaction.rollback();
    console.error('Reassign item location assignment error:', error);
    return res.status(500).json({ message: 'Server error reassigning location assignment' });
  }
};

const deleteItemLocationAssignment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const itemId = Number(req.params.id);
    const locationId = Number(req.params.locationId);
    const storeId = Number(req.body?.storeId);

    if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(locationId) || locationId < 1 || !Number.isInteger(storeId) || storeId < 1) {
      await transaction.rollback();
      return res.status(400).json({ message: 'item id, storeId, and locationId are required.' });
    }

    const item = await Item.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Item not found.' });
    }

    const sourceRow = await ItemLocation.findOne({
      where: {
        itemId,
        storeId,
        locationId
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sourceRow) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Location assignment not found.' });
    }

    const movedQuantity = toNonNegativeInteger(sourceRow.quantityOnHand, 0);
    const nextUnassigned = toNonNegativeInteger(item.unassignedQuantity, 0) + movedQuantity;

    await item.update({ unassignedQuantity: nextUnassigned }, { transaction });
    await sourceRow.destroy({ transaction });

    await transaction.commit();
    return res.json({ success: true, unassignedQuantity: nextUnassigned });
  } catch (error) {
    await transaction.rollback();
    console.error('Delete item location assignment error:', error);
    return res.status(500).json({ message: 'Server error deleting location assignment' });
  }
};

const getOrganizationInsights = async (req, res) => {
  try {
    const { storeId } = req.params;

    const itemLocations = await ItemLocation.findAll({
      where: { storeId },
      include: [
        {
          model: Item,
          as: 'item',
          where: { isActive: true },
          attributes: ['id', 'name', 'department', 'category', 'commodity']
        },
        {
          model: Location,
          as: 'location',
          include: [
            {
              model: Aisle,
              as: 'aisle',
              attributes: ['id', 'aisleNumber', 'aisleName', 'category']
            }
          ]
        }
      ]
    });

    const totalTrackedItems = itemLocations.length;
    const outOfStockCount = itemLocations.filter(row => row.quantityOnHand <= 0).length;
    const inStockCount = totalTrackedItems - outOfStockCount;

    const misplaced = itemLocations.filter(row => {
      const itemDepartment = (row.item?.department || '').toLowerCase().trim();
      const aisleCategory = (row.location?.aisle?.category || '').toLowerCase().trim();
      if (!itemDepartment || !aisleCategory) {
        return false;
      }
      return itemDepartment !== aisleCategory;
    });

    const aisleWorkload = {};
    itemLocations.forEach(row => {
      const aisleNumber = row.location?.aisle?.aisleNumber || 'unknown';
      if (!aisleWorkload[aisleNumber]) {
        aisleWorkload[aisleNumber] = { aisleNumber, itemCount: 0, outOfStockCount: 0 };
      }
      aisleWorkload[aisleNumber].itemCount += 1;
      if (row.quantityOnHand <= 0) {
        aisleWorkload[aisleNumber].outOfStockCount += 1;
      }
    });

    const aisleSummary = Object.values(aisleWorkload)
      .sort((a, b) => b.outOfStockCount - a.outOfStockCount)
      .slice(0, 10);

    res.json({
      success: true,
      storeId,
      summary: {
        totalTrackedItems,
        inStockCount,
        outOfStockCount,
        misplacedCount: misplaced.length
      },
      weakPoints: {
        topAislesByOutOfStock: aisleSummary,
        misplacedSamples: misplaced.slice(0, 25).map(row => ({
          itemId: row.item.id,
          itemName: row.item.name,
          itemDepartment: row.item.department,
          aisleNumber: row.location?.aisle?.aisleNumber || null,
          aisleCategory: row.location?.aisle?.category || null
        }))
      }
    });
  } catch (error) {
    console.error('Get organization insights error:', error);
    res.status(500).json({ message: 'Server error retrieving organization insights' });
  }
};

module.exports = {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getAvailableItems,
  checkItemAvailability,
  updateItemInventory,
  addItemLocationAssignment,
  reassignItemLocationAssignment,
  deleteItemLocationAssignment,
  getOrganizationInsights
};
