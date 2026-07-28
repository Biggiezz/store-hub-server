const mongoose = require("mongoose");

const Product = new mongoose.Schema(
  {
    // Tên của sản phẩm
    name: {
      type: String,
      required: true,
    },
    // Đơn giá bán của sản phẩm
    price: {
      type: Number,
      required: true,
    },
    // Đường dẫn hình ảnh chính của sản phẩm
    image: {
      type: String,
      required: true,
    },
    // Phân loại danh mục của sản phẩm
    category: {
      type: String,
      required: true,
    },
    // Mô tả chi tiết thông tin sản phẩm
    description: {
      type: String,
    },
    // Điểm đánh giá trung bình (ví dụ: 4.8)
    rating: {
      type: Number,
      default: 0,
    },
    // Tổng số lượt đánh giá
    reviewCount: {
      type: Number,
      default: 0,
    },
    // Số lượng sản phẩm còn trong kho
    stock: {
      type: Number,
      default: 0,
    },
    // Danh sách các biến thể màu sắc sản phẩm
    colors: [
      {
        // Mã định danh màu sắc dạng chuỗi
        id: { type: String },
        // Tên màu sắc hiển thị (ví dụ: Xanh lá, Đen)
        name: { type: String },
        // Mã màu HEX (ví dụ: #00FF00)
        hex: { type: String },
        // Trạng thái màu sắc mặc định hay không
        isDefault: { type: Boolean, default: false },
      },
    ],
    // Danh sách các phản hồi/nhận xét của khách hàng
    reviews: [
      {
        // Mã nhận xét
        id: { type: String },
        // Tên của khách hàng nhận xét
        customerName: { type: String },
        // Hình ảnh đại diện khách hàng nhận xét
        customerImage: { type: String, default: "" },
        // Thời điểm gửi nhận xét (dd/mm/yyyy)
        createdAt: { type: String },
        // Số sao đánh giá (1-5)
        rating: { type: Number, default: 0 },
        // Nội dung nhận xét
        content: { type: String },
        // Nội dung phản hồi nhận xét từ phía Admin (nếu có)
        replyContent: { type: String, default: "" },
        // Thời điểm Admin gửi phản hồi
        replyCreatedAt: { type: String, default: "" },
      },
    ],
  },
  {
    // Tự động lưu thời gian tạo (createdAt) và cập nhật (updatedAt)
    timestamps: true,
  },
);

Product.index({ name: "text" });
Product.index({ category: 1 });
Product.index({ price: 1 });

module.exports = mongoose.model("Products", Product);
