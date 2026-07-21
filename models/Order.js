const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
  },
  productId: {
    type: String,
  },
  productName: {
    type: String,
  },
  productImage: {
    type: String,
  },
  colorId: {
    type: String,
  },
  colorName: {
    type: String,
  },
  color: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  price: {
    type: Number,
  },
  quantity: {
    type: Number,
    default: 1,
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
    },
    totalPrice: {
      type: Number,
    },
    totalAmount: {
      type: Number,
    },
    shippingFee: {
      type: Number,
      default: 40000,
    },
    receiverName: {
      type: String,
      default: "",
    },
    receiverPhone: {
      type: String,
      default: "",
    },
    deliveryAddress: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Đang giao hàng",
    },
    cancelReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
