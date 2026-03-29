const express = require('express');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const auth = require('../middleware/auth');

const router = express.Router();

const normalizePhone = (value = '') => value.toString().replace(/\D/g, '').slice(0, 10);
const normalizeText = (value = '') => value.toString().trim();

// @route   GET /api/customers
// @desc    Get all customers for user with search
// @access  Private
router.get('/', auth, async (req, res) => {
  console.log('CUSTOMERS: fetch all', { userId: req.user.id, query: req.query });
  try {
    const { search } = req.query;
    let query = { userId: req.user.id };

    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: customers.length,
      customers
    });
  } catch (err) {
    console.error('CUSTOMERS: get all error', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error fetching customers'
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Get customer by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  console.log('CUSTOMERS: fetch by id', { id: req.params.id, userId: req.user.id });
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer belongs to user
    if (customer.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this customer'
      });
    }

    res.json({
      success: true,
      customer
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error fetching customer'
    });
  }
});

// @route   POST /api/customers
// @desc    Create a customer
// @access  Private
router.post('/', [
  auth,
  body('name', 'Name is required').not().isEmpty(),
  body('phone', 'Phone is required').not().isEmpty(),
], async (req, res) => {
  console.log('CUSTOMERS: create request', { userId: req.user.id, body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { name, phone, address, gender, measurements } = req.body;

  try {
    const normalizedPhone = normalizePhone(phone);
    const normalizedName = normalizeText(name);
    const newCustomer = new Customer({
      userId: req.user.id,
      name: normalizedName,
      phone: normalizedPhone,
      address: normalizeText(address),
      gender: gender || 'Male',
      measurements,
    });

    const customer = await newCustomer.save();
    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error creating customer'
    });
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private
router.put('/:id', auth, async (req, res) => {
  console.log('CUSTOMERS: update', { id: req.params.id, body: req.body, userId: req.user.id });
  try {
    let customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer belongs to user
    if (customer.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this customer'
      });
    }

    const updates = { ...req.body };
    if (updates.name) {
      updates.name = normalizeText(updates.name);
    }
    if (updates.phone) {
      updates.phone = normalizePhone(updates.phone);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'address')) {
      updates.address = normalizeText(updates.address);
    }

    customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: Date.now() },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating customer'
    });
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete customer
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  console.log('CUSTOMERS: delete', { id: req.params.id, userId: req.user.id });
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer belongs to user
    if (customer.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this customer'
      });
    }

    await Customer.findByIdAndDelete(req.params.id);
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting customer'
    });
  }
});

// @route   POST /api/customers/search
// @desc    Search customers and their recent orders for measurement prefill
// @access  Private
router.post('/search', auth, async (req, res) => {
  console.log('CUSTOMERS: search', { userId: req.user.id, body: req.body });
  try {
    const { searchTerm } = req.body;
    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'searchTerm with at least 2 characters required'
      });
    }

    const normalizedSearch = searchTerm.trim();
    const phoneSearch = normalizePhone(normalizedSearch);
    const query = {
      userId: req.user.id,
      $or: phoneSearch.length >= 10 
        ? [{ phone: phoneSearch }]
        : [{ name: { $regex: normalizedSearch, $options: 'i' } }]
    };

    // Search customers first
    const customers = await Customer.find(query)
      .sort({ updatedAt: -1 })
      .limit(10);

    // For each customer, find most recent order with measurements
    const results = [];
    for (const customer of customers) {
      const recentOrder = await Order.findOne({
        userId: req.user.id,
        customerId: customer._id,
        measurements: { $exists: true, $ne: {} }
      }).sort({ updatedAt: -1 }).lean();

      results.push({
        customer: {
          id: customer._id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          gender: customer.gender || 'Male',
          measurements: customer.measurements || {}
        },
        recentOrder: recentOrder || null
      });
    }

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (err) {
    console.error('CUSTOMERS: search error', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error during search'
    });
  }
});

module.exports = router;
