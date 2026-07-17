const express = require("express");
const router = express.Router();
const Product = require("../models/Product");

// GET all products
router.get("/get-all-product", async (req, res) => {
  try {
    const products = await Product.find({});
    res.status(200).json({
      code: 200,
      message: "Lấy danh sách sản phẩm thành công",
      data: products
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
