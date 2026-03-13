const { Aisle, Location } = require('../models');

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
          attributes: ['id', 'section'],
          required: false
        }
      ],
      order: [['aisleNumber', 'ASC']]
    });

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

    const aisle = await Aisle.findByPk(id);

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
    if (aisleName !== undefined) updateData.aisleName = aisleName;
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
  updateAisle,
  batchUpdateAisles
};
