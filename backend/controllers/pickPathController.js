const { PickPath, Store, Location, Aisle } = require('../models');
const {
  generateOptimizedPath,
  generateAllPaths,
  generateAvailableLocationPath,
  buildLinkedList,
  validatePath,
  calculatePathMetrics
} = require('../utils/pathGenerator');
const { analyzePathWithAI, evaluatePath } = require('../services/aiPathService');

const VALID_PATH_TEMPERATURES = new Set(['ambient', 'chilled', 'frozen', 'hot']);

const normalizePathTemperature = (value, fallback = 'ambient') => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_PATH_TEMPERATURES.has(normalized) ? normalized : fallback;
};

const validateAndNormalizePathSequence = async ({ storeId, commodity, pathSequence }) => {
  if (!Array.isArray(pathSequence)) {
    throw new Error('pathSequence must be an array');
  }

  const normalizedCommodity = normalizePathTemperature(commodity);
  const uniqueLocationIds = Array.from(new Set(
    pathSequence
      .map((locationId) => Number(locationId))
      .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
  ));

  const locations = await Location.findAll({
    where: {
      id: uniqueLocationIds,
      storeId
    },
    attributes: ['id', 'temperature']
  });

  const locationById = new Map(locations.map((location) => [Number(location.id), location]));
  const nextPathSequence = [];
  const seenLocationIds = new Set();

  for (const rawLocationId of pathSequence) {
    const locationId = Number(rawLocationId);
    if (!Number.isInteger(locationId) || locationId < 1 || seenLocationIds.has(locationId)) {
      continue;
    }

    const location = locationById.get(locationId);
    if (!location) {
      continue;
    }

    if (normalizePathTemperature(location.temperature) !== normalizedCommodity) {
      continue;
    }

    seenLocationIds.add(locationId);
    nextPathSequence.push(locationId);
  }

  return nextPathSequence;
};

const normalizeStoredPickPath = async (pickPath) => {
  const normalizedSequence = await validateAndNormalizePathSequence({
    storeId: pickPath.storeId,
    commodity: pickPath.commodity,
    pathSequence: pickPath.pathSequence
  });

  const existingSequence = Array.isArray(pickPath.pathSequence) ? pickPath.pathSequence.map((locationId) => Number(locationId)) : [];
  const hasChanged = normalizedSequence.length !== existingSequence.length
    || normalizedSequence.some((locationId, index) => locationId !== existingSequence[index]);

  if (hasChanged) {
    await pickPath.update({ pathSequence: normalizedSequence });
    pickPath.set('pathSequence', normalizedSequence);
  }

  return pickPath;
};

const getPickPaths = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { commodity, isActive } = req.query;

    const where = { storeId };
    if (commodity) where.commodity = commodity;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const pickPaths = await PickPath.findAll({
      where,
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name']
        }
      ],
      order: [['commodity', 'ASC'], ['createdAt', 'DESC']]
    });

    await Promise.all(pickPaths.map((pickPath) => normalizeStoredPickPath(pickPath)));

    res.json({
      success: true,
      count: pickPaths.length,
      pickPaths
    });
  } catch (error) {
    console.error('Get pick paths error:', error);
    res.status(500).json({ message: 'Server error retrieving pick paths' });
  }
};

const getPickPath = async (req, res) => {
  try {
    const pickPath = await PickPath.findByPk(req.params.id, {
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'storeNumber', 'name', 'backroomDoorLocation']
        }
      ]
    });

    if (!pickPath) {
      return res.status(404).json({ message: 'Pick path not found' });
    }

    await normalizeStoredPickPath(pickPath);

    const locations = await Location.findAll({
      where: {
        id: pickPath.pathSequence
      },
      include: [
        {
          model: Aisle,
          as: 'aisle',
          attributes: ['id', 'aisleNumber', 'aisleName']
        }
      ]
    });

    const sortedLocations = pickPath.pathSequence.map(locId =>
      locations.find(loc => loc.id === locId)
    ).filter(loc => loc !== undefined);

    res.json({
      success: true,
      pickPath: {
        ...pickPath.toJSON(),
        locations: sortedLocations
      }
    });
  } catch (error) {
    console.error('Get pick path error:', error);
    res.status(500).json({ message: 'Server error retrieving pick path' });
  }
};

