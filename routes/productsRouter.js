const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const upload = require("../middlewares/upload");
const { authenticateToken, authorizeRoles } = require("../middlewares/auth");
const ADMIN_ROLES = ["admin", "superadmin", "quản lý cửa hàng", "quản trị viên tối cao", "quản trị viên"];

const redis = require("redis");
let client = null;

const productSort = (sort) => ({
  price_asc: { price: 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: 1 },
}[sort] || { createdAt: -1, _id: -1 });

const resolveCategoryQuery = async (category) => {
  const categoryMap = {
    "1": "Điện thoại",
    "2": "Máy tính",
    "3": "Tai nghe",
    "4": "Đồng hồ",
    "laptop": "Máy tính"
  };

  let targetCategory = categoryMap[category] || category;

  if (mongoose.Types.ObjectId.isValid(targetCategory)) {
    const cat = await Category.findById(targetCategory);
    if (cat) {
      return { $in: [ new mongoose.Types.ObjectId(targetCategory), cat.name ] };
    } else {
      return new mongoose.Types.ObjectId(targetCategory);
    }
  } else {
    const cat = await Category.findOne({ name: { $regex: new RegExp("^" + targetCategory + "$", "i") } });
    if (cat) {
      return { $in: [ cat._id, targetCategory ] };
    } else {
      return targetCategory;
    }
  }
};

// --- Code gốc của team (được comment lại để tham chiếu) ---
// if (client) {
//   client.on("error", (error) => console.error(`Redis error: ${error.message}`));
//   client
//     .connect()
//     .catch((error) =>
//       console.error(`Redis connection failed: ${error.message}`),
//     );
// }

// --- Code xử lý Redis an toàn cho máy local (tự động chuyển sang MongoDB nếu chưa bật Redis) ---
if (process.env.REDIS_URL) {
  client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: false, // Tắt tự động kết nối lại liên tục để không bị rác terminal nếu chưa cài Redis Server
    },
  });

  client.on("error", () => {
    // Bỏ qua log rác khi không có dịch vụ Redis trên máy
  });

  client
    .connect()
    .then(() => console.log("✅ Redis Connected Successfully"))
    .catch(() => {
      console.log(
        "⚠️ Máy cục bộ chưa chạy Redis Server (Tự động bỏ qua Redis, dùng MongoDB trực tiếp).",
      );
    });
}

