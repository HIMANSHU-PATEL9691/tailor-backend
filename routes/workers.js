const express = require('express');
const { body, validationResult } = require('express-validator');
const Worker = require('../models/Worker');
const auth = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/workers
// @desc    Get all workers for user
// @access  Private
router.get('/', auth, async (req, res) => {
  console.log('WORKERS: fetch all', { userId: req.user.id });
  try {
    const workers = await Worker.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    console.error('WORKERS: error fetch all', err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/workers/:id
// @desc    Get worker by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    // Check if worker belongs to user
    if (worker.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(worker);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Worker not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   POST /api/workers
// @desc    Create a worker
// @access  Private
router.post('/', [
  auth,
  body('name', 'Name is required').not().isEmpty(),
], async (req, res) => {
  console.log('WORKERS: create request', { userId: req.user.id, body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('WORKERS: create validation errors', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, phone, skills } = req.body;

  try {
    const newWorker = new Worker({
      userId: req.user.id,
      name,
      phone,
      skills,
    });

    const worker = await newWorker.save();
    res.json(worker);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/workers/:id
// @desc    Update worker
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    // Check if worker belongs to user
    if (worker.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    worker = await Worker.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );

    res.json(worker);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Worker not found' });
    }
    res.status(500).send('Server error');
  }
});

// @route   DELETE /api/workers/:id
// @desc    Delete worker
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    // Check if worker belongs to user
    if (worker.userId.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await Worker.findByIdAndRemove(req.params.id);
    res.json({ message: 'Worker removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Worker not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;