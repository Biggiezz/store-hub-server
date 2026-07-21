const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  color: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true
    },
    shippingFee: {
      type: Number,
      default: 40000
    },
    totalAmount: {
      type: Number,
      required: true
    },
    receiverName: {
      type: String,
      default: ""
    },
    receiverPhone: {
      type: String,
      default: ""
    },
    deliveryAddress: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["completed", "pending", "cancelled"],
      default: "completed"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