// GET all products with pagination (Default 6 products per page)
router.get("/get-all-product", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    // Lấy tổng số lượng sản phẩm để Client biết khi nào hết sản phẩm
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const sort = String(req.query.sort || "").trim();
    const query = status
      ? status === "active"
        ? { $or: [{ status: "active" }, { status: { $exists: false } }] }
        : { status }
      : { status: { $nin: ["inactive", "Ngừng bán", "hidden"] } };

    if (category) {
      query.category = await resolveCategoryQuery(category);
    }
    const totalProducts = await Product.countDocuments(query);

    // Lấy danh sách sản phẩm theo page và limit
    const products = await Product.find(query)
      .collation({ locale: "vi", strength: 1 })
      .sort(productSort(sort))
      .populate("category")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      code: 200,
      message: "Lấy danh sách sản phẩm thành công",
      data: products,
      pagination: {
        totalProducts,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET list of active unique categories from products
router.get("/get-categories", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true });
    res.status(200).json({
      code: 200,
      message: "Lấy danh sách danh mục thành công",
      data: categories,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// GET 4 latest products
router.get("/get-latest-product", async (req, res) => {
  try {
    const latestProducts = await Product.find({ isActive: { $ne: false } })
      .populate("category")
      .sort({ createdAt: -1 })
      .limit(4);
    res.status(200).json({
      code: 200,
      message: "Lấy danh sách sản phẩm mới nhất thành công",
      data: latestProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET single product detail by ID
router.get("/get-product-by-id/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product) {
      return res
        .status(404)
        .json({ code: 404, message: "Không tìm thấy sản phẩm", data: null });
    }
    res.status(200).json({
      code: 200,
      message: "Lấy chi tiết sản phẩm thành công",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null });
  }
});

// POST add a product review
router.post("/add-review", async (req, res) => {
  try {
    const { productId, customerName, customerImage, rating, content, orderId } = req.body;
    if (!productId || !customerName || rating === undefined || !content) {
      return res
        .status(400)
        .json({ code: 400, message: "Thiếu thông tin đánh giá" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ code: 404, message: "Không tìm thấy sản phẩm" });
    }

    // Check if order was already reviewed
    if (orderId) {
      const order = await Order.findById(orderId);
      if (order && order.isReviewed) {
        return res
          .status(400)
          .json({ code: 400, message: "Đơn hàng này đã được đánh giá trước đó" });
      }
    }

    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    const newReview = {
      customerName,
      customerImage: customerImage || "",
      rating: parseFloat(rating),
      content,
      createdAt: formattedDate,
    };

    if (!product.reviews) {
      product.reviews = [];
    }
    product.reviews.unshift(newReview);

    const totalRating = product.reviews.reduce(
      (acc, cur) => acc + (cur.rating || 0),
      0,
    );
    product.reviewCount = product.reviews.length;
    product.rating = parseFloat((totalRating / product.reviewCount).toFixed(1));

    await product.save();

    if (orderId) {
      await Order.findByIdAndUpdate(orderId, { isReviewed: true });
    }

    res.status(200).json({
      code: 200,
      message: "Đã thêm đánh giá thành công",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// POST reply to a review
router.post("/reply-review", async (req, res) => {
  try {
    const { productId, reviewId, replyContent } = req.body;
    if (!productId || !reviewId || !replyContent) {
      return res.status(400).json({ code: 400, message: "Thiếu thông tin phản hồi" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm" });
    }

    const review = product.reviews.find((r) => String(r._id) === String(reviewId));
    if (!review) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy đánh giá" });
    }

    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    review.replyContent = replyContent;
    review.replyCreatedAt = formattedDate;

    await product.save();

    res.status(200).json({
      code: 200,
      message: "Đã phản hồi đánh giá thành công",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// GET all cart items
router.get("/get-cart", authenticateToken, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Lấy danh sách giỏ hàng thành công",
      data: cartItems,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: [] });
  }
});

// POST add product to cart
router.post("/add-to-cart", authenticateToken, async (req, res) => {
  try {
    const { productId, colorId, quantity } = req.body;
    if (!productId) {
      return res
        .status(400)
        .json({ code: 400, message: "Mã sản phẩm không hợp lệ" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ code: 404, message: "Không tìm thấy sản phẩm" });
    }

    let colorName = "";
    let colorHex = "";
    if (colorId && product.colors && product.colors.length > 0) {
      const matchedColor = product.colors.find((c) => String(c._id) === String(colorId));
      if (matchedColor) {
        colorName = matchedColor.name;
        colorHex = matchedColor.hex; // Lấy thêm mã màu Hex tương ứng
      }
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ code: 400, message: "Số lượng không hợp lệ" });
    }

    let existingCartItem = await Cart.findOne({
      userId: req.user.id,
      productId: String(productId),
      colorId: colorId ? String(colorId) : null,
    });

    if (existingCartItem) {
      existingCartItem.quantity += qty;
      await existingCartItem.save();
    } else {
      existingCartItem = new Cart({
        userId: req.user.id,
        productId: String(productId),
        productName: product.name,
        productImage: product.image,
        colorId: colorId ? String(colorId) : null,
        colorName:
          colorName ||
          (product.colors && product.colors.length > 0
            ? product.colors[0].name
            : ""),
        // Lưu mã Hex tương ứng để hiển thị chấm màu ở Client (mặc định lấy màu đầu tiên nếu lỗi)
        colorHex:
          colorHex ||
          (product.colors && product.colors.length > 0
            ? product.colors[0].hex
            : ""),
        price: product.price,
        quantity: qty,
      });
      await existingCartItem.save();
    }

    const allCartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });

    res.status(200).json({
      code: 200,
      message: "Đã thêm sản phẩm vào giỏ hàng",
      data: allCartItems,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// POST update cart item quantity
router.post("/update-cart-quantity", authenticateToken, async (req, res) => {
  try {
    const { cartItemId, quantity } = req.body;
    const qty = Number(quantity);
    if (!mongoose.isValidObjectId(cartItemId) || !Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ code: 400, message: "Số lượng không hợp lệ" });
    }
    let cartItem;
    if (qty <= 0) {
      cartItem = await Cart.findOneAndDelete({ _id: cartItemId, userId: req.user.id });
    } else {
      cartItem = await Cart.findOneAndUpdate(
        { _id: cartItemId, userId: req.user.id },
        { quantity: qty },
      );
    }
    if (!cartItem) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Cập nhật số lượng thành công",
      data: cartItems,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// DELETE single item from cart
router.delete("/delete-cart-item/:id", authenticateToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ code: 400, message: "Sản phẩm trong giỏ hàng không hợp lệ" });
    }
    const cartItem = await Cart.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!cartItem) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm trong giỏ hàng" });
    }
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Xóa sản phẩm khỏi giỏ hàng thành công",
      data: cartItems,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// POST create a new product
router.post("/add-product", authenticateToken, authorizeRoles(...ADMIN_ROLES), (req, res) =>
  upload.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ code: 400, message: uploadError.message, data: null });
    }
    try {
      const { name, price, category, description, stock, colors, isActive, soldQuantity, rating } = req.body;
      if (!name || !price || !category || !req.file) {
        return res.status(400).json({
          code: 400,
          message: "Tên, giá, danh mục và hình ảnh là bắt buộc",
          data: null,
        });
      }

      if (isNaN(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ code: 400, message: "Giá bán phải là số hợp lệ lớn hơn 0", data: null });
      }

      if (isNaN(Number(stock)) || Number(stock) < 0) {
        return res.status(400).json({ code: 400, message: "Số lượng tồn kho phải là số hợp lệ không âm", data: null });
      }

      // Phân giải danh mục từ name sang ID nếu client gửi text danh mục
      let categoryId = category.trim();
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        const cat = await Category.findOne({ name: categoryId });
        if (cat) {
          categoryId = cat._id;
        } else {
          const newCat = await Category.create({ name: categoryId });
          categoryId = newCat._id;
        }
      }

      const image = req.file.path;
      const parsedColors = colors ? JSON.parse(colors) : [];
      const savedProduct = await Product.create({
        name: name.trim(),
        price: Number(price),
        image,
        category: categoryId,
        description: description || "",
        stock: Number(stock) || 0,
        soldQuantity: Number(soldQuantity) || 0,
        rating: Number(rating) || 0,
        colors: parsedColors,
        isActive: isActive !== undefined ? isActive === 'true' || isActive === true : true,
      });

      // Clear search cache
      if (client?.isReady) {
        const keys = await client.keys("search:v3:*");
        if (keys.length > 0) await client.del(keys);
      }

      const populatedProduct = await Product.findById(savedProduct._id).populate("category");
      res.status(201).json({ code: 201, message: "Thêm sản phẩm thành công", data: populatedProduct });
    } catch (error) {
      res.status(400).json({ code: 400, message: error.message, data: null });
    }
  }),
);

router.put("/update-product/:id", authenticateToken, authorizeRoles(...ADMIN_ROLES), (req, res) =>
  upload.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ code: 400, message: uploadError.message, data: null });
    }
    try {
      // Kiểm tra sản phẩm tồn tại bằng truy vấn thô (tránh Mongoose ép kiểu lỗi trên bản ghi cũ)
      const rawProduct = await Product.collection.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
      if (!rawProduct) {
        return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm", data: null });
      }

      console.log("update-product body:", req.body);
      const { name, price, category, description, stock, colors, isActive, soldQuantity, rating } = req.body;
      if (!name || !price || !category) {
        return res.status(400).json({ code: 400, message: "Thiếu thông tin sản phẩm", data: null });
      }

      // Phân giải danh mục từ name sang ID nếu client gửi tên danh mục
      let categoryId = category.trim();
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        const cat = await Category.findOne({ name: categoryId });
        if (cat) {
          categoryId = cat._id;
        } else {
          const newCat = await Category.create({ name: categoryId });
          categoryId = newCat._id;
        }
      }

      const updateData = {
        name: name.trim(),
        price: Number(price),
        category: categoryId,
        description: description || "",
        stock: Number(stock) || 0,
      };

      if (isActive !== undefined) {
        updateData.isActive = isActive === 'true' || isActive === true;
      }
      if (soldQuantity !== undefined) {
        updateData.soldQuantity = Number(soldQuantity);
      }
      if (rating !== undefined) {
        updateData.rating = Number(rating);
      }
      if (colors) {
        updateData.colors = JSON.parse(colors);
      }
      if (req.file) {
        updateData.image = req.file.path;
      }

      const populatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      ).populate("category");

      // Xóa cache tìm kiếm
      if (client?.isReady) {
        const keys = await client.keys("search:v3:*");
        if (keys.length > 0) await client.del(keys);
      }

      res.json({ code: 200, message: "Cập nhật sản phẩm thành công", data: populatedProduct });
    } catch (error) {
      res.status(400).json({ code: 400, message: error.message, data: null });
    }
  }),
);

