const { PickPath, Store, Location, Aisle } = require('../models');
const {
  generateOptimizedPath,
  generateAllPaths,
  validatePath,
  calculatePathMetrics
} = require('../utils/pathGenerator');

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
    const { storeId, commodity, pathName, pathSequence, userId } = req.body;

    const locations = await Location.findAll({
      where: {
        storeId,
        commodity
      }
    });

    const validation = validatePath(
      pathSequence,
      locations.map(loc => loc.id)
    );

    if (!validation.isValid) {
      return res.status(400).json({
        message: 'Invalid path sequence',
        validation
      });
    }

    const metrics = await calculatePathMetrics(pathSequence, storeId);
    const efficiencyScore = Math.max(0, 100 - (parseFloat(metrics.averageDistance) * 2));

    const pickPath = await PickPath.create({
      storeId,
      commodity,
      pathName,
      pathSequence,
      isAiGenerated: false,
      efficiencyScore: efficiencyScore.toFixed(2),
      createdBy: userId
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

    const { pathSequence } = req.body;

    if (pathSequence) {
      const metrics = await calculatePathMetrics(pathSequence, pickPath.storeId);
      const efficiencyScore = Math.max(0, 100 - (parseFloat(metrics.averageDistance) * 2));
      req.body.efficiencyScore = efficiencyScore.toFixed(2);
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

module.exports = {
  getPickPaths,
  getPickPath,
  generatePickPath,
  generateAllPickPaths,
  createPickPath,
  updatePickPath,
  deletePickPath,
  activatePickPath
};
