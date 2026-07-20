const mongoose = require("mongoose");

const Product = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    rating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    stock: {
      type: Number,
      default: 0,
    },
    colors: [
      {
        id: { type: String },
        name: { type: String },
        hex: { type: String },
        isDefault: { type: Boolean, default: false },
      },
    ],
    reviews: [
      {
        id: { type: String },
        customerName: { type: String },
        createdAt: { type: String },
        rating: { type: Number, default: 0 },
        content: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

Product.index({ name: "text" });

module.exports = mongoose.model("Products", Product);
