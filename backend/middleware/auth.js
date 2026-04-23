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
      console.log(`[Auth] Token decoded - type: ${decoded.type}, id: ${decoded.id}`);

      if (decoded.type === 'employee' || decoded.type === 'admin') {
        req.user = await Employee.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });
        req.userType = 'employee';
        req.authType = decoded.type;
        console.log(`[Auth] Employee access - userId: ${req.user?.id}`);
      } else if (decoded.type === 'customer') {
        req.user = await Customer.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });
        req.userType = 'customer';
        console.log(`[Auth] Customer access - userId: ${req.user?.id}`);
      } else {
        console.log(`[Auth] Unknown token type: ${decoded.type}`);
      }

      if (!req.user) {
        console.log(`[Auth] User not found for id: ${decoded.id}`);
        return res.status(401).json({ message: 'Not authorized' });
      }

      if ((decoded.type === 'employee' || decoded.type === 'admin') && !req.user.isActive) {
        console.log(`[Auth] Inactive employee access denied - userId: ${decoded.id}`);
        return res.status(401).json({ message: 'Account is not active' });
      }

      next();
    } catch (error) {
      console.error('[Auth] Token verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    console.log(`[Auth] No authorization header`);
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
      if (req.authType === 'admin') {
        return next();
      }

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