router.get("/search-product", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const keyword = req.query.keyword || "";
    const category = String(req.query.category || "").trim();
    const showInactive = req.query.showInactive === 'true';
    const sort = String(req.query.sort || "").trim();
    const skip = (page - 1) * limit;
    const cacheKey = `search:v3:${keyword}:${category}:${page}:${limit}:${showInactive}:${sort}`;

    // Check cache trước
    const cached = client?.isReady
      ? await client.get(cacheKey).catch(() => null)
      : null;
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const query = {};
    if (!showInactive) {
      query.isActive = { $ne: false };
    }
    if (keyword) {
      query.name = {
            $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
      };
    }

    if (category) {
      query.category = await resolveCategoryQuery(category);
    }

    const [products, totalProducts] = await Promise.all([
      Product.find(query).populate("category").sort(productSort(sort)).skip(skip).limit(limit),
      Product.countDocuments(query),
    ]);

    const result = {
      code: 200,
      data: products,
      message: "Success",
      pagination: {
        totalProducts,
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        limit,
      },
    };

    // Cache 5 phút
    if (client?.isReady) {
      await client.setEx(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ code: 500, data: null, message: error.message });
  }
});

// POST calculate shipping fee quote
router.post("/shipping-quote", authenticateToken, async (req, res) => {
  try {
    const { address, provider } = req.body;
    const cartItems = await Cart.find({ userId: req.user.id });
    let shippingFee = cartItems.length === 0 ? 0 : 40000;

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    const estimatedDelivery = deliveryDate.toISOString().split("T")[0];

    res.status(200).json({
      success: true,
      code: 200,
      message: "Tính phí vận chuyển thành công",
      data: {
        provider: provider || "GHN",
        service_id: 53320,
        service_name: "Giao hàng tiêu chuẩn",
        shipping_fee: shippingFee,
        estimated_delivery: estimatedDelivery,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      code: 500,
      message: error.message,
      data: null,
    });
  }
});

// POST /api/productsRouter/checkout - Thanh toán giỏ hàng và tạo Đơn hàng
router.post("/checkout", authenticateToken, async (req, res) => {
  try {
    const Order = require("../models/Order");
    const cartItems = await Cart.find({ userId: req.user.id });

    if (cartItems.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "Giỏ hàng của bạn đang trống"
      });
    }

    const orderItems = cartItems.map((item) => ({
      product: item.productId,
      quantity: item.quantity,
      price: item.price,
      color: { _id: item.colorId, name: item.colorName }
    }));
    const subtotal = cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    const shippingFee = subtotal === 0 ? 0 : 40000;
    const totalAmount = subtotal + shippingFee;

    const newOrder = new Order({
      items: orderItems,
      subtotal,
      shippingFee,
      totalAmount,
      status: "completed",
      user: req.user.id,
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

    await Cart.deleteMany({ userId: req.user.id });

    res.status(200).json({
      code: 200,
      message: "Thanh toán đơn hàng thành công!",
      data: savedOrder
    });
  } catch (error) {
    console.error("Lỗi khi thanh toán đơn hàng:", error);
    res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi thanh toán đơn hàng."
    });
  }
});

