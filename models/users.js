const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        phone: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            default: "customer", // role nhận 3 trạng thái : customer , admin và superAdmin 
        },
        image: {
            type: String,
            default: "", // Đường dẫn ảnh đại diện, mặc định để rỗng
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Users", UserSchema);
