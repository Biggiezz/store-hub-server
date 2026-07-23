const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        // Họ và tên người dùng
        name: {
            type: String,
            required: true,
        },
        // Địa chỉ email (duy nhất, dùng để đăng nhập)
        email: {
            type: String,
            required: true,
            unique: true,
        },
        // Số điện thoại liên hệ
        phone: {
            type: String,
            required: true,
        },
        // Mật khẩu tài khoản (đã mã hóa)
        password: {
            type: String,
            required: true,
        },
        // Vai trò phân quyền: customer (khách hàng), admin (quản lý), superadmin (quản trị tối cao)
        role: {
            type: String,
            default: "customer",
        },
        // Đường dẫn hình ảnh đại diện (avatar) của người dùng
        image: {
            type: String,
            default: "",
        },
        // Địa chỉ giao hàng mặc định của người dùng
        address: {
            type: String,
            default: "",
        },
        // Ngày giờ thay đổi mật khẩu lần cuối cùng
        changePasswordDate: {
            type: Date,
            default: Date.now,
        },
    },
    {
        // Tự động lưu thời gian tạo (createdAt) và cập nhật (updatedAt)
        timestamps: true,
    }
);

module.exports = mongoose.model("Users", UserSchema);
