const { Cart, CartItem, Item, ItemLocation } = require('../models');

const cartItemInclude = [
  {
    model: Item,
    as: 'item',
    attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
  },
  {
    model: Item,
    as: 'substitutionItem',
    attributes: ['id', 'name', 'upc', 'price', 'imageUrl']
  }
];

const getItemOnHandTotal = async (itemId, storeId = null) => {
  const item = await Item.findByPk(itemId, {
    attributes: ['unassignedQuantity']
  });

  const where = { itemId };
  if (storeId) {
    where.storeId = storeId;
  }

  const itemLocations = await ItemLocation.findAll({
    where,
    attributes: ['quantityOnHand']
  });

  const assignedQuantity = itemLocations.reduce(
    (sum, locationRow) => sum + Number(locationRow.quantityOnHand || 0),
    0
  );
  const unassignedQuantity = Number(item?.unassignedQuantity || 0);

  return assignedQuantity + Math.max(0, unassignedQuantity);
};

const formatCartResponse = (cart) => {
  let subtotal = 0;
  (cart.items || []).forEach((cartItem) => {
    subtotal += Number(cartItem?.item?.price || 0) * Number(cartItem?.quantity || 0);
  });

  return {
    ...cart.toJSON(),
    subtotal: parseFloat(subtotal.toFixed(2)),
    itemCount: (cart.items || []).length,
    totalQuantity: (cart.items || []).reduce((sum, ci) => sum + Number(ci.quantity || 0), 0)
  };
};

const refreshCartWithItems = async (cartId) => Cart.findByPk(cartId, {
  include: [
    {
      model: CartItem,
      as: 'items',
      include: cartItemInclude
    }
  ]
});

const removeUnavailableCartItems = async (cart) => {
  if (!cart?.id || !Array.isArray(cart.items) || cart.items.length === 0) {
    return cart;
  }

  let removedAnyItems = false;

  for (const cartItem of cart.items) {
    const onHandTotal = await getItemOnHandTotal(cartItem.itemId, cart.storeId || null);
    if (onHandTotal <= 0) {
      await cartItem.destroy();
      removedAnyItems = true;
    }
  }

  if (!removedAnyItems) {
    return cart;
  }

  return refreshCartWithItems(cart.id);
};

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
          include: cartItemInclude
        }
      ]
    });

    if (!cart) {
      // Create a new cart if one doesn't exist
      cart = await Cart.create({ customerId });
      cart = await refreshCartWithItems(cart.id);
    }

    cart = await removeUnavailableCartItems(cart);

    res.json({
      success: true,
      cart: formatCartResponse(cart)
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

    const onHandTotal = await getItemOnHandTotal(itemId, cart.storeId || null);
    if (onHandTotal <= 0) {
      return res.status(400).json({ message: 'Item is out of stock' });
    }

    // Check if item already in cart
    let cartItem = await CartItem.findOne({
      where: {
        cartId: cart.id,
        itemId
      }
    });

    const existingQuantity = Number(cartItem?.quantity || 0);
    if ((existingQuantity + Number(quantity || 0)) > onHandTotal) {
      return res.status(400).json({ message: 'Requested quantity exceeds current stock' });
    }

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
    const updatedCart = await refreshCartWithItems(cart.id);

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      cart: formatCartResponse(updatedCart)
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
    const { quantity, notes, substitutionItemId, substitutionQuantity, clearSubstitution } = req.body;

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

      const onHandTotal = await getItemOnHandTotal(cartItem.itemId, cart.storeId || null);
      if (quantity > onHandTotal) {
        return res.status(400).json({ message: 'Requested quantity exceeds current stock' });
      }

      cartItem.quantity = quantity;
    }

    if (notes !== undefined) {
      cartItem.notes = notes;
    }

    if (clearSubstitution === true) {
      cartItem.substitutionItemId = null;
      cartItem.substitutionQuantity = null;
    }

    if (substitutionItemId !== undefined && substitutionItemId !== null) {
      const substitutionItem = await Item.findByPk(substitutionItemId);
      if (!substitutionItem) {
        return res.status(404).json({ message: 'Substitution item not found' });
      }

      const resolvedSubstitutionQuantity = Number(substitutionQuantity || 1);
      if (resolvedSubstitutionQuantity < 1) {
        return res.status(400).json({ message: 'Substitution quantity must be at least 1' });
      }

      cartItem.substitutionItemId = substitutionItemId;
      cartItem.substitutionQuantity = resolvedSubstitutionQuantity;
    }

    await cartItem.save();

    // Return updated cart
    const updatedCart = await refreshCartWithItems(cart.id);

    res.json({
      success: true,
      message: 'Cart item updated',
      cart: formatCartResponse(updatedCart)
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
    const updatedCart = await refreshCartWithItems(cart.id);

    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: formatCartResponse(updatedCart)
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
    const emptyCart = await refreshCartWithItems(cart.id);

    res.json({
      success: true,
      message: 'Cart cleared',
      cart: formatCartResponse(emptyCart)
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
