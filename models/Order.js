const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  // Tham chiếu ObjectId đến model Products
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
  },
  // Mã ID sản phẩm dạng chuỗi
  productId: {
    type: String,
  },
  // Tên sản phẩm
  productName: {
    type: String,
  },
  // Đường dẫn hình ảnh sản phẩm
  productImage: {
    type: String,
  },
  // Mã màu sắc đã chọn
  colorId: {
    type: String,
  },
  // Tên màu sắc đã chọn (ví dụ: Đen, Đỏ)
  colorName: {
    type: String,
  },
  // Đối tượng màu sắc dạng hỗn hợp (nếu có)
  color: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // Đơn giá bán tại thời điểm đặt hàng
  price: {
    type: Number,
  },
  // Số lượng sản phẩm đặt mua
  quantity: {
    type: Number,
    default: 1,
  },
});

const orderSchema = new mongoose.Schema(
  {
    // Mã code định danh đơn hàng (ví dụ: SH-12345)
    orderCode: {
      type: String,
    },
    // Tham chiếu ObjectId đến tài khoản người đặt hàng
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
    // Danh sách sản phẩm chi tiết của đơn hàng
    items: [orderItemSchema],
    // Tổng số tiền trước khi tính phí vận chuyển
    subtotal: {
      type: Number,
    },
    // Tổng số tiền của toàn bộ sản phẩm
    totalPrice: {
      type: Number,
    },
    // Tổng số tiền cuối cùng của đơn hàng (bao gồm ship và trừ voucher)
    totalAmount: {
      type: Number,
    },
    // Phí vận chuyển
    shippingFee: {
      type: Number,
      default: 40000,
    },
    // Họ tên người nhận hàng
    receiverName: {
      type: String,
      default: "",
    },
    // Số điện thoại người nhận hàng
    receiverPhone: {
      type: String,
      default: "",
    },
    // Địa chỉ giao nhận hàng
    deliveryAddress: {
      type: String,
      default: "",
    },
    // Trạng thái đơn hàng: Chờ xác nhận, Đang chuẩn bị hàng, Đang giao hàng, Đã giao hàng, Đã hoàn thành, Đã hủy
    status: {
      type: String,
      default: "Chờ xác nhận",
    },
    // Lý do hủy đơn hàng (nếu có)
    cancelReason: {
      type: String,
      default: "",
    },
    // Trạng thái đã được người dùng đánh giá hay chưa
    isReviewed: {
      type: Boolean,
      default: false,
    },
    // Thời điểm đơn hàng được xác nhận
    confirmedAt: {
      type: Date,
    },
    // Thời điểm đơn hàng nhập kho
    warehouseAt: {
      type: Date,
    },
    // Thời điểm bắt đầu giao hàng
    deliveringAt: {
      type: Date,
    },
    // Thời điểm đơn hàng giao thành công/hoàn thành
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

orderSchema.index({ status: 1 });
orderSchema.index({ user: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
