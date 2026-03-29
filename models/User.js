const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const rechargeHistorySchema = new mongoose.Schema(
  {
    durationValue: { type: Number, required: true },
    durationUnit: { type: String, required: true, enum: ['minutes', 'hours', 'days', 'months', 'years'] },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    actionType: { type: String, required: true, enum: ['approve', 'unblock', 'recharge'] },
    byAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byAdminName: { type: String },
    note: { type: String },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  businessName: {
    type: String,
  },
  address: {
    type: String,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  accessExpiresAt: Date,
  blockedAt: Date,
  blockReason: {
    type: String,
    enum: ['manual', 'subscription_expired'],
  },
  rechargeHistory: {
    type: [rechargeHistorySchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.index({ phone: 1 }, { unique: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
