const { Item, ItemLocation, Location, Aisle, Store } = require('../models');
const { sequelize } = require('../config/db');

const ITEM_IMAGE_TAGS_BY_UPC = {
  '123456789012': 'banana,fruit',
  '123456789013': 'red-apple,fruit',
  '123456789014': 'broccoli,vegetable',
  '123456789015': 'carrot,vegetable',
  '123456789016': 'red-grapes,fruit',
  '223456789012': 'bread,loaf',
  '223456789013': 'chocolate-chip-cookies,dessert',
  '223456789014': 'blueberry-muffin,bakery',
  '323456789012': 'milk,carton',
  '323456789013': 'cheddar-cheese,dairy',
  '323456789014': 'greek-yogurt,dairy',
  '323456789015': 'butter,dairy',
  '423456789012': 'chicken-breast,meat',
  '423456789013': 'ground-beef,meat',
  '423456789014': 'salmon-fillet,fish',
  '523456789012': 'frozen-peas,vegetable',
  '523456789013': 'ice-cream,dessert',
  '523456789014': 'frozen-pizza,pizza',
  '623456789012': 'canned-tomatoes,tomato',
  '623456789013': 'pasta-sauce,sauce',
  '623456789014': 'canned-tuna,fish',
  '723456789012': 'potato-chips,snack',
  '723456789013': 'chocolate-bar,candy',
  '723456789014': 'trail-mix,nuts',
  '823456789012': 'orange-juice,juice',
  '823456789013': 'soda,drink',
  '823456789014': 'coffee,beans'
};

const buildItemImageUrl = ({ upc, name, id }) => {
  const fallbackTags = (name || 'grocery item')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');

  const tags = ITEM_IMAGE_TAGS_BY_UPC[upc] || `${fallbackTags},grocery-item`;
  const lockSeed = String(upc || id || fallbackTags || 'item');
  return `https://loremflickr.com/400/400/${tags}?lock=${encodeURIComponent(lockSeed)}`;
};

