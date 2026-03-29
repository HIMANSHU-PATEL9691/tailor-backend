const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`--> ${req.method} ${req.originalUrl}`, {
    params: req.params,
    query: req.query,
    body: req.body,
  });
  next();
});

let dbConnected = false;

mongoose.connection.on('connected', () => {
  dbConnected = true;
  console.log('Connected to MongoDB Atlas');
});

mongoose.connection.on('disconnected', () => {
  dbConnected = false;
  console.log('MongoDB connection disconnected');
});

mongoose.connection.on('error', (err) => {
  dbConnected = false;
  console.error('MongoDB connection error:', err.message);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: dbConnected ? 'connected' : 'disconnected',
    database: dbConnected ? 'MongoDB Atlas' : 'Not connected',
    readyState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/inventory', require('./routes/inventory'));

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from backend/.env');
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Local network: http://192.168.1.9:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    process.exit(1);
  }
};

startServer();
