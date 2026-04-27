const { Sequelize } = require('sequelize');
require('dotenv').config();

const commonOptions = {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

const buildConnectionOptions = () => {
  const useSsl = process.env.DB_SSL !== 'false';

  if (process.env.DATABASE_URL) {
    return {
      url: process.env.DATABASE_URL,
      options: {
        ...commonOptions,
        dialectOptions: useSsl
          ? {
              ssl: {
                require: true,
                rejectUnauthorized: false
              }
            }
          : {}
      }
    };
  }

  const host = process.env.PGHOST || process.env.DB_HOST || 'localhost';
  const port = Number(process.env.PGPORT || process.env.DB_PORT || 5432);
  const database = process.env.PGDATABASE || process.env.DB_NAME || 'grocere_db';
  const username = process.env.PGUSER || process.env.DB_USER || 'postgres';
  const password = process.env.PGPASSWORD || process.env.DB_PASSWORD || '';

  return {
    url: null,
    options: {
      ...commonOptions,
      host,
      port,
      database,
      username,
      password,
      dialectOptions: useSsl
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          }
        : {}
    }
  };
};

const { url: connectionUrl, options: connectionOptions } = buildConnectionOptions();

const sequelize = connectionUrl
  ? new Sequelize(connectionUrl, connectionOptions)
  : new Sequelize(connectionOptions);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

module.exports = { sequelize, testConnection };
