const jwt = require("jsonwebtoken");
// Cách hoạt động của Auth Token (JWT):
// 1. Khi đăng nhập đúng -> Server cấp 1 Token (chứa id & role) trả về cho App.
// 2. Khi gọi API bảo mật -> App gửi Token này ở Header: "Authorization: Bearer <token>".
// 3. Server dùng hàm verify để giải mã Token -> nếu hợp lệ sẽ cho đi tiếp và gán user vào "req.user".

// Middleware xác thực Token (Authentication)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: Bearer <TOKEN>

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: "Không tìm thấy token xác thực. Vui lòng đăng nhập.",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        code: 403,
        message: "Token không hợp lệ hoặc đã hết hạn.",
      });
    }
    req.user = user;
    next();
  });
};

// Middleware phân quyền theo Role (Authorization)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const role = String(req.user?.role || "").replace(/\s+/g, "").toLowerCase();
    const normalizedRoles = allowedRoles.map((item) => item.replace(/\s+/g, "").toLowerCase());
    if (!normalizedRoles.includes(role)) {
      return res.status(403).json({
        code: 403,
        message: "Bạn không có quyền thực hiện chức năng này.",
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
};
