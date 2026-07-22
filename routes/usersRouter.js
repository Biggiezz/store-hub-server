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

// Cập nhật thông tin cá nhân (name, phone, address) - Không cập nhật email
router.put("/update-profile", authenticateToken, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        code: 404,
        message: "Không tìm thấy người dùng."
      });
    }

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.status(200).json({
      code: 200,
      message: "Cập nhật thông tin cá nhân thành công",
      data: userResponse
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi cập nhật thông tin cá nhân.",
      error: error.message
    });
  }
});

// Đổi mật khẩu (oldPassword, newPassword) - cập nhật changePasswordDate
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        code: 400,
        message: "Vui lòng nhập mật khẩu cũ và mật khẩu mới."
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: "Không tìm thấy người dùng."
      });
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        code: 400,
        message: "Mật khẩu cũ không chính xác."
      });
    }

    // Mã hóa mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.changePasswordDate = new Date();
    await user.save();

    res.status(200).json({
      code: 200,
      message: "Đổi mật khẩu thành công."
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi đổi mật khẩu.",
      error: error.message
    });
  }
});

// Lấy dữ liệu thống kê tổng quan cho Admin (AdminHomeFragment)
router.get("/admin/dashboard", async (req, res) => {
  try {
    const Product = require("../models/Product");
    const Cart = require("../models/Cart");

    const [totalUsers, totalProducts, cartItems] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Cart.find(),
    ]);

    const totalSalesCount = cartItems.reduce(
      (total, item) => total + (item.quantity || 0),
      0,
    );
    const totalSalesAmount = cartItems.reduce(
      (total, item) => total + (item.price || 0) * (item.quantity || 0),
      0,
    );

    res.status(200).json({
      code: 200,
      message: "Lấy dữ liệu thống kê quản trị thành công",
      data: {
        totalSales: totalSalesAmount,
        totalSalesCount: totalSalesCount,
        salesStatus: "+15% so với tháng trước",
        totalUsers: totalUsers,
        usersStatus: `+${totalUsers} thành viên`,
        totalProducts: totalProducts,
        productsStatus: "Đang kinh doanh"
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy dashboard admin:", error);
    res.status(500).json({
      code: 500,
      message: "Lỗi hệ thống khi lấy dữ liệu thống kê quản trị."
    });
  }
});

// Lấy dữ liệu thống kê doanh thu theo thời gian từ Đơn hàng đã thanh toán
router.get("/admin/revenue-stats", async (req, res) => {
  try {
    const Order = require("../models/Order");
    const Product = require("../models/Product");
    const period = parseInt(req.query.period) || 0;

    const now = new Date();
    let startDate, endDate;
    let daysLabels = [];

    if (period === 0) {
      // Tháng này: Lấy từ đầu tháng này đến hết tháng
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      daysLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    } else if (period === 1) {
      // Tháng trước
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      daysLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    } else {
      // Năm 2026
      startDate = new Date(2026, 0, 1);
      endDate = new Date(2026, 11, 31, 23, 59, 59);
      daysLabels = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
    }

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ["Đã hủy", "cancelled"] }
    });

    let totalRevenue = 0;
    let totalOrders = orders.length;

    orders.forEach((order) => {
      totalRevenue += order.totalAmount ?? ((order.totalPrice || 0) + (order.shippingFee || 0));
    });

    const revenueByLabel = new Array(daysLabels.length).fill(0);
    const salesByProduct = new Map();

    orders.forEach((order) => {
      const orderDate = new Date(order.createdAt);
      let index = 0;
      if (period === 0 || period === 1) {
        let dayOfWeek = orderDate.getDay();
        index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      } else {
        index = orderDate.getMonth();
      }

      if (index >= 0 && index < revenueByLabel.length) {
        const orderRevenue = order.totalAmount ?? ((order.totalPrice || 0) + (order.shippingFee || 0));
        revenueByLabel[index] += orderRevenue / 1000000;
      }

      order.items.forEach((item) => {
        const productId = String(item.product || item.productId);
        const current = salesByProduct.get(productId) || { soldCount: 0, revenue: 0 };
        current.soldCount += item.quantity || 0;
        current.revenue += (item.price || 0) * (item.quantity || 0);
        salesByProduct.set(productId, current);
      });
    });

    const dailyStats = revenueByLabel.map((rev, idx) => ({
      index: idx,
      label: daysLabels[idx] || "",
      revenue: parseFloat(rev.toFixed(2))
    }));

    const productIds = [...salesByProduct.keys()].filter((id) => /^[a-f\d]{24}$/i.test(id));
    const products = await Product.find({ _id: { $in: productIds } })
      .select("name image");
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const topProducts = [...salesByProduct.entries()]
      .map(([productId, sales]) => {
        const product = productsById.get(productId);
        return {
          productId,
          name: product?.name || "Sản phẩm đã xóa",
          image: product?.image || "",
          soldCount: sales.soldCount,
          revenue: sales.revenue,
        };
      })
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 3);

    const [recentOrders, recentUsers, lowStockProducts] = await Promise.all([
      Order.find({ status: { $nin: ["Đã hủy", "cancelled"] } })
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(5),
      User.find({ role: "customer" }).sort({ createdAt: -1 }).limit(5),
      Product.find({ stock: { $lte: 10 } }).sort({ stock: 1, updatedAt: -1 }).limit(5),
    ]);
    const recentActivities = [
      ...recentOrders.map((order) => ({
        type: "order",
        title: `${order.user?.name || order.receiverName || "Khách hàng"} vừa mua hàng`,
        createdAt: order.createdAt,
      })),
      ...recentUsers.map((user) => ({
        type: "user",
        title: `${user.name} vừa đăng ký tài khoản`,
        createdAt: user.createdAt,
      })),
      ...lowStockProducts.map((product) => ({
        type: "low_stock",
        title: `${product.name} sắp hết hàng (còn ${product.stock})`,
        createdAt: product.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);

    res.status(200).json({
      code: 200,
      message: "Lấy dữ liệu thống kê doanh thu thành công",
      data: {
        totalRevenue: totalRevenue,
        totalOrders: totalOrders,
        dailyStats: dailyStats,
        labels: daysLabels,
        topProducts,
        recentActivities
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu thống kê doanh thu:", error);
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi lấy dữ liệu thống kê."
    });
  }
});

// Lấy danh sách toàn bộ người dùng
router.get("/get-all-users", authenticateToken, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    return res.status(200).json({
      code: 200,
      message: "Lấy danh sách người dùng thành công",
      data: users
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi lấy danh sách người dùng.",
      error: error.message
    });
  }
});

// Thêm người dùng mới (dành cho Admin/Super Admin)
router.post("/add-user", authenticateToken, async (req, res) => {
  try {
    const { name, email, phone, role, password, address, image } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        code: 400,
        message: "Thiếu thông tin bắt buộc (họ tên, email, SĐT, mật khẩu)."
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        message: "Email đã tồn tại trên hệ thống."
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      phone,
      role: role || "customer",
      password: hashedPassword,
      address: address || "",
      image: image || ""
    });

    const savedUser = await newUser.save();
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    return res.status(201).json({
      code: 201,
      message: "Thêm người dùng thành công",
      data: userResponse
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi thêm người dùng.",
      error: error.message
    });
  }
});

module.exports = router;
