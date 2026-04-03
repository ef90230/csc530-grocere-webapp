const express = require('express');
const router = express.Router();
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  setCartStore
} = require('../controllers/cartController');
const { protect } = require('../middleware/auth');

// All cart routes require authentication
router.use(protect);

// Get customer's cart
router.get('/:customerId', getCart);

// Add item to cart
router.post('/:customerId/items', addToCart);

// Update cart item (quantity, notes)
router.put('/:customerId/items/:cartItemId', updateCartItem);

// Remove item from cart
router.delete('/:customerId/items/:cartItemId', removeFromCart);

// Set store for cart
router.post('/:customerId/store', setCartStore);

// Clear entire cart
router.delete('/:customerId', clearCart);

module.exports = router;

