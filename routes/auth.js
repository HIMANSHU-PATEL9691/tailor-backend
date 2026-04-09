const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();
const normalizePhone = (phone = '') => phone.toString().replace(/\D/g, '').trim();
const getApprovalStatus = (user) => user?.approvalStatus || 'approved';
const isAdminUser = (user) => user?.role === 'admin';
const ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bajrang@55';
const SYSTEM_ADMIN_ID = 'system-admin';
const VALID_DURATION_UNITS = ['minutes', 'hours', 'days', 'months', 'years', 'lifetime'];

const parseAccessDuration = (payload = {}) => {
  const durationValue = Number(payload.durationValue);
  const durationUnit = String(payload.durationUnit || '').toLowerCase();

  if (!VALID_DURATION_UNITS.includes(durationUnit)) {
    return { error: 'Duration unit must be minutes, hours, days, months, years, or lifetime' };
  }

  if (durationUnit === 'lifetime') {
    return {
      durationValue: 1,
      durationUnit,
      expiresAt: null,
    };
  }

  if (!Number.isFinite(durationValue) || durationValue <= 0) {
    return { error: 'Duration value must be greater than 0' };
  }

  const expiresAt = new Date();
  if (durationUnit === 'minutes') {
    expiresAt.setMinutes(expiresAt.getMinutes() + durationValue);
  } else if (durationUnit === 'hours') {
    expiresAt.setHours(expiresAt.getHours() + durationValue);
  } else if (durationUnit === 'days') {
    expiresAt.setDate(expiresAt.getDate() + durationValue);
  } else if (durationUnit === 'months') {
    expiresAt.setMonth(expiresAt.getMonth() + durationValue);
  } else if (durationUnit === 'years') {
    expiresAt.setFullYear(expiresAt.getFullYear() + durationValue);
  }

  return { durationValue, durationUnit, expiresAt };
};

const appendRechargeHistory = ({ user, duration, actionType, currentUser, isSystemAdmin }) => {
  if (!user || !duration) {
    return;
  }

  const startedAt = new Date();
  const byAdminId = isSystemAdmin ? undefined : currentUser?._id;
  const byAdminName = isSystemAdmin ? 'System Admin' : currentUser?.name || 'Admin';

  user.rechargeHistory = Array.isArray(user.rechargeHistory) ? user.rechargeHistory : [];
  user.rechargeHistory.unshift({
    durationValue: duration.durationValue,
    durationUnit: duration.durationUnit,
    startedAt,
    expiresAt: duration.expiresAt,
    actionType,
    byAdminId,
    byAdminName,
  });

  // Keep latest 50 records to avoid unbounded growth.
  if (user.rechargeHistory.length > 50) {
    user.rechargeHistory = user.rechargeHistory.slice(0, 50);
  }
};

const applySubscriptionExpiryIfNeeded = async (user) => {
  if (!user || user.role === 'admin' || user.approvalStatus !== 'approved') {
    return user;
  }

  if (!user.accessExpiresAt) {
    return user;
  }

  if (new Date(user.accessExpiresAt).getTime() > Date.now()) {
    return user;
  }

  user.approvalStatus = 'rejected';
  user.blockedAt = new Date();
  user.blockReason = 'subscription_expired';
  await user.save();
  return user;
};

const signAuthToken = (payload) =>
  new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(token);
      }
    );
  });

const getAdminContext = async (req) => {
  if (req.user?.id === SYSTEM_ADMIN_ID && req.user?.role === 'admin') {
    return {
      isSystemAdmin: true,
      currentUser: {
        id: SYSTEM_ADMIN_ID,
        name: 'System Admin',
        role: 'admin',
      },
    };
  }

  const currentUser = await User.findById(req.user.id);
  return {
    isSystemAdmin: false,
    currentUser,
  };
};

