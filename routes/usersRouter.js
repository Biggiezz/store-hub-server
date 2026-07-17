var express = require("express");
var router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/users");
const { authenticateToken, authorizeRoles } = require("../middlewares/auth");
const upload = require("../middlewares/upload");

// Đăng ký người dùng mới (Mặc định luôn là customer)
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        code: 400,
        message: "Vui lòng nhập đầy đủ các thông tin: name, email, phone, password."
      });
    }

    // Kiểm tra xem email đã được đăng ký chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        message: "Email đã tồn tại trên hệ thống."
      });
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo user mới (mặc định role là "customer")
    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      role: "customer"
    });

    const savedUser = await newUser.save();

    // Loại bỏ password trước khi trả về client
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      code: 201,
      message: "Đăng ký tài khoản thành công",
      data: userResponse
    });

  } catch (error) {
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi đăng ký tài khoản.",
      error: error.message
    });
  }
});

// Đăng nhập
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!email || !password) {
      return res.status(400).json({
        code: 400,
        message: "Vui lòng cung cấp đầy đủ email và password."
      });
    }

    // Tìm kiếm người dùng theo email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        code: 400,
        message: "Email hoặc mật khẩu không chính xác."
      });
    }

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        code: 400,
        message: "Email hoặc mật khẩu không chính xác."
      });
    }

    // Tạo JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // Token có giá trị trong 7 ngày
    );

    // Loại bỏ password trước khi trả về
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      code: 200,
      message: "Đăng nhập thành công",
      token: token,
      data: userResponse
    });

  } catch (error) {
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi đăng nhập.",
      error: error.message
    });
  }
});

// Tạo tài khoản Admin (Chỉ có Super Admin mới có quyền tạo)
router.post("/create-admin", authenticateToken, authorizeRoles("superadmin"), async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        code: 400,
        message: "Vui lòng nhập đầy đủ các thông tin: name, email, phone, password."
      });
    }

    // Kiểm tra xem email đã được đăng ký chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        message: "Email đã tồn tại trên hệ thống."
      });
    }

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo user mới với quyền "admin"
    const newAdmin = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      role: "admin"
    });

    const savedAdmin = await newAdmin.save();

    // Loại bỏ password trước khi trả về
    const adminResponse = savedAdmin.toObject();
    delete adminResponse.password;

    res.status(201).json({
      code: 201,
      message: "Tạo tài khoản Admin thành công",
      data: adminResponse
    });

  } catch (error) {
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi tạo tài khoản Admin.",
      error: error.message
    });
  }
});

// Cập nhật ảnh đại diện (Yêu cầu đăng nhập, tải file ảnh lên qua Multer)
router.put("/update-avatar", authenticateToken, (req, res) => {
  upload.single("image")(req, res, async function (err) {
    if (err) {
      return res.status(400).json({
        code: 400,
        message: err.message || "Lỗi tải ảnh lên."
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          code: 400,
          message: "Vui lòng đính kèm một file ảnh."
        });
      }

      // Đường dẫn tĩnh của ảnh sau khi upload lên server
      const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

      // Tìm và cập nhật ảnh của user
      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { image: imageUrl },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy người dùng."
        });
      }

      // Loại bỏ password trước khi trả về
      const userResponse = updatedUser.toObject();
      delete userResponse.password;

      res.status(200).json({
        code: 200,
        message: "Cập nhật ảnh đại diện thành công",
        data: userResponse
      });

    } catch (error) {
      res.status(500).json({
        code: 500,
        message: "Lỗi máy chủ khi cập nhật ảnh đại diện.",
        error: error.message
      });
    }
  });
});

module.exports = router;
