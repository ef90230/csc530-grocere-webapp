const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;
if (process.env.NODE_ENV === 'test') {
  // In test mode, use in-memory sqlite to avoid requiring a running Postgres instance
  sequelize = new Sequelize('sqlite::memory:', {
    logging: false
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'grocere_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

module.exports = { sequelize, testConnection };
