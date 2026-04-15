const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { generateEntityUpc } = require('../utils/barcodeService');
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
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Timeslot = require('./Timeslot');
const StagingLocation = require('./StagingLocation');
const StagingAssignment = require('./StagingAssignment');
const StagingLocationSetting = require('./StagingLocationSetting');
Store.hasMany(Employee, { foreignKey: 'storeId', as: 'employees' });
Store.hasMany(Aisle, { foreignKey: 'storeId', as: 'aisles' });
Store.hasMany(Location, { foreignKey: 'storeId', as: 'locations' });
Store.hasMany(Order, { foreignKey: 'storeId', as: 'orders' });
Store.hasMany(PickPath, { foreignKey: 'storeId', as: 'pickPaths' });
Store.hasMany(ItemLocation, { foreignKey: 'storeId', as: 'itemLocations' });
Store.hasMany(StagingLocation, { foreignKey: 'storeId', as: 'stagingLocations' });
Store.hasMany(StagingAssignment, { foreignKey: 'storeId', as: 'stagingAssignments' });
Store.hasOne(StagingLocationSetting, { foreignKey: 'storeId', as: 'stagingLocationSetting' });
Employee.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Employee.hasMany(Order, { foreignKey: 'assignedPickerId', as: 'pickingOrders' });
Employee.hasMany(Order, { foreignKey: 'assignedDispenserId', as: 'dispensingOrders' });
Employee.hasMany(PickPath, { foreignKey: 'createdBy', as: 'createdPickPaths' });
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Customer.belongsTo(Store, { foreignKey: 'preferredStoreId', as: 'preferredStore' });
Customer.hasOne(Cart, { foreignKey: 'customerId', as: 'cart' });
Cart.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Cart.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'items' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId', as: 'cart' });
CartItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });
CartItem.belongsTo(Item, { foreignKey: 'substitutionItemId', as: 'substitutionItem' });
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
Order.hasMany(StagingAssignment, { foreignKey: 'orderId', as: 'stagingAssignments' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderItem.belongsTo(Item, { foreignKey: 'itemId', as: 'item' });
OrderItem.belongsTo(Item, { foreignKey: 'substitutedItemId', as: 'substitutedItem' });
PickPath.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
PickPath.belongsTo(Employee, { foreignKey: 'createdBy', as: 'creator' });
Timeslot.belongsTo(Order, { foreignKey: 'orderNumber', targetKey: 'orderNumber', as: 'order' });
Timeslot.belongsTo(OrderItem, { foreignKey: 'items', as: 'itemList' });
StagingLocation.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
StagingLocation.hasMany(StagingAssignment, { foreignKey: 'stagingLocationId', as: 'assignments' });
StagingAssignment.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });
StagingAssignment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
StagingAssignment.belongsTo(StagingLocation, { foreignKey: 'stagingLocationId', as: 'stagingLocation' });
StagingLocationSetting.belongsTo(Store, { foreignKey: 'storeId', as: 'store' });

const EMPLOYEE_METRIC_COLUMNS = {
  pickRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  itemsPicked: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  firstTimePickPercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  preSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  postSubstitutionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  percentNotFound: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  onTimePercent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  weightedEfficiency: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  totesStaged: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
};

const CART_ITEM_OPTION_COLUMNS = {
  substitutionitemid: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'items',
      key: 'id'
    }
  },
  substitutionquantity: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
};

const ORDER_ITEM_OPTION_COLUMNS = {
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
};

const ensureEmployeeMetricColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  let employeeTable;

  try {
    employeeTable = await queryInterface.describeTable('employees');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping employee schema backfill due to insufficient DB permissions while inspecting employees table (code 42501).'
      );
      return;
    }
    throw error;
  }

  const missingColumns = Object.entries(EMPLOYEE_METRIC_COLUMNS).filter(
    ([columnName]) => !employeeTable[columnName]
  );

  if (missingColumns.length === 0) {
    return;
  }

  for (const [columnName, columnDefinition] of missingColumns) {
    try {
      await queryInterface.addColumn('employees', columnName, columnDefinition);
    } catch (error) {
      if (error?.original?.code === '42501') {
        console.warn(
          `Skipping employee schema backfill for column "${columnName}" due to insufficient DB permissions (code 42501).`
        );
        return;
      }
      throw error;
    }
  }

  console.log(
    `Added employee metric columns: ${missingColumns.map(([columnName]) => columnName).join(', ')}`
  );
};

const ensureCartItemOptionColumns = async () => {
  try {
    const [existingColumnsRows] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'cart_items'
        AND column_name IN ('substitutionitemid', 'substitutionquantity');
    `);

    const existingColumns = new Set(existingColumnsRows.map((row) => row.column_name));
    const needsSubstitutionItemId = !existingColumns.has('substitutionitemid');
    const needsSubstitutionQuantity = !existingColumns.has('substitutionquantity');

    if (!needsSubstitutionItemId && !needsSubstitutionQuantity) {
      return;
    }

    if (needsSubstitutionItemId) {
      await sequelize.query(
        'ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS substitutionitemid INTEGER;'
      );
    }

    if (needsSubstitutionQuantity) {
      await sequelize.query(
        'ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS substitutionquantity INTEGER;'
      );
    }
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'cart_items_substitutionitemid_fkey'
        ) THEN
          ALTER TABLE "cart_items"
          ADD CONSTRAINT "cart_items_substitutionitemid_fkey"
          FOREIGN KEY (substitutionitemid) REFERENCES "items"("id")
          ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    console.log('Ensured cart_items option columns: substitutionItemId, substitutionQuantity');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping cart_items schema backfill due to insufficient DB permissions (code 42501).'
      );
      return;
    }
    throw error;
  }
};

const ensureOrderItemOptionColumns = async () => {
  try {
    const [existingColumnsRows] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'order_items'
        AND column_name IN ('notes');
    `);

    const existingColumns = new Set(existingColumnsRows.map((row) => row.column_name));
    const needsNotes = !existingColumns.has('notes');

    if (!needsNotes) {
      return;
    }

    await sequelize.query(
      'ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS notes TEXT;'
    );

    console.log('Ensured order_items option columns: notes');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping order_items schema backfill due to insufficient DB permissions (code 42501).'
      );
      return;
    }
    throw error;
  }
};


const ensureCartUpcColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  let cartTable;

  try {
    cartTable = await queryInterface.describeTable('carts');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn('Skipping carts schema backfill due to insufficient DB permissions while inspecting carts table (code 42501).');
      return;
    }
    throw error;
  }

  if (!cartTable.upc) {
    try {
      await queryInterface.addColumn('carts', 'upc', {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      });
    } catch (error) {
      if (error?.original?.code === '42501') {
        console.warn('Skipping carts schema backfill due to insufficient DB permissions (code 42501).');
        return;
      }
      throw error;
    }
  }

  const cartsMissingUpc = await Cart.findAll({
    where: {
      upc: null
    }
  });

  for (const cart of cartsMissingUpc) {
    cart.upc = generateEntityUpc('cart', cart.id);
    await cart.save({ hooks: false });
  }
};

const ensureStagingLocationUpcColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  let stagingLocationTable;

  try {
    stagingLocationTable = await queryInterface.describeTable('staging_locations');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn('Skipping staging_locations schema backfill due to insufficient DB permissions while inspecting staging_locations table (code 42501).');
      return;
    }
    throw error;
  }

  if (!stagingLocationTable.upc) {
    try {
      await queryInterface.addColumn('staging_locations', 'upc', {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      });
    } catch (error) {
      if (error?.original?.code === '42501') {
        console.warn('Skipping staging_locations schema backfill due to insufficient DB permissions (code 42501).');
        return;
      }
      throw error;
    }
  }

  const locationsMissingUpc = await StagingLocation.findAll({
    where: {
      upc: null
    }
  });

  for (const location of locationsMissingUpc) {
    location.upc = generateEntityUpc('stagingLocation', location.id);
    await location.save({ hooks: false });
  }
};

const ensureOrderItemCanceledStatus = async () => {
  try {
    await sequelize.query(`
      ALTER TYPE "enum_order_items_status" ADD VALUE IF NOT EXISTS 'canceled';
    `);
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping order_items status enum backfill due to insufficient DB permissions (code 42501).'
      );
      return;
    }

    // enum type may not exist yet in fresh environments before sync
    if (error?.original?.code === '42704') {
      return;
    }

    throw error;
  }
};

const ensureStagingLocationCodeColumn = async () => {
  try {
    const [existingColumnsRows] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'staging_locations'
        AND column_name IN ('locationCode', 'locationcode');
    `);

    const existingColumns = new Set(existingColumnsRows.map((row) => row.column_name));
    const needsLocationCode = !existingColumns.has('locationCode') && !existingColumns.has('locationcode');

    if (!needsLocationCode) {
      return;
    }

    await sequelize.query(
      'ALTER TABLE "staging_locations" ADD COLUMN IF NOT EXISTS "locationCode" VARCHAR(120);'
    );

    console.log('Ensured staging_locations option columns: locationCode');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping staging_locations schema backfill due to insufficient DB permissions (code 42501).'
      );
      return;
    }
    throw error;
  }
};

const ensureItemUnassignedQuantityColumn = async () => {
  try {
    const [existingColumnsRows] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'items'
        AND column_name IN ('unassignedQuantity', 'unassignedquantity');
    `);

    const existingColumns = new Set(existingColumnsRows.map((row) => row.column_name.toLowerCase()));
    const needsColumn = !existingColumns.has('unassignedquantity');

    if (!needsColumn) {
      return;
    }

    await sequelize.query(
      'ALTER TABLE "items" ADD COLUMN IF NOT EXISTS unassignedquantity INTEGER NOT NULL DEFAULT 0;'
    );

    console.log('Ensured items option columns: unassignedQuantity');
  } catch (error) {
    if (error?.original?.code === '42501') {
      console.warn(
        'Skipping items schema backfill due to insufficient DB permissions (code 42501).'
      );
      return;
    }
    throw error;
  }
};

const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    await ensureEmployeeMetricColumns();
    await ensureCartItemOptionColumns();
    await ensureOrderItemOptionColumns();
    await ensureOrderItemCanceledStatus();
    await ensureStagingLocationCodeColumn();
    await ensureItemUnassignedQuantityColumn();
    await ensureCartUpcColumn();
    await ensureStagingLocationUpcColumn();
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error synchronizing database:', error);
    throw error;
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
  Cart,
  CartItem,
  StagingLocation,
  StagingAssignment,
  StagingLocationSetting,
  Timeslot,
  ensureEmployeeMetricColumns,
  ensureOrderItemCanceledStatus,
  ensureStagingLocationCodeColumn,
  ensureItemUnassignedQuantityColumn,
  ensureCartUpcColumn,
  ensureStagingLocationUpcColumn,
  syncDatabase
};
