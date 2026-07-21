const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Order = require("../models/Order");

const redis = require("redis");
const client = process.env.REDIS_URL
  ? redis.createClient({ url: process.env.REDIS_URL })
  : null;

if (client) {
  client.on("error", (error) => console.error(`Redis error: ${error.message}`));
  client
    .connect()
    .catch((error) =>
      console.error(`Redis connection failed: ${error.message}`),
    );
}

// GET all products with pagination (Default 6 products per page)
router.get("/get-all-product", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    // Lấy tổng số lượng sản phẩm để Client biết khi nào hết sản phẩm
    const totalProducts = await Product.countDocuments({});

    // Lấy danh sách sản phẩm theo page và limit (sắp xếp mới nhất lên đầu để đảm bảo tính nhất quán khi phân trang)
    const products = await Product.find({})
      .sort({ createdAt: -1 })
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

// GET 4 latest products
router.get("/get-latest-product", async (req, res) => {
  try {
    const latestProducts = await Product.find({})
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
    const product = await Product.findById(req.params.id);
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
    const { productId, customerName, rating, content } = req.body;
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

    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    const newReview = {
      id: Date.now().toString(),
      customerName,
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

    res.status(200).json({
      code: 200,
      message: "Đã thêm đánh giá thành công",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// GET all cart items
router.get("/get-cart", async (req, res) => {
  try {
    const cartItems = await Cart.find({}).sort({ createdAt: -1 });
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
router.post("/add-to-cart", async (req, res) => {
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
    if (colorId && product.colors && product.colors.length > 0) {
      const matchedColor = product.colors.find(
        (c) => c.id == colorId || c._id == colorId,
      );
      if (matchedColor) {
        colorName = matchedColor.name;
      }
    }

    const qty = parseInt(quantity) || 1;

    let existingCartItem = await Cart.findOne({
      productId: String(productId),
      colorId: colorId ? String(colorId) : null,
    });

    if (existingCartItem) {
      existingCartItem.quantity += qty;
      await existingCartItem.save();
    } else {
      existingCartItem = new Cart({
        productId: String(productId),
        productName: product.name,
        productImage: product.image,
        colorId: colorId ? String(colorId) : null,
        colorName:
          colorName ||
          (product.colors && product.colors.length > 0
            ? product.colors[0].name
            : ""),
        price: product.price,
        quantity: qty,
      });
      await existingCartItem.save();
    }

    const allCartItems = await Cart.find({}).sort({ createdAt: -1 });

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
router.post("/update-cart-quantity", async (req, res) => {
  try {
    const { cartItemId, quantity } = req.body;
    const qty = parseInt(quantity);
    if (qty <= 0) {
      await Cart.findByIdAndDelete(cartItemId);
    } else {
      await Cart.findByIdAndUpdate(cartItemId, { quantity: qty });
    }
    const cartItems = await Cart.find({}).sort({ createdAt: -1 });
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
router.delete("/delete-cart-item/:id", async (req, res) => {
  try {
    await Cart.findByIdAndDelete(req.params.id);
    const cartItems = await Cart.find({}).sort({ createdAt: -1 });
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
router.post("/add-product", async (req, res) => {
  try {
    const {
      name,
      price,
      image,
      category,
      description,
      rating,
      reviewCount,
      stock,
      colors,
      reviews,
    } = req.body;
    const newProduct = new Product({
      name,
      price,
      image,
      category,
      description,
      rating,
      reviewCount,
      stock,
      colors,
      reviews,
    });
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/search-product", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const keyword = req.query.keyword || "";
    const skip = (page - 1) * limit;
    const cacheKey = `search:v2:${keyword}:${page}:${limit}`;

    // Check cache trước
    const cached = client?.isReady
      ? await client.get(cacheKey).catch(() => null)
      : null;
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const query = keyword
      ? {
          name: {
            $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        }
      : {};

    const [products, totalProducts] = await Promise.all([
      Product.find(query).skip(skip).limit(limit),
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
router.post("/shipping-quote", async (req, res) => {
  try {
    const { address, provider } = req.body;
    const cartItems = await Cart.find({});
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

module.exports = router;
