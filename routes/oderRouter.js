const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const https = require("https");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/users");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/auth");

const ADMIN_ROLES = ["admin", "superadmin"];
const ORDER_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đã rời kho",
  "Đang giao hàng",
  "Đã giao hàng",
  "Đã hoàn thành",
  "Đã hủy",
];

function mapOrderForResponse(order) {
  const orderObject = order.toObject();
  const populatedUser =
    orderObject.user && typeof orderObject.user === "object"
      ? orderObject.user
      : null;

  if (populatedUser) {
    orderObject.receiverName ||= populatedUser.name || "";
    orderObject.receiverPhone ||= populatedUser.phone || "";
    orderObject.deliveryAddress ||= populatedUser.address || "";
  }

  orderObject.items = (orderObject.items || []).map((item) => {
    const populatedProduct =
      item.product && typeof item.product === "object" ? item.product : null;
    const productId =
      item.productId ||
      (populatedProduct?._id
        ? String(populatedProduct._id)
        : item.product
          ? String(item.product)
          : "");

    return {
      ...item,
      product: productId,
      productId,
      productName: item.productName || populatedProduct?.name || "",
      productImage: item.productImage || populatedProduct?.image || "",
      price: item.price || populatedProduct?.price || 0,
    };
  });

  return orderObject;
}

function getStatusTimestamp(status) {
  const now = new Date();
  if (status === "Đã xác nhận") return { confirmedAt: now };
  if (status === "Đã rời kho") return { warehouseAt: now };
  if (status === "Đang giao hàng") return { deliveringAt: now };
  if (status === "Đã giao hàng" || status === "Đã hoàn thành") {
    return { completedAt: now };
  }
  return {};
}

