const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Worker = require('../models/Worker');
const auth = require('../middleware/auth');

const router = express.Router();

const normalizePhone = (value = '') => value.toString().replace(/\D/g, '').slice(0, 10);

const normalizeText = (value = '') => value.toString().trim();

const normalizeSkillKey = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isMeaningfulValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return true;
};

const mergeCustomerMeasurements = (existing = {}, incoming = {}) => {
  if (!isMeaningfulValue(existing)) {
    return incoming || {};
  }

  if (!isMeaningfulValue(incoming)) {
    return existing || {};
  }

  if (typeof existing !== 'object' || typeof incoming !== 'object' || Array.isArray(existing) || Array.isArray(incoming)) {
    return incoming;
  }

  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeCustomerMeasurements(existing[key] || {}, value);
    } else if (isMeaningfulValue(value)) {
      merged[key] = value;
    }
  }

  return merged;
};

const parseCategoryList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeSkillKey(item))
      .filter(Boolean);
  }

  return value
    .toString()
    .split(',')
    .map((item) => normalizeSkillKey(item))
    .filter(Boolean);
};

const buildWorkerAssignments = (categories = [], workers = []) => {
  return categories.map((category) => {
    const matchedWorker = workers.find((worker) =>
      Array.isArray(worker.skills) &&
      worker.skills.some((skill) => normalizeSkillKey(skill) === category)
    );

    return {
      itemName: category.charAt(0).toUpperCase() + category.slice(1),
      skill: category,
      workerId: matchedWorker?._id,
      workerName: matchedWorker?.name || '',
    };
  });
};

const normalizeWorkerAssignments = (assignments = [], categories = [], workers = []) => {
  if (Array.isArray(assignments) && assignments.length > 0) {
    return assignments.map((assignment, index) => {
      const fallbackCategory = categories[index] || normalizeSkillKey(assignment.skill || assignment.itemName || '');
      const matchedWorker = assignment.workerId
        ? workers.find((worker) => worker._id.toString() === assignment.workerId.toString())
        : workers.find((worker) =>
            Array.isArray(worker.skills) &&
            worker.skills.some((skill) => normalizeSkillKey(skill) === normalizeSkillKey(assignment.skill || fallbackCategory))
          );

      return {
        itemName: assignment.itemName || (fallbackCategory.charAt(0).toUpperCase() + fallbackCategory.slice(1)),
        skill: normalizeSkillKey(assignment.skill || fallbackCategory),
        workerId: matchedWorker?._id || assignment.workerId,
        workerName: matchedWorker?.name || assignment.workerName || '',
      };
    });
  }

  return buildWorkerAssignments(categories, workers);
};