const seedInventory = async () => {
  try {
    console.log('Starting inventory seed...');

    // Get the store (assuming store ID 1 exists)
    const store = await Store.findByPk(1);
    if (!store) {
      console.error('Store with ID 1 not found. Please create a store first.');
      return;
    }

    // Create aisles if they don't exist
    const aislesData = [
      { aisleNumber: '1', aisleName: 'Produce', category: 'Fruits & Vegetables', zone: 'Front' },
      { aisleNumber: '2', aisleName: 'Bakery', category: 'Bakery', zone: 'Front' },
      { aisleNumber: '3', aisleName: 'Dairy', category: 'Dairy', zone: 'Middle' },
      { aisleNumber: '4', aisleName: 'Meat', category: 'Meat & Poultry', zone: 'Middle' },
      { aisleNumber: '5', aisleName: 'Frozen', category: 'Frozen Foods', zone: 'Back' },
      { aisleNumber: '6', aisleName: 'Canned Goods', category: 'Canned & Packaged', zone: 'Middle' },
      { aisleNumber: '7', aisleName: 'Snacks', category: 'Snacks', zone: 'Middle' },
      { aisleNumber: '8', aisleName: 'Beverages', category: 'Beverages', zone: 'Back' }
    ];

    const aisles = [];
    for (const aisleData of aislesData) {
      let aisle = await Aisle.findOne({
        where: { storeId: store.id, aisleNumber: aisleData.aisleNumber }
      });
      if (!aisle) {
        aisle = await Aisle.create({
          ...aisleData,
          storeId: store.id,
          coordinates: { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 8) }
        });
        console.log(`Created aisle: ${aisle.aisleName}`);
      }
      aisles.push(aisle);
    }

    // Create locations for each aisle
    const locations = [];
    for (const aisle of aisles) {
      for (let section = 1; section <= 3; section++) {
        let location = await Location.findOne({
          where: { storeId: store.id, aisleId: aisle.id, section: `S${section}` }
        });
        if (!location) {
          location = await Location.create({
            storeId: store.id,
            aisleId: aisle.id,
            section: `S${section}`,
            temperature: aisle.category === 'Frozen Foods' ? 'frozen' : aisle.category === 'Dairy' ? 'chilled' : 'ambient',
            commodity: 'ambient'
          });
          console.log(`Created location: Aisle ${aisle.aisleNumber}, Section ${location.section}`);
        }
        locations.push(location);
      }
    }

    // Create dummy items
    const itemsData = [
      // Produce
      { upc: '123456789012', name: 'Organic Bananas', category: 'Fruits', department: 'Produce', price: 0.59, temperature: 'ambient', commodity: 'ambient' },
      { upc: '123456789013', name: 'Red Apples', category: 'Fruits', department: 'Produce', price: 1.29, temperature: 'ambient', commodity: 'ambient' },
      { upc: '123456789014', name: 'Broccoli Crowns', category: 'Vegetables', department: 'Produce', price: 2.49, temperature: 'ambient', commodity: 'ambient' },
      { upc: '123456789015', name: 'Carrots', category: 'Vegetables', department: 'Produce', price: 1.99, temperature: 'ambient', commodity: 'ambient' },
      { upc: '123456789016', name: 'Red Grapes (per lb)', description: 'Sold by weight. Listed price is per pound.', category: 'Fruits', department: 'Produce', price: 2.99, weight: 1.00, temperature: 'ambient', commodity: 'ambient' },

      // Bakery
      { upc: '223456789012', name: 'Whole Wheat Bread', category: 'Bread', department: 'Bakery', price: 3.49, temperature: 'ambient', commodity: 'ambient' },
      { upc: '223456789013', name: 'Chocolate Chip Cookies', category: 'Cookies', department: 'Bakery', price: 4.99, temperature: 'ambient', commodity: 'ambient' },
      { upc: '223456789014', name: 'Blueberry Muffins', category: 'Pastries', department: 'Bakery', price: 5.99, temperature: 'ambient', commodity: 'ambient' },

      // Dairy
      { upc: '323456789012', name: 'Whole Milk', category: 'Milk', department: 'Dairy', price: 3.99, temperature: 'chilled', commodity: 'chilled' },
      { upc: '323456789013', name: 'Cheddar Cheese', category: 'Cheese', department: 'Dairy', price: 4.49, temperature: 'chilled', commodity: 'chilled' },
      { upc: '323456789014', name: 'Greek Yogurt', category: 'Yogurt', department: 'Dairy', price: 1.29, temperature: 'chilled', commodity: 'chilled' },
      { upc: '323456789015', name: 'Butter', category: 'Butter', department: 'Dairy', price: 3.99, temperature: 'chilled', commodity: 'chilled' },

      // Meat
      { upc: '423456789012', name: 'Chicken Breast', category: 'Poultry', department: 'Meat', price: 7.99, temperature: 'chilled', commodity: 'chilled' },
      { upc: '423456789013', name: 'Ground Beef', category: 'Beef', department: 'Meat', price: 5.49, temperature: 'chilled', commodity: 'chilled' },
      { upc: '423456789014', name: 'Salmon Fillet', category: 'Fish', department: 'Meat', price: 12.99, temperature: 'chilled', commodity: 'chilled' },

      // Frozen
      { upc: '523456789012', name: 'Frozen Peas', category: 'Vegetables', department: 'Frozen', price: 1.99, temperature: 'frozen', commodity: 'frozen' },
      { upc: '523456789013', name: 'Ice Cream', category: 'Dessert', department: 'Frozen', price: 4.99, temperature: 'frozen', commodity: 'frozen' },
      { upc: '523456789014', name: 'Frozen Pizza', category: 'Pizza', department: 'Frozen', price: 7.99, temperature: 'frozen', commodity: 'frozen' },

      // Canned Goods
      { upc: '623456789012', name: 'Canned Tomatoes', category: 'Vegetables', department: 'Canned', price: 1.49, temperature: 'ambient', commodity: 'ambient' },
      { upc: '623456789013', name: 'Pasta Sauce', category: 'Sauce', department: 'Canned', price: 2.29, temperature: 'ambient', commodity: 'ambient' },
      { upc: '623456789014', name: 'Canned Tuna', category: 'Fish', department: 'Canned', price: 1.99, temperature: 'ambient', commodity: 'ambient' },

      // Snacks
      { upc: '723456789012', name: 'Potato Chips', category: 'Chips', department: 'Snacks', price: 3.49, temperature: 'ambient', commodity: 'ambient' },
      { upc: '723456789013', name: 'Chocolate Bar', category: 'Candy', department: 'Snacks', price: 1.29, temperature: 'ambient', commodity: 'ambient' },
      { upc: '723456789014', name: 'Trail Mix', category: 'Nuts', department: 'Snacks', price: 4.99, temperature: 'ambient', commodity: 'ambient' },

      // Beverages
      { upc: '823456789012', name: 'Orange Juice', category: 'Juice', department: 'Beverages', price: 3.99, temperature: 'chilled', commodity: 'chilled' },
      { upc: '823456789013', name: 'Soda', category: 'Soft Drinks', department: 'Beverages', price: 1.99, temperature: 'ambient', commodity: 'ambient' },
      { upc: '823456789014', name: 'Coffee', category: 'Coffee', department: 'Beverages', price: 8.99, temperature: 'ambient', commodity: 'ambient' }
    ];

    const itemsDataWithImages = itemsData.map((itemData) => ({
      ...itemData,
      imageUrl: itemData.imageUrl || buildItemImageUrl(itemData)
    }));

    const items = [];
    for (const itemData of itemsDataWithImages) {
      let item = await Item.findOne({ where: { upc: itemData.upc } });
      if (!item) {
        item = await Item.create(itemData);
        console.log(`Created item: ${item.name}`);
      } else {
        const updatePayload = {};
        if (item.imageUrl !== itemData.imageUrl) updatePayload.imageUrl = itemData.imageUrl;
        if (!item.description && itemData.description) updatePayload.description = itemData.description;
        if ((!item.weight || Number(item.weight) === 0) && itemData.weight) updatePayload.weight = itemData.weight;

        if (Object.keys(updatePayload).length > 0) {
          await item.update(updatePayload);
        }
      }
      items.push(item);
    }

    // Ensure all inventory rows are mapped to an item-relevant image.
    const allItems = await Item.findAll();
    for (const item of allItems) {
      const desiredImageUrl = buildItemImageUrl({ upc: item.upc, name: item.name, id: item.id });
      if (item.imageUrl !== desiredImageUrl) {
        await item.update({ imageUrl: desiredImageUrl });
      }
    }

    // Create item locations (stock items in random locations)
    for (const item of items) {
      // Find appropriate locations based on temperature
      const suitableLocations = locations.filter(loc =>
        loc.temperature === item.temperature ||
        (loc.temperature === 'ambient' && item.temperature === 'ambient')
      );

      if (suitableLocations.length > 0) {
        // Pick 1-2 random locations for each item
        const numLocations = Math.floor(Math.random() * 2) + 1;
        const selectedLocations = suitableLocations
          .sort(() => 0.5 - Math.random())
          .slice(0, numLocations);

        for (const location of selectedLocations) {
          let itemLocation = await ItemLocation.findOne({
            where: { itemId: item.id, locationId: location.id, storeId: store.id }
          });
          if (!itemLocation) {
            itemLocation = await ItemLocation.create({
              itemId: item.id,
              locationId: location.id,
              storeId: store.id,
              quantityOnHand: Math.floor(Math.random() * 50) + 5, // 5-54 units
              isPrimaryLocation: selectedLocations.indexOf(location) === 0
            });
            console.log(`Stocked ${item.name} at Aisle ${location.aisleId}, Section ${location.section}: ${itemLocation.quantityOnHand} units`);
          }
        }
      }
    }

    console.log('Inventory seed completed successfully!');
  } catch (error) {
    console.error('Error seeding inventory:', error);
  } finally {
    await sequelize.close();
  }
};

// Run the seed if this file is executed directly
if (require.main === module) {
  seedInventory();
}

module.exports = seedInventory;