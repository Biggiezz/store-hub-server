const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

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
        limit
      }
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
      data: latestProducts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// POST create a new product
router.post("/add-product", async (req, res) => {
  try {
    const { name, price, image, category, description } = req.body;
    const newProduct = new Product({
      name,
      price,
      image,
      category,
      description,
    });
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