// @route   GET /api/orders
// @desc    Get all orders for user
// @access  Private
router.get('/', auth, async (req, res) => {
  console.log('ORDERS: fetch all', { userId: req.user.id });
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate('customerId', 'name phone')
      .populate('workerId', 'name skills')
      .populate('workerAssignments.workerId', 'name skills')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('ORDERS: fetch all error', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/orders/:id
// @desc    Get order by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  console.log('ORDERS: fetch by id', { id: req.params.id, userId: req.user.id });
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'name phone')
      .populate('workerId', 'name skills')
      .populate('workerAssignments.workerId', 'name skills');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   POST /api/orders
// @desc    Create an order
// @access  Private
router.post('/', [
  auth,
  body('category', 'Category is required').not().isEmpty(),
  body('dates.orderDate', 'Order date is required').not().isEmpty(),
  body('dates.deliveryDate', 'Delivery date is required').not().isEmpty(),
], async (req, res) => {
  console.log('ORDERS: create body', req.body);
  console.log('ORDERS: create', { userId: req.user.id, body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('ORDERS: create validation failed', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const normalizedPhone = normalizePhone(req.body.customerPhone);
    const normalizedName = normalizeText(req.body.customerName);
    let matchedCustomer = null;

    if (req.body.customerId) {
      matchedCustomer = await Customer.findById(req.body.customerId);
      if (!matchedCustomer) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      if (matchedCustomer.userId.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }
    } else if (normalizedPhone) {
      const nameRegex = normalizedName ? new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
      matchedCustomer = await Customer.findOne({
        userId: req.user.id,
        phone: normalizedPhone,
        ...(nameRegex ? { name: nameRegex } : {}),
      });
    }

    if (!matchedCustomer && !(normalizedName && normalizedPhone)) {
      return res.status(400).json({ message: 'customerId or customerName+customerPhone required' });
    }

    const customerData = matchedCustomer
      ? {
          customerId: matchedCustomer._id,
          customerName: matchedCustomer.name,
          customerPhone: matchedCustomer.phone,
          customerAddress: matchedCustomer.address || '',
          customerGender: matchedCustomer.gender || 'Male',
        }
      : {
          customerName: normalizedName,
          customerPhone: normalizedPhone,
          customerAddress: normalizeText(req.body.customerAddress),
          customerGender: req.body.customerGender || 'Male',
        };

    const mergedMeasurements = matchedCustomer
      ? mergeCustomerMeasurements(matchedCustomer.measurements || {}, req.body.measurements || {})
      : (req.body.measurements || {});

    const numCustomers = Number(req.body.numCustomers) || 1;

    // Scale items quantity by numCustomers if provided
    const items = req.body.items || [];
    if (items.length > 0 && numCustomers > 1) {
      items.forEach((item) => {
        item.quantity = (Number(item.quantity) || 1) * numCustomers;
        item.total = item.quantity * item.price;
      });
    }

    const categories = parseCategoryList(req.body.category);
    const userWorkers = categories.length > 0
      ? await Worker.find({ userId: req.user.id })
      : [];
    const workerAssignments = normalizeWorkerAssignments(req.body.workerAssignments, categories, userWorkers);
    const assignedWorkerIds = [...new Set(
      workerAssignments
        .map((assignment) => assignment.workerId?.toString())
        .filter(Boolean)
    )];

    const orderData = {
      userId: req.user.id,
      numCustomers,
      ...req.body,
      items,
      workerAssignments,
      workerId: req.body.workerId || (assignedWorkerIds.length === 1 ? assignedWorkerIds[0] : undefined),
      ...customerData,
      measurements: mergedMeasurements,
      dates: {
        ...req.body.dates,
        orderDate: new Date(req.body.dates.orderDate),
        deliveryDate: new Date(req.body.dates.deliveryDate),
        remindDate: req.body.dates.remindDate ? new Date(req.body.dates.remindDate) : undefined,
      },
    };

    const newOrder = new Order(orderData);
    const order = await newOrder.save();

    if (matchedCustomer) {
      matchedCustomer.name = normalizedName || matchedCustomer.name;
      matchedCustomer.phone = normalizedPhone || matchedCustomer.phone;
      matchedCustomer.address = normalizeText(req.body.customerAddress) || matchedCustomer.address || '';
      matchedCustomer.gender = req.body.customerGender || matchedCustomer.gender || 'Male';
      matchedCustomer.measurements = mergeCustomerMeasurements(matchedCustomer.measurements || {}, req.body.measurements || {});
      matchedCustomer.updatedAt = Date.now();
      await matchedCustomer.save();
    } else {
      await Customer.create({
        userId: req.user.id,
        name: normalizedName,
        phone: normalizedPhone,
        address: normalizeText(req.body.customerAddress),
        gender: req.body.customerGender || 'Male',
        measurements: req.body.measurements || {},
      });
    }

    await order.populate('customerId', 'name phone');
    await order.populate('workerId', 'name skills');
    await order.populate('workerAssignments.workerId', 'name skills');
    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/orders/:id
// @desc    Update order
// @access  Private
router.put('/:id', auth, async (req, res) => {
  console.log('ORDERS: update', { id: req.params.id, userId: req.user.id, body: req.body });
  try {
    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const categories = req.body.category ? parseCategoryList(req.body.category) : parseCategoryList(order.category);
    const userWorkers = categories.length > 0
      ? await Worker.find({ userId: req.user.id })
      : [];

    // Scale items if numCustomers changed
    const numCustomers = Number(req.body.numCustomers) || 1;
    const updateData = { ...req.body, updatedAt: Date.now() };
    if (Array.isArray(updateData.items) && updateData.items.length > 0) {
      updateData.items = updateData.items.map((item) => {
        const nextQuantity = Number(item.quantity) || 1;
        const nextPrice = Number(item.price) || 0;
        return {
          ...item,
          quantity: nextQuantity,
          price: nextPrice,
          total: nextQuantity * nextPrice,
        };
      });
    }
    updateData.workerAssignments = normalizeWorkerAssignments(
      req.body.workerAssignments || order.workerAssignments || [],
      categories,
      userWorkers
    );
    const assignedWorkerIds = [...new Set(
      (updateData.workerAssignments || [])
        .map((assignment) => assignment.workerId?.toString())
        .filter(Boolean)
    )];
    if (!req.body.workerId) {
      updateData.workerId = assignedWorkerIds.length === 1 ? assignedWorkerIds[0] : undefined;
    }
    updateData.numCustomers = numCustomers;

    order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate('customerId', 'name phone')
      .populate('workerId', 'name skills')
      .populate('workerAssignments.workerId', 'name skills');

    const normalizedPhone = normalizePhone(req.body.customerPhone || order.customerPhone);
    const normalizedName = normalizeText(req.body.customerName || order.customerName);
    const customerToSync = order.customerId
      ? await Customer.findById(order.customerId._id || order.customerId)
      : await Customer.findOne({
          userId: req.user.id,
          phone: normalizedPhone,
          ...(normalizedName ? { name: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {}),
        });

    if (customerToSync) {
      customerToSync.name = normalizedName || customerToSync.name;
      customerToSync.phone = normalizedPhone || customerToSync.phone;
      customerToSync.address = normalizeText(req.body.customerAddress || order.customerAddress) || customerToSync.address || '';
      customerToSync.gender = req.body.customerGender || order.customerGender || customerToSync.gender || 'Male';
      customerToSync.measurements = mergeCustomerMeasurements(
        customerToSync.measurements || {},
        req.body.measurements || order.measurements || {}
      );
      customerToSync.updatedAt = Date.now();
      await customerToSync.save();
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   DELETE /api/orders/:id
// @desc    Delete order
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  console.log('ORDERS: delete', { id: req.params.id, userId: req.user.id });
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await Order.findByIdAndRemove(req.params.id);
    res.json({ message: 'Order removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true }
    )
      .populate('customerId', 'name phone')
      .populate('workerId', 'name skills')
      .populate('workerAssignments.workerId', 'name skills');

    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment
// @access  Private
router.put('/:id/payment', auth, async (req, res) => {
  try {
    const { payment } = req.body;

    let order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const mergedPayment = {
      ...order.payment.toObject(),
      ...payment,
    };

    if (typeof mergedPayment.total === 'number' && typeof mergedPayment.advanceAmount === 'number') {
      mergedPayment.dueAmount = Math.max(0, mergedPayment.total - mergedPayment.advanceAmount);
    }

    order = await Order.findByIdAndUpdate(
      req.params.id,
      { payment: mergedPayment, updatedAt: Date.now() },
      { new: true }
    )
      .populate('customerId', 'name phone')
      .populate('workerId', 'name skills')
      .populate('workerAssignments.workerId', 'name skills');

    res.json(order);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
