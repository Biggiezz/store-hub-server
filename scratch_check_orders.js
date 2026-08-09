require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");
  const orders = await Order.find({ paymentMethod: 'ZaloPay' }).sort({ createdAt: -1 }).limit(5);
  console.log("Last 5 ZaloPay orders:");
  orders.forEach(o => {
    console.log({
      id: o._id,
      orderCode: o.orderCode,
      status: o.status,
      totalAmount: o.totalAmount,
      appTransId: o.appTransId,
      zpTransId: o.zpTransId,
      createdAt: o.createdAt
    });
  });
  await mongoose.disconnect();
}

run().catch(console.error);
