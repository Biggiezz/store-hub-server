const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema(
  {
    // Loại hoạt động (ví dụ: "login_admin", "login_customer")
    type: {
      type: String,
      required: true,
      index: true,
    },
    // Tiêu đề hoạt động (ví dụ: "Quản trị viên vừa đăng nhập")
    title: {
      type: String,
      required: true,
    },
    // Chi tiết hoạt động (ví dụ: "Vai trò: admin")
    detail: {
      type: String,
      default: "",
    },
    // ID đối tượng mục tiêu liên quan đến hoạt động (ví dụ: ID của người dùng)
    targetId: {
      type: String,
      default: "",
      index: true,
    },
    // Tên người thực hiện hoạt động (ví dụ: "Nguyễn Văn A")
    actorName: {
      type: String,
      default: "",
    },
    // Vai trò người thực hiện (ví dụ: "admin", "customer")
    actorRole: {
      type: String,
      default: "",
    },
    // Thời điểm diễn ra hoạt động (mặc định lấy thời gian hiện tại)
    eventAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { 
    // Tự động lưu thời gian tạo (createdAt) và cập nhật (updatedAt)
    timestamps: true 
  }
);

ActivityLogSchema.index({ eventAt: -1 });

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);
