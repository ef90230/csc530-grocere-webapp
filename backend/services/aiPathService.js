const { calculatePathMetrics } = require('../utils/pathGenerator');
const nodeFetch = require('node-fetch');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const extractJsonObject = (text) => {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
};

const buildHeuristicWeakPoints = (metrics) => {
  const weakPoints = [];

  if (Number(metrics.backtrackingCount || 0) > 0) {
    weakPoints.push({
      area: 'backtracking',
      severity: 'high',
      issue: `Path has ${metrics.backtrackingCount} backtracking transitions` 
    });
  }

  if (Number(metrics.averageDistance || 0) > 20) {
    weakPoints.push({
      area: 'distance',
      severity: 'medium',
      issue: `Average hop distance is ${metrics.averageDistance}`
    });
  }

  if (weakPoints.length === 0) {
    weakPoints.push({
      area: 'overall',
      severity: 'low',
      issue: 'No major weak points detected by heuristic analysis'
    });
  }

  return weakPoints;
};

const callGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const fetchClient = typeof fetch === 'function' ? fetch : nodeFetch;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetchClient(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJsonObject(content);
};

const analyzePathWithAI = async ({
  storeId,
  commodity,
  candidatePath,
  existingPath,
  locations,
  metrics
}) => {
  const locationSummary = locations.slice(0, 120).map(loc => ({
    id: loc.id,
    aisleId: loc.aisleId,
    section: loc.section,
    coordinates: loc.coordinates
  }));

  const prompt = [
    'You are a grocery fulfillment path optimization assistant.',
    'Return strict JSON with keys: suggestedPath, weakPoints, recommendations, rationale.',
    'suggestedPath must only include location IDs from validLocationIds and should avoid backtracking.',
    'weakPoints must be an array of objects with area, severity, issue.',
    `storeId: ${storeId}`,
    `commodity: ${commodity || 'all'}`,
    `validLocationIds: ${JSON.stringify(locationSummary.map(l => l.id))}`,
    `existingPath: ${JSON.stringify(existingPath || [])}`,
    `candidatePath: ${JSON.stringify(candidatePath)}`,
    `metrics: ${JSON.stringify(metrics)}`,
    `locations: ${JSON.stringify(locationSummary)}`
  ].join('\n');

  let aiResult = null;
  let provider = 'heuristic';

  try {
    aiResult = await callGemini(prompt);
    if (aiResult) {
      provider = 'gemini';
    }
  } catch (error) {
    aiResult = null;
  }

  const validLocationIdSet = new Set(locationSummary.map(l => l.id));
  const suggestedPath = Array.isArray(aiResult?.suggestedPath)
    ? aiResult.suggestedPath.filter(id => validLocationIdSet.has(id))
    : candidatePath;

  return {
    provider,
    suggestedPath: suggestedPath.length > 0 ? suggestedPath : candidatePath,
    weakPoints: Array.isArray(aiResult?.weakPoints)
      ? aiResult.weakPoints
      : buildHeuristicWeakPoints(metrics),
    recommendations: Array.isArray(aiResult?.recommendations)
      ? aiResult.recommendations
      : [
          'Group high-frequency items into adjacent aisle sections.',
          'Reduce cross-aisle jumps to lower average walking distance.'
        ],
    rationale: aiResult?.rationale || 'AI provider unavailable or no valid JSON returned; using heuristic analysis.'
  };
};

const evaluatePath = async ({ storeId, pathSequence }) => {
  const metrics = await calculatePathMetrics(pathSequence, storeId);
  return metrics;
};

module.exports = {
  analyzePathWithAI,
  evaluatePath
};