// Hàm truy vấn trạng thái đơn hàng của ZaloPay
function queryZaloPayOrder(appTransId) {
  return new Promise((resolve, reject) => {
    const appId = 2553;
    const key1 = "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL";
    const dataToMac = `${appId}|${appTransId}|${key1}`;
    const mac = crypto.createHmac("sha256", key1).update(dataToMac).digest("hex");

    const postData = new URLSearchParams({
      app_id: appId,
      app_trans_id: appTransId,
      mac: mac
    }).toString();

    const options = {
      hostname: "sb-openapi.zalopay.vn",
      port: 443,
      path: "/v2/query",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Hàm hoàn tiền qua cổng ZaloPay (Thực hiện trên backend để đảm bảo bảo mật cho Key2)
// Tham số:
// - zpTransId: Mã giao dịch thanh toán gốc của ZaloPay (nhận về khi thanh toán thành công)
// - amount: Số tiền hoàn lại cho khách hàng (định dạng số nguyên)
// - description: Lý do hoàn tiền (hiển thị trên ứng dụng ví ZaloPay của khách hàng)
function refundZaloPay(zpTransId, amount, description) {
  return new Promise((resolve, reject) => {
    const appId = 2553; // AppId môi trường thử nghiệm (Sandbox) của ZaloPay
    
    // Key1: Khóa bảo mật dùng để ký chữ ký MAC khi gửi các yêu cầu tạo giao dịch/hoàn tiền lên ZaloPay.
    const key1 = "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL"; 
    
    const timestamp = Date.now();
    
    // m_refund_id: Mã định danh duy nhất cho mỗi yêu cầu hoàn tiền.
    // Định dạng bắt buộc của ZaloPay: yymmdd_appid_uniqueid (Độ dài tối đa 40 ký tự).
    const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const mRefundId = `${yymmdd}_2553_${timestamp}`;
    
    // Tạo chuỗi data để tính MAC: app_id|zp_trans_id|amount|description|timestamp
    const dataToMac = `${appId}|${zpTransId}|${amount}|${description}|${timestamp}`;
    
    // Sử dụng thuật toán mã hóa HMAC-SHA256 kết hợp với Key1 để sinh chữ ký MAC bảo mật
    const mac = crypto.createHmac("sha256", key1).update(dataToMac).digest("hex");

    // Đóng gói tham số gửi sang cổng ZaloPay bằng định dạng x-www-form-urlencoded
    const postData = new URLSearchParams({
      app_id: appId,
      m_refund_id: mRefundId,
      zp_trans_id: zpTransId,
      amount: amount,
      timestamp: timestamp,
      description: description,
      mac: mac,
    }).toString();

    const options = {
      hostname: "sb-openapi.zalopay.vn",
      port: 443,
      path: "/v2/refund",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    // Gửi yêu cầu HTTPS Request lên ZaloPay API cổng Sandbox
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Hàm sinh mã giao dịch ZaloPay định dạng yyMMdd_timestamp_random
function getAppTransId() {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const randomSuffix = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  return `${yy}${MM}${dd}_${HH}${mm}${ss}${randomSuffix}`;
}

// POST create ZaloPay transaction token securely
router.post("/create-zalopay-order", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ code: 400, message: "Thiếu số tiền cần thanh toán" });
    }

    const appId = 2553;
    const key1 = "PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL";
    const appTransId = getAppTransId();
    const appTime = Date.now();
    const embedData = "{}";
    const items = "[]";
    const bankCode = "zalopayapp";
    const description = `Merchant pay for order #${appTransId}`;

    // Tạo mã MAC: appId|appTransId|appUser|amount|appTime|embedData|item
    const dataToMac = `${appId}|${appTransId}|Android_Demo|${amount}|${appTime}|${embedData}|${items}`;
    const mac = crypto.createHmac("sha256", key1).update(dataToMac).digest("hex");

    const postData = new URLSearchParams({
      app_id: appId,
      app_user: "Android_Demo",
      app_time: appTime,
      amount: amount,
      app_trans_id: appTransId,
      embed_data: embedData,
      item: items,
      bank_code: bankCode,
      description: description,
      mac: mac
    }).toString();

    const options = {
      hostname: "sb-openapi.zalopay.vn",
      port: 443,
      path: "/v2/create",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const request = https.request(options, (zaloRes) => {
      let body = "";
      zaloRes.on("data", (chunk) => body += chunk);
      zaloRes.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          res.status(200).json({
            code: 200,
            message: "Tạo giao dịch ZaloPay thành công",
            data: {
              ...parsed,
              app_trans_id: appTransId
            }
          });
        } catch (e) {
          res.status(500).json({ code: 500, message: "Lỗi phân tích kết quả ZaloPay", error: e.message });
        }
      });
    });

    request.on("error", (e) => {
      res.status(500).json({ code: 500, message: "Lỗi kết nối ZaloPay", error: e.message });
    });

    request.write(postData);
    request.end();

  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// POST create order from cart
router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentMethod = (req.query.paymentMethod || req.body.paymentMethod) === "ZaloPay"
      ? "ZaloPay"
      : "COD";
    const appTransId = req.query.appTransId || req.body.appTransId;
    const cartItems = await Cart.find({ userId });
    if (cartItems.length === 0) {
      return res.status(400).json({ code: 400, message: "Giỏ hàng đang trống" });
    }

    let totalPrice = 0;
    const orderItems = cartItems.map((item) => {
      totalPrice += (item.price || 0) * (item.quantity || 1);
      return {
        product: item.productId,
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        colorId: item.colorId,
        colorName: item.colorName,
        price: item.price,
        quantity: item.quantity,
      };
    });

    // 1. Kiểm tra tồn kho trước khi đặt hàng
    for (const item of cartItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          code: 404,
          message: `Không tìm thấy sản phẩm với ID: ${item.productId}`,
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          code: 400,
          message: `Số lượng sản phẩm "${product.name}" không đủ`,
        });
      }
    }

    const orderCode = `#SH-${Date.now().toString().slice(-6)}`;
    const userDoc = userId ? await User.findById(userId) : null;

    let discountAmount = 0;
    let zpTransIdVal = "";
    if (paymentMethod === "ZaloPay") {
      if (!appTransId) {
        return res.status(400).json({ code: 400, message: "Thiếu mã giao dịch ZaloPay (appTransId)" });
      }

      // Kiểm tra trùng lặp mã giao dịch (Chống Replay Attack)
      const existingOrder = await Order.findOne({ appTransId });
      if (existingOrder) {
        return res.status(400).json({ code: 400, message: "Mã giao dịch ZaloPay này đã được sử dụng" });
      }

      try {
        const queryResult = await queryZaloPayOrder(appTransId);
        console.log("ZaloPay query result:", queryResult);

        if (!queryResult || queryResult.return_code !== 1) {
          return res.status(400).json({
            code: 400,
            message: `Xác thực thanh toán ZaloPay thất bại: ${queryResult ? queryResult.return_message : "Không nhận được phản hồi từ ZaloPay"}`
          });
        }

        // Đối chiếu số tiền thanh toán (Số tiền ZaloPay nhận = totalPrice + ship 40.000)
        const expectedAmount = totalPrice + 40000;
        if (Number(queryResult.amount) !== expectedAmount) {
          return res.status(400).json({
            code: 400,
            message: `Số tiền thanh toán ZaloPay không khớp. Yêu cầu: ${expectedAmount}, Thực nhận: ${queryResult.amount}`
          });
        }

        discountAmount = Number(queryResult.discount_amount || 0);
        zpTransIdVal = String(queryResult.zp_trans_id || "");
      } catch (err) {
        console.error("Lỗi khi truy vấn đơn hàng ZaloPay:", err);
        return res.status(500).json({ code: 500, message: "Lỗi máy chủ khi xác thực thanh toán ZaloPay" });
      }
    }

    const newOrder = new Order({
      orderCode,
      items: orderItems,
      subtotal: totalPrice,
      totalPrice,
      discount: discountAmount,
      totalAmount: totalPrice + 40000 - discountAmount,
      status: "Chờ xác nhận",
      shippingFee: 40000,
      paymentMethod,
      user: userId || null,
      receiverName: userDoc ? userDoc.name : "",
      receiverPhone: userDoc ? userDoc.phone : "",
      deliveryAddress: userDoc ? userDoc.address : "",
      appTransId: paymentMethod === "ZaloPay" ? appTransId : undefined,
      zpTransId: zpTransIdVal || "",
    });

    const savedOrder = await newOrder.save();

    // Cập nhật tồn kho và số lượng đã bán cho từng sản phẩm
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: {
          stock: -item.quantity,
          soldQuantity: item.quantity
        }
      });
    }

    // Clear the cart after order created
    await Cart.deleteMany({ userId });

    res.status(200).json({
      code: 200,
      message: "Đặt hàng thành công",
      data: savedOrder,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// GET all orders
router.get("/get-orders", authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).populate("user").sort({ createdAt: -1 });

    // Fallback to user profile info if order receiver fields are empty
    const mappedOrders = orders.map(order => {
      const orderObj = order.toObject();
      if (order.user) {
        if (!orderObj.receiverName || orderObj.receiverName.trim() === "") {
          orderObj.receiverName = order.user.name || "";
        }
        if (!orderObj.receiverPhone || orderObj.receiverPhone.trim() === "") {
          orderObj.receiverPhone = order.user.phone || "";
        }
        if (!orderObj.deliveryAddress || orderObj.deliveryAddress.trim() === "") {
          orderObj.deliveryAddress = order.user.address || "";
        }
      }
      return orderObj;
    });

    res.status(200).json({
      code: 200,
      message: "Lấy danh sách đơn hàng thành công",
      data: mappedOrders,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: [] });
  }
});

