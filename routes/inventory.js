const express = require('express');
const { body, validationResult } = require('express-validator');
const Inventory = require('../models/Inventory');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/inventory
// @desc    Get all inventory items for user
// @access  Private
router.get('/', auth, async (req, res) => {
  console.log('INVENTORY: fetch all', { userId: req.user.id });
  try {
    const inventory = await Inventory.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(inventory);
  } catch (err) {
    console.error('INVENTORY: error fetch all', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/inventory/:id
// @desc    Get inventory item by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Check if item belongs to user
    if (item.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(item);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   POST /api/inventory
// @desc    Create an inventory item
// @access  Private
router.post('/', [
  auth,
  body('name', 'Name is required').not().isEmpty(),
  body('category', 'Category is required').not().isEmpty(),
  body('quantity', 'Quantity is required').isNumeric(),
  body('price', 'Price is required').isNumeric(),
], async (req, res) => {
  console.log('INVENTORY: create request', { userId: req.user.id, body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('INVENTORY: validation errors', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, category, quantity, unit, price, supplier } = req.body;

  try {
    const newItem = new Inventory({
      userId: req.user.id,
      name,
      category,
      quantity,
      unit,
      price,
      supplier,
    });

    const item = await newItem.save();
    res.json(item);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/inventory/:id
// @desc    Update inventory item
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Check if item belongs to user
    if (item.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    item = await Inventory.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );

    res.json(item);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   DELETE /api/inventory/:id
// @desc    Delete inventory item
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Check if item belongs to user
    if (item.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await Inventory.findByIdAndRemove(req.params.id);
    res.json({ message: 'Inventory item removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;