const { Item, ItemLocation, Location, Aisle, Store } = require('../models');
const { Op } = require('sequelize');

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
      sortBy
    } = req.query;

    const where = {};
    
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
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

    const items = await Item.findAll({
      where,
      include: storeId ? [
        {
          model: ItemLocation,
          as: 'locations',
          where: { storeId },
          required: noLocation === 'true' ? false : true,
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
      ] : [],
      order
    });

    let filteredItems = items;
    if (noLocation === 'true' && storeId) {
      filteredItems = items.filter(item => item.locations.length === 0);
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
    const item = await Item.create(req.body);

    res.status(201).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Create item error:', error);
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

    await item.update(req.body);

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ message: 'Server error updating item' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const item = await Item.findByPk(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await item.update({ isActive: false });

    res.json({
      success: true,
      message: 'Item deactivated successfully'
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

    const locationWhere = { storeId };
    if (inStockOnly === 'true') {
      locationWhere.quantityOnHand = { [Op.gt]: 0 };
    }

    const items = await Item.findAll({
      where: itemWhere,
      include: [
        {
          model: ItemLocation,
          as: 'locations',
          where: locationWhere,
          required: true,
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

    res.json({
      success: true,
      count: items.length,
      items
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

    const totalStock = item.locations.reduce((sum, loc) => sum + loc.quantityOnHand, 0);
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
  try {
    const { id, locationId } = req.params;
    const { quantityOnHand, storeId } = req.body;

    let itemLocation = await ItemLocation.findOne({
      where: {
        itemId: id,
        locationId,
        storeId
      }
    });

    if (itemLocation) {
      await itemLocation.update({
        quantityOnHand,
        lastRestockedAt: new Date()
      });
    } else {
      itemLocation = await ItemLocation.create({
        itemId: id,
        locationId,
        storeId,
        quantityOnHand,
        lastRestockedAt: new Date()
      });
    }

    res.json({
      success: true,
      itemLocation
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ message: 'Server error updating inventory' });
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
  updateItemInventory
};
