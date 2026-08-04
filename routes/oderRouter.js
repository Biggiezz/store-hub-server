const express = require("express");
const router = express.Router();
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

// POST create order from cart
router.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentMethod = (req.query.paymentMethod || req.body.paymentMethod) === "ZaloPay"
      ? "ZaloPay"
      : "COD";
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

    const orderCode = `#SH-${Date.now().toString().slice(-6)}`;

    const userDoc = userId ? await User.findById(userId) : null;

    const newOrder = new Order({
      orderCode,
      items: orderItems,
      subtotal: totalPrice,
      totalPrice,
      totalAmount: totalPrice + 40000,
      status: "Chờ xác nhận",
      shippingFee: 40000,
      paymentMethod,
      user: userId || null,
      receiverName: userDoc ? userDoc.name : "",
      receiverPhone: userDoc ? userDoc.phone : "",
      deliveryAddress: userDoc ? userDoc.address : "",
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
        { new: true, runValidators: true },
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
    const isOwner = order.user && order.user.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ code: 403, message: "Bạn không có quyền hủy đơn hàng này" });
    }

    if (order.status !== "Đã hủy") {
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