// @route   POST /api/auth/signup
// @desc    Register user
// @access  Public
router.post(
  '/signup',
  [
    body('name', 'Name is required').trim().not().isEmpty(),
    body('phone', 'Phone must be a valid 10-digit number').trim().isLength({ min: 10, max: 10 }).isNumeric(),
    body('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
  console.log('AUTH: signup request received', { body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('AUTH: signup validation failed', errors.array());
    return res.status(400).json({ 
      success: false, 
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }

  const { name, phone, password, businessName, address } = req.body;
  const normalizedPhone = normalizePhone(phone);

  try {
    console.log('AUTH: checking existing user for phone', normalizedPhone);
    const adminExists = await User.exists({ role: 'admin' });
    // Check if user exists
    let user = await User.findOne({ phone: normalizedPhone });
    if (user) {
      console.log('AUTH: signup failed - user exists');
      return res.status(400).json({ 
        success: false, 
        message: 'User with this phone number already exists' 
      });
    }

    // Create new user
    user = new User({
      name: name.trim(),
      phone: normalizedPhone,
      password,
      businessName: businessName ? businessName.trim() : '',
      address: address ? address.trim() : '',
      role: adminExists ? 'user' : 'admin',
      approvalStatus: adminExists ? 'pending' : 'approved',
      approvedAt: adminExists ? undefined : new Date(),
    });

    await user.save();

    if (adminExists) {
      return res.status(201).json({
        success: true,
        message: 'Registration submitted. Wait for admin approval before logging in.',
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          businessName: user.businessName,
          address: user.address,
          role: user.role,
          approvalStatus: user.approvalStatus,
        },
      });
    }

    // Create JWT token
    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({
          success: true,
          message: 'Account created successfully',
          token,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            businessName: user.businessName,
            address: user.address,
            role: user.role,
            approvalStatus: user.approvalStatus,
          },
        });
      }
    );
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.code === 11000
        ? 'User with this phone number already exists'
        : 'Server error during registration' 
    });
  }
});

