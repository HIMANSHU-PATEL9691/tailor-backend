# TailorApp Backend

This is the backend API for TailorApp, a professional tailoring business management application.

## Features

- User authentication (signup/login) with JWT
- Customer management
- Order management
- Worker management
- Inventory management
- MongoDB Atlas database integration

## Tech Stack

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose ODM
- JWT for authentication
- bcryptjs for password hashing

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account
- npm or yarn

### Installation

1. Clone the repository and navigate to the backend folder:
   ```bash
   cd TailorApp/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up MongoDB Atlas:
   - Create a MongoDB Atlas account at https://www.mongodb.com/atlas
   - Create a new cluster
   - Create a database user with read/write permissions
   - Get your connection string

4. Configure environment variables:
   - Copy the `.env` file and update the values:
     ```
     MONGODB_URI=mongodb+srv://your-username:your-password@cluster0.mongodb.net/tailorapp?retryWrites=true&w=majority
     JWT_SECRET=your-super-secret-jwt-key-here
     PORT=5000
     ```

5. Start the server:
   ```bash
   npm run dev  # For development with nodemon
   # or
   npm start    # For production
   ```

The server will start on http://localhost:5000

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user (requires auth)

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PUT /api/orders/:id` - Update order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/payment` - Update payment
- `DELETE /api/orders/:id` - Delete order

### Workers
- `GET /api/workers` - Get all workers
- `GET /api/workers/:id` - Get worker by ID
- `POST /api/workers` - Create worker
- `PUT /api/workers/:id` - Update worker
- `DELETE /api/workers/:id` - Delete worker

### Inventory
- `GET /api/inventory` - Get all inventory items
- `GET /api/inventory/:id` - Get inventory item by ID
- `POST /api/inventory` - Create inventory item
- `PUT /api/inventory/:id` - Update inventory item
- `DELETE /api/inventory/:id` - Delete inventory item

## Authentication

All API endpoints except authentication routes require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Data Models

### User
- name: String (required)
- phone: String (required, unique)
- password: String (required, hashed)
- businessName: String
- address: String

### Customer
- userId: ObjectId (ref: User)
- name: String
- phone: String
- address: String
- gender: String
- measurements: Object

### Order
- userId: ObjectId (ref: User)
- customerId: ObjectId (ref: Customer)
- Various order details including measurements, payment, status, etc.

### Worker
- userId: ObjectId (ref: User)
- name: String
- phone: String
- skills: Array

### Inventory
- userId: ObjectId (ref: User)
- name: String
- category: String
- quantity: Number
- unit: String
- price: Number

## Development

For development, use `npm run dev` which uses nodemon for automatic restarts on file changes.

## Deployment

1. Set up your MongoDB Atlas cluster
2. Update the `.env` file with production values
3. Deploy to your preferred hosting service (Heroku, Railway, DigitalOcean, etc.)
4. Update the API_BASE_URL in the frontend AppContext to point to your deployed backend

## License

This project is licensed under the MIT License.