const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

// Cấu hình lưu trữ trên Cloudinary (thay thế lưu file local)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "store-hub", // Tên folder trên Cloudinary
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1000, crop: "limit" }], // Auto resize ảnh quá lớn
  },
});

// Cấu hình multer với Cloudinary storage
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn kích thước file 5MB
});

module.exports = upload;