const generatePickPath = async (req, res) => {
  try {
    const { storeId, commodity, pathName, userId } = req.body;

    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const backroomCoords = store.backroomDoorLocation || { x: 0, y: 0 };

    const pathData = await generateOptimizedPath(storeId, commodity, backroomCoords);

    if (pathData.path.length === 0) {
      return res.status(400).json({
        message: `No locations found for commodity type: ${commodity}`,
        suggestion: 'Add item locations for this commodity first'
      });
    }

    const pickPath = await PickPath.create({
      storeId,
      commodity,
      pathName: pathName || `AI-Generated ${commodity} Path`,
      pathSequence: pathData.path,
      isAiGenerated: true,
      efficiencyScore: pathData.efficiencyScore,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      pickPath,
      metrics: {
        distance: pathData.distance,
        efficiencyScore: pathData.efficiencyScore,
        locationCount: pathData.locationCount,
        aisleCount: pathData.aisleCount
      }
    });
  } catch (error) {
    console.error('Generate pick path error:', error);
    res.status(500).json({ message: 'Server error generating pick path' });
  }
};

const generateAllPickPaths = async (req, res) => {
  try {
    const { storeId, userId } = req.body;

    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const allPaths = await generateAllPaths(storeId);
    const createdPaths = [];

    for (const [commodity, pathData] of Object.entries(allPaths)) {
      if (pathData.path.length > 0) {
        const pickPath = await PickPath.create({
          storeId,
          commodity,
          pathName: `AI-Generated ${commodity} Path`,
          pathSequence: pathData.path,
          isAiGenerated: true,
          efficiencyScore: pathData.efficiencyScore,
          createdBy: userId
        });
        createdPaths.push({
          pickPath,
          metrics: pathData
        });
      }
    }

    res.status(201).json({
      success: true,
      count: createdPaths.length,
      paths: createdPaths
    });
  } catch (error) {
    console.error('Generate all pick paths error:', error);
    res.status(500).json({ message: 'Server error generating pick paths' });
  }
};

const createPickPath = async (req, res) => {
  try {
    const { storeId, commodity, pathName, pathSequence } = req.body;
    const createdBy = req.user ? req.user.id : null;
    const normalizedCommodity = normalizePathTemperature(commodity);

    // Enforce one-path-per-temperature-type per store
    const existing = await PickPath.findOne({ where: { storeId, commodity: normalizedCommodity } });
    if (existing) {
      return res.status(409).json({
        message: `A ${normalizedCommodity} path already exists for this store. Delete it first to create a new one.`
      });
    }

    const normalizedPathSequence = await validateAndNormalizePathSequence({
      storeId,
      commodity: normalizedCommodity,
      pathSequence
    });

    if (normalizedPathSequence.length === 0) {
      return res.status(400).json({
        message: `Pick paths must use sections with the ${normalizedCommodity} temperature type.`
      });
    }

    let metrics = { averageDistance: 0 };
    try {
      metrics = await calculatePathMetrics(normalizedPathSequence, storeId);
    } catch (e) {
      // Non-fatal: path is saved without metrics
    }
    const efficiencyScore = Math.max(0, 100 - (parseFloat(metrics.averageDistance) * 2));

    const pickPath = await PickPath.create({
      storeId,
      commodity: normalizedCommodity,
      pathName,
      pathSequence: normalizedPathSequence,
      isAiGenerated: false,
      efficiencyScore: efficiencyScore.toFixed(2),
      createdBy
    });

    res.status(201).json({
      success: true,
      pickPath,
      metrics
    });
  } catch (error) {
    console.error('Create pick path error:', error);
    res.status(500).json({ message: 'Server error creating pick path' });
  }
};

const updatePickPath = async (req, res) => {
  try {
    const pickPath = await PickPath.findByPk(req.params.id);

    if (!pickPath) {
      return res.status(404).json({ message: 'Pick path not found' });
    }

    const nextCommodity = req.body?.commodity ? normalizePathTemperature(req.body.commodity) : pickPath.commodity;
    const { pathSequence } = req.body;

    if (pathSequence) {
      const normalizedPathSequence = await validateAndNormalizePathSequence({
        storeId: pickPath.storeId,
        commodity: nextCommodity,
        pathSequence
      });

      if (normalizedPathSequence.length === 0) {
        return res.status(400).json({
          message: `Pick paths must use sections with the ${nextCommodity} temperature type.`
        });
      }

      req.body.pathSequence = normalizedPathSequence;
      req.body.commodity = nextCommodity;

      try {
        const metrics = await calculatePathMetrics(normalizedPathSequence, pickPath.storeId);
        const efficiencyScore = Math.max(0, 100 - (parseFloat(metrics.averageDistance) * 2));
        req.body.efficiencyScore = efficiencyScore.toFixed(2);
      } catch (e) {
        // Non-fatal: efficiency score will not be updated
      }
    } else if (req.body?.commodity) {
      req.body.commodity = nextCommodity;
    }

    await pickPath.update(req.body);

    res.json({
      success: true,
      pickPath
    });
  } catch (error) {
    console.error('Update pick path error:', error);
    res.status(500).json({ message: 'Server error updating pick path' });
  }
};