// Admin: get all orders with complete customer and product information.
router.get(
  "/admin/orders",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const orders = await Order.find({})
        .populate("user", "name phone address email")
        .populate({
          path: "items.product",
          select: "name image price category",
          populate: {
            path: "category",
            select: "name image isActive"
          }
        })
        .sort({ createdAt: -1 });

      res.status(200).json({
        code: 200,
        message: "Lấy danh sách đơn hàng quản trị thành công",
        data: orders.map(mapOrderForResponse),
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: [] });
    }
  },
);

// Admin: get one order and every product contained in it.
router.get(
  "/admin/orders/:id",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const order = await Order.findById(req.params.id)
        .populate("user", "name phone address email")
        .populate({
          path: "items.product",
          select: "name image price category",
          populate: {
            path: "category",
            select: "name image isActive"
          }
        });

      if (!order) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy đơn hàng",
          data: null,
        });
      }

      res.status(200).json({
        code: 200,
        message: "Lấy chi tiết đơn hàng thành công",
        data: mapOrderForResponse(order),
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: null });
    }
  },
);

// Admin: update order status. JWT and an admin role are both required.
router.put(
  "/admin/orders/:id/status",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const status = String(req.body.status || "").trim();
      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({
          code: 400,
          message: "Trạng thái đơn hàng không hợp lệ",
          data: null,
        });
      }

      const orderCheck = await Order.findById(req.params.id).populate("user");
      if (!orderCheck) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy đơn hàng",
          data: null,
        });
      }

      const updateFields = { status, ...getStatusTimestamp(status) };
      if (status === "Đã hủy" && orderCheck.status !== "Đã hủy") {
        if (orderCheck.paymentMethod === "ZaloPay") {
          let zpTransId = orderCheck.zpTransId;
          if (!zpTransId && orderCheck.appTransId) {
            try {
              const queryResult = await queryZaloPayOrder(orderCheck.appTransId);
              if (queryResult && queryResult.return_code === 1) {
                zpTransId = queryResult.zp_trans_id;
                orderCheck.zpTransId = zpTransId;
                await orderCheck.save();
              }
            } catch (err) {
              console.error("Lỗi khi tìm zpTransId cho đơn hàng cũ (Admin):", err);
            }
          }

          if (zpTransId) {
            try {
              const refundRes = await refundZaloPay(
                zpTransId,
                orderCheck.totalAmount,
                "Hoan tien huy don (Admin): Admin huy don"
              );
              console.log("ZaloPay refund response (Admin):", refundRes);
            } catch (refundErr) {
              console.error("Lỗi khi gọi API hoàn tiền ZaloPay (Admin):", refundErr);
            }
          }
        }
      }

      if (orderCheck.user) {
        if ((!orderCheck.receiverName || orderCheck.receiverName.trim() === "") && orderCheck.user.name) {
          updateFields.receiverName = orderCheck.user.name;
        }
        if ((!orderCheck.receiverPhone || orderCheck.receiverPhone.trim() === "") && orderCheck.user.phone) {
          updateFields.receiverPhone = orderCheck.user.phone;
        }
        if ((!orderCheck.deliveryAddress || orderCheck.deliveryAddress.trim() === "") && orderCheck.user.address) {
          updateFields.deliveryAddress = orderCheck.user.address;
        }
      }

      const order = await Order.findByIdAndUpdate(
        req.params.id,
        { $set: updateFields },
        { returnDocument: 'after', runValidators: true },
      )
        .populate("user", "name phone address email")
        .populate({
          path: "items.product",
          select: "name image price category",
          populate: {
            path: "category",
            select: "name image isActive"
          }
        });

      res.status(200).json({
        code: 200,
        message: "Cập nhật trạng thái đơn hàng thành công",
        data: mapOrderForResponse(order),
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: null });
    }
  },
);

