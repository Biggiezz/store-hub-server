const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Product = require("../models/Product");
const Category = require("../models/Category");

const dbUri = process.env.MONGO_URI;

if (!dbUri) {
  console.error("❌ Không tìm thấy MONGO_URI trong file .env");
  process.exit(1);
}

async function runMigration() {
  try {
    console.log("🔄 Đang kết nối database...");
    await mongoose.connect(dbUri);
    console.log("✅ Đã kết nối database thành công.");

    // Lấy tất cả sản phẩm
    const products = await Product.find({});
    console.log(`📦 Tìm thấy ${products.length} sản phẩm.`);

    // Lấy danh sách tên danh mục duy nhất từ các sản phẩm
    // Lưu ý: Lúc này Product.category vẫn đang lưu kiểu String (vì Schema chưa đổi hoặc Mongoose vẫn đọc được dưới dạng String)
    const categoryNames = new Set();
    products.forEach((p) => {
      if (p.category && typeof p.category === "string") {
        categoryNames.add(p.category.trim());
      }
    });

    console.log("📂 Các danh mục hiện có:", Array.from(categoryNames));

    // Tạo các danh mục trong bảng Category nếu chưa có
    const categoryMap = new Map();
    for (const name of categoryNames) {
      let category = await Category.findOne({ name });
      if (!category) {
        category = await Category.create({ name, image: "" });
        console.log(`➕ Đã tạo danh mục mới: ${name}`);
      } else {
        console.log(`ℹ️ Danh mục đã tồn tại: ${name}`);
      }
      categoryMap.set(name, category._id);
    }

    // Cập nhật trường category của sản phẩm thành ObjectId
    let updatedCount = 0;
    for (const product of products) {
      if (product.category && typeof product.category === "string") {
        const categoryId = categoryMap.get(product.category.trim());
        if (categoryId) {
          // Sử dụng updateOne hoặc gán trực tiếp để tránh validate Schema nếu Schema đã đổi sang ObjectId
          await Product.updateOne(
            { _id: product._id },
            { $set: { category: categoryId } }
          );
          updatedCount++;
        }
      }
    }

    console.log(`🎉 Đã cập nhật thành công ${updatedCount}/${products.length} sản phẩm sang ID danh mục mới.`);
  } catch (error) {
    console.error("❌ Lỗi xảy ra trong quá trình migration:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối database.");
  }
}

runMigration();