// @route   POST /api/auth/admin-login
// @desc    Authenticate system admin and get token
// @access  Public
router.post(
  '/admin-login',
  [
    body('loginId', 'Admin login ID is required').trim().not().isEmpty(),
    body('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { loginId, password } = req.body;

    if (loginId !== ADMIN_LOGIN_ID || password !== ADMIN_PASSWORD) {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin login ID or password',
      });
    }

    try {
      const token = await signAuthToken({
        user: {
          id: SYSTEM_ADMIN_ID,
          role: 'admin',
          name: 'System Admin',
          approvalStatus: 'approved',
          loginId: ADMIN_LOGIN_ID,
        },
      });

      res.json({
        success: true,
        message: 'Admin login successful',
        token,
        user: {
          id: SYSTEM_ADMIN_ID,
          name: 'System Admin',
          role: 'admin',
          approvalStatus: 'approved',
          loginId: ADMIN_LOGIN_ID,
        },
      });
    } catch (err) {
      console.error('Admin login error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Server error during admin login',
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('phone', 'Phone is required').trim().not().isEmpty(),
    body('password', 'Password is required').exists(),
  ],
  async (req, res) => {
  console.log('AUTH: login request', { body: req.body });
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('AUTH: login validation failed', errors.array());
    return res.status(400).json({ 
      success: false, 
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }

  const { phone, password } = req.body;
  const normalizedPhone = normalizePhone(phone);

  try {
    console.log('AUTH: looking up user', normalizedPhone);
    // Check if user exists
    let user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      console.log('AUTH: login failed - user not found');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid phone number or password' 
      });
    }

    const adminExists = await User.exists({ role: 'admin' });
    if (!adminExists) {
      user.role = 'admin';
      user.approvalStatus = 'approved';
      user.approvedAt = user.approvedAt || new Date();
      await user.save();
    }

    user = await applySubscriptionExpiryIfNeeded(user);

    if (getApprovalStatus(user) === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your registration is pending admin approval.',
      });
    }

    if (getApprovalStatus(user) === 'rejected') {
      return res.status(403).json({
        success: false,
        message:
          user.blockReason === 'subscription_expired'
            ? 'Your access time has expired. Please contact admin to recharge your account.'
            : 'Your account has been blocked by admin.',
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid phone number or password' 
      });
    }

    // Create JWT token
    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          success: true,
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            businessName: user.businessName,
            address: user.address,
            role: user.role || 'user',
            approvalStatus: getApprovalStatus(user),
          },
        });
      }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    if (req.user?.id === SYSTEM_ADMIN_ID && req.user?.role === 'admin') {
      return res.json({
        success: true,
        user: {
          id: SYSTEM_ADMIN_ID,
          name: 'System Admin',
          role: 'admin',
          approvalStatus: 'approved',
          loginId: req.user.loginId || ADMIN_LOGIN_ID,
        },
      });
    }

    let user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const adminExists = await User.exists({ role: 'admin' });
    if (!adminExists) {
      await User.findByIdAndUpdate(req.user.id, {
        role: 'admin',
        approvalStatus: 'approved',
        approvedAt: user.approvedAt || new Date(),
      });
      user = await User.findById(req.user.id).select('-password');
    }

    res.json({
      success: true,
      user
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/auth/pending-users
// @desc    Get pending registrations for admin
// @access  Private (Admin)
router.get('/pending-users', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const pendingUsers = await User.find({ approvalStatus: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users: pendingUsers,
    });
  } catch (err) {
    console.error('Get pending users error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   GET /api/auth/all-users
// @desc    Get all registered users for admin
// @access  Private (Admin)
router.get('/all-users', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
    });
  } catch (err) {
    console.error('Get all users error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/auth/users/:id/approve
// @desc    Approve pending user
// @access  Private (Admin)
router.put('/users/:id/approve', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const duration = parseAccessDuration(req.body || {});
    if (duration.error) {
      return res.status(400).json({
        success: false,
        message: duration.error,
      });
    }

    user.approvalStatus = 'approved';
    user.approvedAt = new Date();
    user.approvedBy = isSystemAdmin ? undefined : currentUser._id;
    user.accessExpiresAt = duration.expiresAt;
    user.blockedAt = undefined;
    user.blockReason = undefined;
    appendRechargeHistory({ user, duration, actionType: 'approve', currentUser, isSystemAdmin });
    await user.save();

    user = await User.findById(req.params.id).select('-password');

    res.json({
      success: true,
      message: duration.durationUnit === 'lifetime'
        ? 'User approved for lifetime'
        : `User approved for ${duration.durationValue} ${duration.durationUnit}`,
      user,
    });
  } catch (err) {
    console.error('Approve user error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/auth/users/:id/block
// @desc    Block a registered user
// @access  Private (Admin)
router.put('/users/:id/block', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Admin user cannot be blocked',
      });
    }

    user.approvalStatus = 'rejected';
    user.blockedAt = new Date();
    user.blockReason = 'manual';
    await user.save();

    user = await User.findById(req.params.id).select('-password');

    res.json({
      success: true,
      message: 'User blocked successfully',
      user,
    });
  } catch (err) {
    console.error('Block user error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   PUT /api/auth/users/:id/unblock
// @desc    Unblock a registered user
// @access  Private (Admin)
router.put('/users/:id/unblock', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    let user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const duration = parseAccessDuration(req.body || {});
    if (duration.error) {
      return res.status(400).json({
        success: false,
        message: duration.error,
      });
    }

    user.approvalStatus = 'approved';
    user.approvedAt = user.approvedAt || new Date();
    user.approvedBy = isSystemAdmin ? undefined : currentUser._id;
    user.accessExpiresAt = duration.expiresAt;
    user.blockedAt = undefined;
    user.blockReason = undefined;
    appendRechargeHistory({ user, duration, actionType: 'unblock', currentUser, isSystemAdmin });
    await user.save();

    user = await User.findById(req.params.id).select('-password');

    res.json({
      success: true,
      message: duration.durationUnit === 'lifetime'
        ? 'User unblocked for lifetime'
        : `User unblocked for ${duration.durationValue} ${duration.durationUnit}`,
      user,
    });
  } catch (err) {
    console.error('Unblock user error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

// @route   DELETE /api/auth/users/:id
// @desc    Delete a registered user
// @access  Private (Admin)
router.delete('/users/:id', auth, async (req, res) => {
  try {
    const { currentUser, isSystemAdmin } = await getAdminContext(req);

    if (!isSystemAdmin && !isAdminUser(currentUser)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Admin user cannot be deleted',
      });
    }

    await User.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (err) {
    console.error('Delete user error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

module.exports = router;
