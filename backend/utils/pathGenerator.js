const { Location, Aisle, Store, ItemLocation, Item } = require('../models');
const { Op } = require('sequelize');

const calculateDistance = (coord1, coord2) => {
  if (!coord1 || !coord2 || !coord1.x || !coord2.x) return 0;
  
  const dx = coord2.x - coord1.x;
  const dy = coord2.y - coord1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const normalizeTemperature = (value, fallback = 'ambient') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ambient', 'chilled', 'frozen', 'hot'].includes(normalized) ? normalized : fallback;
};

const generateOptimizedPath = async (storeId, commodity, backroomCoords) => {
  try {
    const temperature = normalizeTemperature(commodity);
    const locations = await Location.findAll({
      where: {
        storeId,
        temperature
      },
      include: [
        {
          model: Aisle,
          as: 'aisle',
          attributes: ['id', 'aisleNumber', 'aisleName', 'zone', 'coordinates']
        }
      ],
      order: [
        [{ model: Aisle, as: 'aisle' }, 'aisleNumber', 'ASC'],
        ['section', 'ASC']
      ]
    });

    if (locations.length === 0) {
      return {
        path: [],
        distance: 0,
        efficiencyScore: 0
      };
    }

    const aisleGroups = {};
    locations.forEach(location => {
      const aisleId = location.aisle.id;
      if (!aisleGroups[aisleId]) {
        aisleGroups[aisleId] = {
          aisle: location.aisle,
          locations: []
        };
      }
      aisleGroups[aisleId].locations.push(location);
    });

    const path = [];
    const aisleIds = Object.keys(aisleGroups).sort((a, b) => {
      const aisleA = aisleGroups[a].aisle;
      const aisleB = aisleGroups[b].aisle;
      
      if (aisleA.aisleNumber && aisleB.aisleNumber) {
        return aisleA.aisleNumber.localeCompare(aisleB.aisleNumber, undefined, { numeric: true });
      }
      return 0;
    });

    let shouldReverse = false;
    let totalDistance = 0;
    let previousLocation = backroomCoords;

    aisleIds.forEach(aisleId => {
      const group = aisleGroups[aisleId];
      let aisleLocations = [...group.locations];

      if (shouldReverse) {
        aisleLocations.reverse();
      }

      aisleLocations.forEach(location => {
        path.push(location.id);
        
        if (location.coordinates && previousLocation) {
          totalDistance += calculateDistance(previousLocation, location.coordinates);
          previousLocation = location.coordinates;
        }
      });

      shouldReverse = !shouldReverse;
    });

    if (previousLocation && backroomCoords) {
      totalDistance += calculateDistance(previousLocation, backroomCoords);
    }

    const averageDistancePerLocation = locations.length > 0 ? totalDistance / locations.length : 0;
    const efficiencyScore = Math.max(0, 100 - (averageDistancePerLocation * 2));

    return {
      path,
      distance: totalDistance.toFixed(2),
      efficiencyScore: efficiencyScore.toFixed(2),
      locationCount: locations.length,
      aisleCount: aisleIds.length
    };
  } catch (error) {
    console.error('Error generating optimized path:', error);
    throw error;
  }
};

