const mongoose = require("mongoose");

/**
 * Mongoose Schema representing a News Article (Bài viết tin tức).
 * Contains fields for customer display as well as admin properties.
 */
const NewsSchema = new mongoose.Schema(
  {
    // Tiêu đề của bài viết tin tức
    title: {
      type: String,
      required: [true, "Tiêu đề bài viết là bắt buộc"],
      trim: true,
    },
    // Nội dung chi tiết của bài viết
    content: {
      type: String,
      required: [true, "Nội dung bài viết là bắt buộc"],
    },
    // Đường dẫn hình ảnh đại diện cho bài viết (URL hoặc tên tệp)
    image: {
      type: String,
      required: [true, "Ảnh đại diện bài viết là bắt buộc"],
    },
    // Trạng thái bài viết: 'draft' (nháp), 'published' (xuất bản), 'hidden' (ẩn)
    status: {
      type: String,
      enum: ["draft", "published", "hidden"],
      default: "published",
    },
    // Tác giả hoặc người tạo bài viết
    author: {
      type: String,
      default: "Admin",
    },
    // Số lượt xem của bài viết
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    // Tự động thêm trường createdAt (ngày tạo) và updatedAt (ngày cập nhật)
    timestamps: true,
  }
);

// Xuất model "News" dựa trên NewsSchema, liên kết với collection "news" trong MongoDB
module.exports = mongoose.model("News", NewsSchema);
