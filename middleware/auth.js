const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const decodedUser = decoded.user || {};

    if (decodedUser.id === 'system-admin' && decodedUser.role === 'admin') {
      req.user = decodedUser;
      return next();
    }

    const currentUser = await User.findById(decodedUser.id).select('role approvalStatus accessExpiresAt');
    if (!currentUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (currentUser.role !== 'admin') {
      if (currentUser.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Your registration is pending admin approval.' });
      }

      if (currentUser.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your account has been blocked by admin.' });
      }

      if (currentUser.accessExpiresAt && new Date(currentUser.accessExpiresAt).getTime() <= Date.now()) {
        await User.findByIdAndUpdate(decodedUser.id, {
          approvalStatus: 'rejected',
          blockedAt: new Date(),
          blockReason: 'subscription_expired',
        });
        return res.status(403).json({ message: 'Your access time has expired. Please contact admin to recharge your account.' });
      }
    }

    req.user = decoded.user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;
