const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    // Tên của danh mục sản phẩm (ví dụ: Điện thoại, Máy tính)
    name: {
      type: String,
      required: [true, "Tên danh mục là bắt buộc"],
      unique: true,
      trim: true,
    },
    // Đường dẫn hình ảnh đại diện của danh mục (URL từ Cloudinary hoặc tương đương)
    image: {
      type: String,
      default: "",
    },
    // Trạng thái hoạt động của danh mục
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    // Tự động lưu thời gian tạo (createdAt) và cập nhật (updatedAt)
    timestamps: true,
  }
);

CategorySchema.index({ name: 1 });

module.exports = mongoose.model("Category", CategorySchema);
