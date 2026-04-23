const fs = require('fs');
const path = require('path');

const DEFAULT_RUNTIME_DATA_DIR = path.join(__dirname, '..', '.runtime-data');
const LEGACY_DATABASE_DIR = path.join(__dirname, '..', 'database');

const resolveRuntimeDataDir = () => {
  const configuredPath = String(process.env.RUNTIME_DATA_DIR || '').trim();
  return configuredPath ? path.resolve(configuredPath) : DEFAULT_RUNTIME_DATA_DIR;
};

const getRuntimeDataFilePath = (fileName) => {
  const normalizedFileName = String(fileName || '').trim();
  if (!normalizedFileName) {
    throw new Error('A file name is required for runtime data path resolution.');
  }

  const runtimeDir = resolveRuntimeDataDir();
  const runtimePath = path.join(runtimeDir, normalizedFileName);
  const runtimePathDir = path.dirname(runtimePath);

  if (!fs.existsSync(runtimePathDir)) {
    fs.mkdirSync(runtimePathDir, { recursive: true });
  }

  const legacyPath = path.join(LEGACY_DATABASE_DIR, normalizedFileName);
  if (!fs.existsSync(runtimePath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, runtimePath);
  }

  return runtimePath;
};

module.exports = {
  getRuntimeDataFilePath,
  resolveRuntimeDataDir
};
