const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    // Mã ID của sản phẩm trong giỏ hàng
    productId: {
      type: String,
      required: true,
    },
    // Tên của sản phẩm trong giỏ hàng
    productName: {
      type: String,
    },
    // Đường dẫn/URL hình ảnh của sản phẩm
    productImage: {
      type: String,
    },
    // Mã màu sắc đã chọn của sản phẩm
    colorId: {
      type: String,
    },
    // Tên màu sắc đã chọn của sản phẩm (ví dụ: Đỏ, Đen)
    colorName: {
      type: String,
    },
    // Giá bán của một sản phẩm
    price: {
      type: Number,
      default: 0,
    },
    // Số lượng sản phẩm trong giỏ hàng
    quantity: {
      type: Number,
      default: 1,
    },
  },
  {
    // Tự động lưu thời gian tạo (createdAt) và cập nhật (updatedAt)
    timestamps: true,
  }
);

CartItemSchema.index({ productId: 1 });

module.exports = mongoose.model("Cart", CartItemSchema);
