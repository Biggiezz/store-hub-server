const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    // Chủ sở hữu giỏ hàng. Mọi truy vấn giỏ hàng phải lọc theo trường này.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
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
    // Mã Hex của màu sắc được chọn để hiển thị chấm tròn màu trực quan trong giỏ hàng phía Client
    colorHex: {
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

CartItemSchema.index({ userId: 1, productId: 1, colorId: 1 }, {
  unique: true,
  partialFilterExpression: { userId: { $exists: true } },
});

module.exports = mongoose.model("Cart", CartItemSchema);