// POST add a new category (Admin only)
router.post("/add-category", upload.single("image"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ code: 400, message: "Tên danh mục là bắt buộc" });
    }

    const image = req.file ? req.file.path : "";
    const existingCategory = await Category.findOne({ name: name.trim() });
    if (existingCategory) {
      return res.status(400).json({ code: 400, message: "Danh mục đã tồn tại" });
    }

    const newCategory = await Category.create({
      name: name.trim(),
      image,
    });

    res.status(201).json({ code: 201, message: "Thêm danh mục thành công", data: newCategory });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// PUT update category
router.put("/update-category/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy danh mục" });
    }

    if (name) category.name = name.trim();
    if (isActive !== undefined) category.isActive = isActive === "true" || isActive === true;
    if (req.file) category.image = req.file.path;

    const updatedCategory = await category.save();
    res.status(200).json({ code: 200, message: "Cập nhật danh mục thành công", data: updatedCategory });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// DELETE category
router.delete("/delete-category/:id", authenticateToken, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy danh mục" });
    }

    // Kiểm tra xem có sản phẩm nào thuộc danh mục này không
    const hasProduct = await Product.exists({ category: req.params.id });
    if (hasProduct) {
      return res.status(400).json({ code: 400, message: "Không thể xóa danh mục này vì có sản phẩm đang thuộc danh mục này" });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json({ code: 200, message: "Xóa danh mục thành công" });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// DELETE product (Admin & Superadmin)
router.delete("/delete-product/:id", authenticateToken, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ code: 404, message: "Không tìm thấy sản phẩm" });
    }

    await Product.findByIdAndDelete(req.params.id);

    // Clear search cache
    if (client?.isReady) {
      const keys = await client.keys("search:v3:*");
      if (keys.length > 0) await client.del(keys);
    }

    res.status(200).json({ code: 200, message: "Xóa sản phẩm thành công" });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;
