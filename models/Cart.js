const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
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
    // Mã Hex của màu sắc được chọn để hiển thị chấm tròn màu trực quan trong giỏ hàng phía Client
    colorHex: {
      type: String,
    },
    price: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Cart", CartItemSchema);
