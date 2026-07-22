const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

// POST create order from cart
router.post("/create-order", async (req, res) => {
  try {
    const userId = req.query.userId || req.body.userId;
    const cartItems = await Cart.find({});
    if (cartItems.length === 0) {
      return res.status(400).json({ code: 400, message: "Giỏ hàng đang trống" });
    }

    let totalPrice = 0;
    const orderItems = cartItems.map((item) => {
      totalPrice += (item.price || 0) * (item.quantity || 1);
      return {
        product: item.productId,
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        colorId: item.colorId,
        colorName: item.colorName,
        price: item.price,
        quantity: item.quantity,
      };
    });

    const orderCode = `#SH-${Date.now().toString().slice(-6)}`;

    const newOrder = new Order({
      orderCode,
      items: orderItems,
      subtotal: totalPrice,
      totalPrice,
      totalAmount: totalPrice + 40000,
      status: "Đang giao hàng",
      shippingFee: 40000,
      user: userId || null,
    });

    const savedOrder = await newOrder.save();

    // Clear the cart after order created
    await Cart.deleteMany({});

    res.status(200).json({
      code: 200,
      message: "Đặt hàng thành công",
      data: savedOrder,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// GET all orders
router.get("/get-orders", async (req, res) => {
  try {
    // Delete any old invalid mockup orders or orders without user
    await Order.deleteMany({
      $or: [
        { orderCode: { $exists: false } },
        { orderCode: "" },
        { orderCode: null },
        { user: null },
        { user: { $exists: false } }
      ]
    });

    const userId = req.query.userId || req.body.userId;
    let query = {};
    if (userId) {
      query.user = userId;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Lấy danh sách đơn hàng thành công",
      data: orders,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: [] });
  }
});

// POST cancel order
router.post("/cancel-order", async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    if (!orderId) {
      return res.status(400).json({ code: 400, message: "Thiếu mã đơn hàng" });
    }

    const result = await Order.updateOne(
      { _id: orderId },
      { $set: { status: "Đã hủy", cancelReason: reason || "" } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
    }

    const updatedOrder = await Order.findById(orderId);

    res.status(200).json({
      code: 200,
      message: "Đơn hàng đã được hủy",
      data: updatedOrder,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});


// POST clear all items in cart
router.post("/clear-cart", async (req, res) => {
  try {
    await Cart.deleteMany({});
    res.status(200).json({
      code: 200,
      message: "Đã xóa giỏ hàng thành công",
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