const generateAllPaths = async (storeId) => {
  try {
    const store = await Store.findByPk(storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    const backroomCoords = store.backroomDoorLocation || { x: 0, y: 0 };
    const commodities = ['ambient', 'chilled', 'frozen', 'hot'];
    
    const paths = {};
    
    for (const commodity of commodities) {
      const pathData = await generateOptimizedPath(storeId, commodity, backroomCoords);
      paths[commodity] = pathData;
    }

    return paths;
  } catch (error) {
    console.error('Error generating all paths:', error);
    throw error;
  }
};

const generateAvailableLocationPath = async (storeId, commodity, backroomCoords) => {
  const temperature = commodity ? normalizeTemperature(commodity) : null;
  const stockedLocations = await ItemLocation.findAll({
    where: {
      storeId,
      quantityOnHand: { [Op.gt]: 0 }
    },
    include: [
      {
        model: Item,
        as: 'item',
        where: {
          isActive: true,
          ...(temperature ? { temperature } : {})
        },
        attributes: ['id', 'commodity', 'temperature', 'name']
      },
      {
        model: Location,
        as: 'location',
        where: temperature ? { temperature } : undefined,
        include: [
          {
            model: Aisle,
            as: 'aisle',
            attributes: ['id', 'aisleNumber', 'aisleName', 'zone', 'coordinates']
          }
        ]
      }
    ]
  });

  const uniqueLocations = [];
  const seenLocationIds = new Set();
  for (const record of stockedLocations) {
    const location = record.location;
    if (!location || seenLocationIds.has(location.id)) {
      continue;
    }
    seenLocationIds.add(location.id);
    uniqueLocations.push(location);
  }

  if (uniqueLocations.length === 0) {
    return {
      path: [],
      distance: 0,
      efficiencyScore: 0,
      locationCount: 0,
      aisleCount: 0
    };
  }

  const aisleGroups = {};
  uniqueLocations.forEach(location => {
    const aisleId = location.aisle.id;
    if (!aisleGroups[aisleId]) {
      aisleGroups[aisleId] = {
        aisle: location.aisle,
        locations: []
      };
    }
    aisleGroups[aisleId].locations.push(location);
  });

  const path = [];
  const aisleIds = Object.keys(aisleGroups).sort((a, b) => {
    const aisleA = aisleGroups[a].aisle;
    const aisleB = aisleGroups[b].aisle;

    if (aisleA.aisleNumber && aisleB.aisleNumber) {
      return aisleA.aisleNumber.localeCompare(aisleB.aisleNumber, undefined, { numeric: true });
    }
    return 0;
  });

  let shouldReverse = false;
  let totalDistance = 0;
  let previousLocation = backroomCoords;

  aisleIds.forEach(aisleId => {
    const group = aisleGroups[aisleId];
    const sortedInAisle = [...group.locations].sort((a, b) => {
      if (!a.section || !b.section) return 0;
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    });

    const aisleLocations = shouldReverse ? sortedInAisle.reverse() : sortedInAisle;

    aisleLocations.forEach(location => {
      path.push(location.id);
      if (location.coordinates && previousLocation) {
        totalDistance += calculateDistance(previousLocation, location.coordinates);
        previousLocation = location.coordinates;
      }
    });

    shouldReverse = !shouldReverse;
  });

  if (previousLocation && backroomCoords) {
    totalDistance += calculateDistance(previousLocation, backroomCoords);
  }

  const averageDistancePerLocation = totalDistance / uniqueLocations.length;
  const efficiencyScore = Math.max(0, 100 - (averageDistancePerLocation * 2));

  return {
    path,
    distance: totalDistance.toFixed(2),
    efficiencyScore: efficiencyScore.toFixed(2),
    locationCount: uniqueLocations.length,
    aisleCount: aisleIds.length
  };
};

const buildLinkedList = (pathSequence) => {
  const nodes = pathSequence.map((locationId, index) => ({
    locationId,
    nextLocationId: index < pathSequence.length - 1 ? pathSequence[index + 1] : null
  }));

  return {
    head: nodes.length > 0 ? nodes[0].locationId : null,
    length: nodes.length,
    nodes
  };
};

const validatePath = (pathSequence, locationIds) => {
  const pathSet = new Set(pathSequence);
  const missingLocations = locationIds.filter(id => !pathSet.has(id));
  
  const duplicates = pathSequence.filter((id, index) => pathSequence.indexOf(id) !== index);
  
  return {
    isValid: missingLocations.length === 0 && duplicates.length === 0,
    missingLocations,
    duplicates,
    coverage: ((pathSequence.length - duplicates.length) / locationIds.length * 100).toFixed(2)
  };
};

const calculatePathMetrics = async (pathSequence, storeId) => {
  try {
    if (pathSequence.length === 0) {
      return { totalDistance: 0, averageDistance: 0, backtracking: 0 };
    }

    const locations = await Location.findAll({
      where: {
        id: { [Op.in]: pathSequence },
        storeId
      }
    });

    const locationMap = {};
    locations.forEach(loc => {
      locationMap[loc.id] = loc;
    });

    let totalDistance = 0;
    let backtrackingCount = 0;
    const visitedAisles = new Set();

    for (let i = 0; i < pathSequence.length - 1; i++) {
      const currentLoc = locationMap[pathSequence[i]];
      const nextLoc = locationMap[pathSequence[i + 1]];

      if (currentLoc && nextLoc && currentLoc.coordinates && nextLoc.coordinates) {
        totalDistance += calculateDistance(currentLoc.coordinates, nextLoc.coordinates);

        if (visitedAisles.has(currentLoc.aisleId) && currentLoc.aisleId !== nextLoc.aisleId) {
          backtrackingCount++;
        }
        visitedAisles.add(currentLoc.aisleId);
      }
    }

    const averageDistance = totalDistance / (pathSequence.length - 1);

    return {
      totalDistance: totalDistance.toFixed(2),
      averageDistance: averageDistance.toFixed(2),
      backtrackingCount,
      locationCount: pathSequence.length
    };
  } catch (error) {
    console.error('Error calculating path metrics:', error);
    throw error;
  }
};

module.exports = {
  generateOptimizedPath,
  generateAllPaths,
  generateAvailableLocationPath,
  buildLinkedList,
  validatePath,
  calculatePathMetrics,
  calculateDistance
};