// Admin: Cập nhật số lượng sản phẩm trong đơn hàng và cập nhật Tồn kho
router.put(
  "/admin/orders/:orderId/update-item-quantity",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { productId, newQuantity } = req.body;

      if (!productId || newQuantity === undefined) {
        return res.status(400).json({ code: 400, message: "Thiếu thông tin sản phẩm hoặc số lượng mới" });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
      }

      const item = order.items.find(item => item.productId === productId || (item.product && item.product.toString() === productId));
      if (!item) {
        return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm trong đơn hàng" });
      }

      const oldQuantity = item.quantity;
      const quantityDiff = newQuantity - oldQuantity;

      // Kiểm tra tồn kho trước khi tăng số lượng
      if (quantityDiff > 0) {
        const product = await Product.findById(productId);
        if (!product || product.stock < quantityDiff) {
          return res.status(400).json({
            code: 400,
            message: "Số lượng sản phẩm không đủ"
          });
        }
      }

      // Cập nhật tồn kho của sản phẩm
      // Nếu số lượng mới > số lượng cũ, trừ bớt tồn kho (giảm stock)
      // Nếu số lượng mới < số lượng cũ, cộng lại vào tồn kho (tăng stock)
      await Product.findByIdAndUpdate(productId, {
        $inc: { stock: -quantityDiff }
      });

      item.quantity = newQuantity;

      // Tính toán lại tổng tiền
      let newSubtotal = 0;
      order.items.forEach(i => {
        newSubtotal += (i.price || 0) * (i.quantity || 0);
      });
      order.subtotal = newSubtotal;
      order.totalPrice = newSubtotal;
      order.totalAmount = newSubtotal + (order.shippingFee || 0);

      await order.save();

      res.status(200).json({
        code: 200,
        message: "Cập nhật số lượng sản phẩm và tồn kho thành công",
        data: mapOrderForResponse(order)
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }
);

// PUT update order shipping info
router.put("/orders/:id/shipping", authenticateToken, async (req, res) => {
  try {
    const { receiverName, receiverPhone, deliveryAddress } = req.body;
    if (!receiverName || !receiverPhone || !deliveryAddress) {
      return res.status(400).json({ code: 400, message: "Thiếu thông tin người nhận" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
    }

    // Check permissions: admin can update any order, customer can only update their own
    const isAdmin = ADMIN_ROLES.includes(req.user.role);
    if (!isAdmin && order.user.toString() !== req.user.id) {
      return res.status(403).json({ code: 403, message: "Bạn không có quyền cập nhật đơn hàng này" });
    }

    // Update order shipping info
    order.receiverName = receiverName;
    order.receiverPhone = receiverPhone;
    order.deliveryAddress = deliveryAddress;
    await order.save();

    // Also update user profile if it's the customer updating their own info
    if (!isAdmin && order.user) {
      await User.findByIdAndUpdate(req.user.id, {
        name: receiverName,
        phone: receiverPhone,
        address: deliveryAddress
      });
    }

    const updatedOrder = await Order.findById(req.params.id)
      .populate("user", "name phone address email")
      .populate({
        path: "items.product",
        select: "name image price category"
      });

    res.status(200).json({
      code: 200,
      message: "Cập nhật thông tin giao hàng thành công",
      data: mapOrderForResponse(updatedOrder)
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// POST cancel order
router.post("/cancel-order", authenticateToken, async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    if (!orderId) {
      return res.status(400).json({ code: 400, message: "Thiếu mã đơn hàng" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
    }

    const userRole = (req.user.role || "").trim().toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(userRole);
    const isOwner = order.user && order.user.toString() === req.user.id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ code: 403, message: "Bạn không có quyền hủy đơn hàng này" });
    }

    if (order.status !== "Đã hủy") {
      // BƯỚC 1: Kiểm tra xem đơn hàng có thanh toán qua ví điện tử ZaloPay không
      if (order.paymentMethod === "ZaloPay") {
        let zpTransId = order.zpTransId;

        // BƯỚC 1.1: Cơ chế phòng hờ (Fallback) cho các đơn hàng cũ tạo trước đó chưa lưu zpTransId.
        // Thực hiện gọi hàm query trạng thái từ ZaloPay bằng mã appTransId để truy xuất mã zp_trans_id gốc.
        if (!zpTransId && order.appTransId) {
          try {
            const queryResult = await queryZaloPayOrder(order.appTransId);
            if (queryResult && queryResult.return_code === 1) {
              zpTransId = queryResult.zp_trans_id;
              order.zpTransId = zpTransId; // Lưu lại vào đơn hàng để lần sau không cần truy vấn nữa
            }
          } catch (err) {
            console.error("Lỗi khi tìm zpTransId cho đơn hàng cũ:", err);
          }
        }

        // BƯỚC 1.2: Nếu có mã giao dịch zpTransId từ ZaloPay, bắt đầu gửi yêu cầu hoàn tiền
        if (zpTransId) {
          try {
            const refundRes = await refundZaloPay(
              zpTransId,
              order.totalAmount,
              "Hoan tien huy don: " + (reason || "Khach hang huy")
            );
            console.log("ZaloPay refund response:", refundRes);
          } catch (refundErr) {
            console.error("Lỗi khi gọi API hoàn tiền ZaloPay:", refundErr);
          }
        }
      }

      order.status = "Đã hủy";
      order.cancelReason = reason || "";
      await order.save();

      // Hoàn trả lại số lượng tồn kho cho các sản phẩm trong đơn
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const prodId = item.product || item.productId;
          const qty = item.quantity || 1;
          if (prodId) {
            await Product.findByIdAndUpdate(prodId, {
              $inc: {
                stock: qty,
                soldQuantity: -qty
              }
            });
          }
        }
      }
    }

    res.status(200).json({
      code: 200,
      message: "Đơn hàng đã được hủy",
      data: order,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});
// POST update order status
router.post("/update-status", authenticateToken, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { orderId, status } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ code: 400, message: "Thiếu mã đơn hàng hoặc trạng thái" });
    }

    const orderCheck = await Order.findById(orderId);
    if (!orderCheck) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
    }

    if (status === "Đã hủy" && orderCheck.status !== "Đã hủy") {
      if (orderCheck.paymentMethod === "ZaloPay") {
        let zpTransId = orderCheck.zpTransId;
        if (!zpTransId && orderCheck.appTransId) {
          try {
            const queryResult = await queryZaloPayOrder(orderCheck.appTransId);
            if (queryResult && queryResult.return_code === 1) {
              zpTransId = queryResult.zp_trans_id;
              orderCheck.zpTransId = zpTransId;
              await orderCheck.save();
            }
          } catch (err) {
            console.error("Lỗi khi tìm zpTransId cho đơn hàng cũ (Admin update-status):", err);
          }
        }

        if (zpTransId) {
          try {
            const refundRes = await refundZaloPay(
              zpTransId,
              orderCheck.totalAmount,
              "Hoan tien huy don (Admin update-status): Admin huy don"
            );
            console.log("ZaloPay refund response (Admin update-status):", refundRes);
          } catch (refundErr) {
            console.error("Lỗi khi gọi API hoàn tiền ZaloPay (Admin update-status):", refundErr);
          }
        }
      }
    }

    const updateFields = { status, ...getStatusTimestamp(status) };

    const result = await Order.updateOne(
      { _id: orderId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đơn hàng" });
    }

    const updatedOrder = await Order.findById(orderId);

    res.status(200).json({
      code: 200,
      message: "Cập nhật trạng thái thành công",
      data: updatedOrder,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});




// POST clear all items in cart
router.post("/clear-cart", authenticateToken, async (req, res) => {
  try {
    await Cart.deleteMany({ userId: req.user.id });
    res.status(200).json({
      code: 200,
      message: "Đã xóa giỏ hàng thành công",
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