const deletePickPath = async (req, res) => {
  try {
    const pickPath = await PickPath.findByPk(req.params.id);

    if (!pickPath) {
      return res.status(404).json({ message: 'Pick path not found' });
    }

    await pickPath.destroy();

    res.json({
      success: true,
      message: 'Pick path deleted successfully'
    });
  } catch (error) {
    console.error('Delete pick path error:', error);
    res.status(500).json({ message: 'Server error deleting pick path' });
  }
};

const activatePickPath = async (req, res) => {
  try {
    const pickPath = await PickPath.findByPk(req.params.id);

    if (!pickPath) {
      return res.status(404).json({ message: 'Pick path not found' });
    }

    await PickPath.update(
      { isActive: false },
      {
        where: {
          storeId: pickPath.storeId,
          commodity: pickPath.commodity
        }
      }
    );

    await pickPath.update({ isActive: true });

    res.json({
      success: true,
      message: 'Pick path activated successfully',
      pickPath
    });
  } catch (error) {
    console.error('Activate pick path error:', error);
    res.status(500).json({ message: 'Server error activating pick path' });
  }
};

const generateLinkedListPath = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { commodity } = req.query;

    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const backroomCoords = store.backroomDoorLocation || { x: 0, y: 0 };
    const pathData = await generateAvailableLocationPath(storeId, commodity, backroomCoords);

    if (pathData.path.length === 0) {
      return res.status(404).json({
        message: 'No in-stock locations found for linked-list generation'
      });
    }

    const linkedList = buildLinkedList(pathData.path);

    res.json({
      success: true,
      storeId,
      commodity: commodity || 'all',
      linkedList,
      metrics: {
        distance: pathData.distance,
        efficiencyScore: pathData.efficiencyScore,
        locationCount: pathData.locationCount,
        aisleCount: pathData.aisleCount
      }
    });
  } catch (error) {
    console.error('Generate linked-list path error:', error);
    res.status(500).json({ message: 'Server error generating linked-list path' });
  }
};

const generateAIPickPath = async (req, res) => {
  try {
    const { storeId, commodity, pathName, userId, existingPathSequence, savePath } = req.body;

    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const backroomCoords = store.backroomDoorLocation || { x: 0, y: 0 };
    const candidate = await generateAvailableLocationPath(storeId, commodity, backroomCoords);

    if (candidate.path.length === 0) {
      return res.status(400).json({
        message: `No stocked locations found for commodity: ${commodity || 'all'}`
      });
    }

    const locations = await Location.findAll({
      where: { id: candidate.path },
      include: [
        {
          model: Aisle,
          as: 'aisle',
          attributes: ['id', 'aisleNumber', 'aisleName', 'category']
        }
      ]
    });

    const metrics = await evaluatePath({
      storeId,
      pathSequence: candidate.path
    });

    const aiAnalysis = await analyzePathWithAI({
      storeId,
      commodity,
      candidatePath: candidate.path,
      existingPath: existingPathSequence,
      locations,
      metrics
    });

    const linkedList = buildLinkedList(aiAnalysis.suggestedPath);
    let savedPickPath = null;

    if (savePath === true) {
      savedPickPath = await PickPath.create({
        storeId,
        commodity: commodity || 'ambient',
        pathName: pathName || `AI API Suggested ${commodity || 'Mixed'} Path`,
        pathSequence: aiAnalysis.suggestedPath,
        isAiGenerated: true,
        efficiencyScore: candidate.efficiencyScore,
        createdBy: userId
      });
    }

    res.status(201).json({
      success: true,
      provider: aiAnalysis.provider,
      suggestedPath: aiAnalysis.suggestedPath,
      linkedList,
      weakPoints: aiAnalysis.weakPoints,
      recommendations: aiAnalysis.recommendations,
      rationale: aiAnalysis.rationale,
      metrics,
      savedPickPath
    });
  } catch (error) {
    console.error('Generate AI pick path error:', error);
    res.status(500).json({ message: 'Server error generating AI pick path' });
  }
};

module.exports = {
  getPickPaths,
  getPickPath,
  generatePickPath,
  generateAllPickPaths,
  generateLinkedListPath,
  generateAIPickPath,
  createPickPath,
  updatePickPath,
  deletePickPath,
  activatePickPath
};
