const { sequelize } = require('../config/db');
const Employee = require('./Employee');
const Customer = require('./Customer');
const Store = require('./Store');
const Aisle = require('./Aisle');
const Location = require('./Location');
const Item = require('./Item');
const ItemLocation = require('./ItemLocation');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const PickPath = require('./PickPath');
const Timeslot = require('./Timeslot');
Store.hasMany(Employee, { foreignKey: 'storeId', as: 'employees' });
Store.hasMany(Aisle, { foreignKey: 'storeId', as: 'aisles' });
Store.hasMany(Location, { foreignKey: 'storeId', as: 'locations' });
Store.hasMany(Order, { foreignKey: 'storeId', as: 'orders' });
Store.hasMany(PickPath, { foreignKey: 'storeId', as: 'pickPaths' });
Store.hasMany(ItemLocation, { foreignKey: 'storeId', as: 'itemLocations' });
Employee.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Employee.hasMany(Order, { foreignKey: 'assignedPickerId', as: 'pickingOrders' });
Employee.hasMany(Order, { foreignKey: 'assignedDispenserId', as: 'dispensingOrders' });
Employee.hasMany(PickPath, { foreignKey: 'createdBy', as: 'createdPickPaths' });
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Customer.belongsTo(Store, { foreignKey: 'preferredStoreId', as: 'preferredStore' });
Aisle.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Aisle.hasMany(Location, { foreignKey: 'aisleId', as: 'locations' });
Location.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Location.belongsTo(Aisle, { foreignKey: 'aisleId', as: 'aisle' });
Location.hasMany(ItemLocation, { foreignKey: 'locationId', as: 'itemLocations' });
Item.hasMany(ItemLocation, { foreignKey: 'itemId', as: 'locations' });
Item.hasMany(OrderItem, { foreignKey: 'itemId', as: 'orderItems' });
ItemLocation.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });
ItemLocation.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });
ItemLocation.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Order.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Order.belongsTo(Employee, { foreignKey: 'assignedPickerId', as: 'picker' });
Order.belongsTo(Employee, { foreignKey: 'assignedDispenserId', as: 'dispenser' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
Order.hasOne(Timeslot, { foreignKey: 'orderNumber', sourceKey: 'orderNumber', as: 'timeslot' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });
OrderItem.belongsTo(Item, { foreignKey: 'substitutedItemId', as: 'substitutedItem' });
PickPath.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
PickPath.belongsTo(Employee, { foreignKey: 'createdBy', as: 'creator' });
Timeslot.belongsTo(Order, { foreignKey: 'orderNumber', targetKey: 'orderNumber', as: 'order' });
Timeslot.belongsTo(OrderItem, { foreignKey: 'items', as: 'itemList' });
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error synchronizing database:', error);
  }
};

module.exports = {
  sequelize,
  Employee,
  Customer,
  Store,
  Aisle,
  Location,
  Item,
  ItemLocation,
  Order,
  OrderItem,
  PickPath,
  Timeslot,
  syncDatabase
};
