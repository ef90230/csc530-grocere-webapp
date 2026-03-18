const { Cart, CartItem, Item } = require('../models');

// Get customer's cart with all items
const getCart = async (req, res) => {
  try {
    const { customerId } = req.params;

    let cart = await Cart.findOne({
      where: { customerId },
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
            }
          ]
        }
      ]
    });

    if (!cart) {
      // Create a new cart if one doesn't exist
      cart = await Cart.create({ customerId });
      cart = await Cart.findByPk(cart.id, {
        include: [
          {
            model: CartItem,
            as: 'items',
            include: [
              {
                model: Item,
                as: 'item'
              }
            ]
          }
        ]
      });
    }

    // Calculate totals
    let subtotal = 0;
    cart.items.forEach(cartItem => {
      subtotal += cartItem.item.price * cartItem.quantity;
    });

    res.json({
      success: true,
      cart: {
        ...cart.toJSON(),
        subtotal: parseFloat(subtotal.toFixed(2)),
        itemCount: cart.items.length,
        totalQuantity: cart.items.reduce((sum, ci) => sum + ci.quantity, 0)
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Server error retrieving cart' });
  }
};

// Add item to cart or increment quantity if already there
const addToCart = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { itemId, quantity = 1, notes } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    // Verify item exists
    const item = await Item.findByPk(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Get or create customer's cart
    let cart = await Cart.findOne({ where: { customerId } });
    if (!cart) {
      cart = await Cart.create({ customerId });
    }

    // Check if item already in cart
    let cartItem = await CartItem.findOne({
      where: {
        cartId: cart.id,
        itemId
      }
    });

    if (cartItem) {
      // Increment quantity
      cartItem.quantity += quantity;
      if (notes) cartItem.notes = notes;
      await cartItem.save();
    } else {
      // Create new cart item
      cartItem = await CartItem.create({
        cartId: cart.id,
        itemId,
        quantity,
        notes
      });
    }

    // Return updated cart
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
            }
          ]
        }
      ]
    });

    let subtotal = 0;
    updatedCart.items.forEach(ci => {
      subtotal += ci.item.price * ci.quantity;
    });

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      cart: {
        ...updatedCart.toJSON(),
        subtotal: parseFloat(subtotal.toFixed(2)),
        itemCount: updatedCart.items.length,
        totalQuantity: updatedCart.items.reduce((sum, ci) => sum + ci.quantity, 0)
      }
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error adding item to cart' });
  }
};

// Update cart item (quantity and/or notes)
const updateCartItem = async (req, res) => {
  try {
    const { customerId, cartItemId } = req.params;
    const { quantity, notes } = req.body;

    // Verify cart belongs to customer
    const cart = await Cart.findOne({ where: { customerId } });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Get cart item
    const cartItem = await CartItem.findOne({
      where: {
        id: cartItemId,
        cartId: cart.id
      }
    });

    if (!cartItem) {
      return res.status(404).json({ message: 'Item not in cart' });
    }

    // Update fields
    if (quantity !== undefined) {
      if (quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
      }
      cartItem.quantity = quantity;
    }

    if (notes !== undefined) {
      cartItem.notes = notes;
    }

    await cartItem.save();

    // Return updated cart
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
            }
          ]
        }
      ]
    });

    let subtotal = 0;
    updatedCart.items.forEach(ci => {
      subtotal += ci.item.price * ci.quantity;
    });

    res.json({
      success: true,
      message: 'Cart item updated',
      cart: {
        ...updatedCart.toJSON(),
        subtotal: parseFloat(subtotal.toFixed(2)),
        itemCount: updatedCart.items.length,
        totalQuantity: updatedCart.items.reduce((sum, ci) => sum + ci.quantity, 0)
      }
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ message: 'Server error updating cart item' });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { customerId, cartItemId } = req.params;

    // Verify cart belongs to customer
    const cart = await Cart.findOne({ where: { customerId } });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Get and delete cart item
    const cartItem = await CartItem.findOne({
      where: {
        id: cartItemId,
        cartId: cart.id
      }
    });

    if (!cartItem) {
      return res.status(404).json({ message: 'Item not in cart' });
    }

    await cartItem.destroy();

    // Return updated cart
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item',
              attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
            }
          ]
        }
      ]
    });

    let subtotal = 0;
    updatedCart.items.forEach(ci => {
      subtotal += ci.item.price * ci.quantity;
    });

    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: {
        ...updatedCart.toJSON(),
        subtotal: parseFloat(subtotal.toFixed(2)),
        itemCount: updatedCart.items.length,
        totalQuantity: updatedCart.items.reduce((sum, ci) => sum + ci.quantity, 0)
      }
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Server error removing item from cart' });
  }
};

// Clear entire cart
const clearCart = async (req, res) => {
  try {
    const { customerId } = req.params;

    const cart = await Cart.findOne({ where: { customerId } });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Delete all cart items
    await CartItem.destroy({ where: { cartId: cart.id } });

    // Return empty cart
    const emptyCart = await Cart.findByPk(cart.id, {
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Item,
              as: 'item'
            }
          ]
        }
      ]
    });

    res.json({
      success: true,
      message: 'Cart cleared',
      cart: {
        ...emptyCart.toJSON(),
        subtotal: 0,
        itemCount: 0,
        totalQuantity: 0
      }
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Server error clearing cart' });
  }
};

// Set store for cart (customer has decided which store to order from)
const setCartStore = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { storeId } = req.body;

    let cart = await Cart.findOne({ where: { customerId } });
    if (!cart) {
      cart = await Cart.create({ customerId, storeId });
    } else {
      cart.storeId = storeId;
      await cart.save();
    }

    res.json({
      success: true,
      message: 'Store set for cart',
      cart
    });
  } catch (error) {
    console.error('Set cart store error:', error);
    res.status(500).json({ message: 'Server error setting cart store' });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  setCartStore
};
