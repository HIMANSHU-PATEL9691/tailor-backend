const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
});

const workerAssignmentSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
  },
  skill: {
    type: String,
    required: true,
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
  },
  workerName: {
    type: String,
    default: '',
  },
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  customerAddress: String,
  customerGender: String,
  category: {
    type: String,
    required: true,
  },
  measurements: {
    type: mongoose.Schema.Types.Mixed, // Accepts complex nested object from frontend
    required: false
  },
  customization: {
    collar: String,
    sleeve: String,
    cuffs: String,
  },
  images: {
    fabric: String,
    sample: String,
  },
  dates: {
    orderDate: {
      type: Date,
      required: true,
    },
    remindDate: Date,
    deliveryDate: {
      type: Date,
      required: true,
    },
  },
  notes: String,
  audioNotes: String,
  items: [orderItemSchema],
  payment: {
    subtotal: {
      type: Number,
      required: true,
    },
    additionalCharges: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    paymentMode: {
      type: String,
      default: 'Cash',
    },
    advanceAmount: {
      type: Number,
      default: 0,
    },
    dueAmount: {
      type: Number,
      required: true,
    },
    settlementStatus: {
      type: String,
      enum: ['Pending', 'Settled', 'Due'],
      default: 'Pending',
    },
    followUpDate: Date,
    followUpTime: String,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Ready', 'Delivered'],
    default: 'Pending',
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
  },
  workerAssignments: [workerAssignmentSchema],
  numCustomers: {
    type: Number,
    default: 1,
    min: 1
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Order', orderSchema);
