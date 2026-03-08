const jwt = require('jsonwebtoken');
const { Employee, Customer } = require('../models');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type === 'employee') {
        req.user = await Employee.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });
        req.userType = 'employee';
      } else if (decoded.type === 'customer') {
        req.user = await Customer.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });
        req.userType = 'customer';
      }

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (req.userType !== 'employee') {
      return res.status(403).json({
        message: 'You do not have permission to perform this action'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action'
      });
    }

    next();
  };
};

const generateToken = (id, type) => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

module.exports = { protect, restrictTo, generateToken };
