const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Error: MONGO_URI is not defined in .env file");
  process.exit(1);
}

mongoose.connect(MONGO_URI).then(async () => {
  console.log("Connected to MongoDB Atlas successfully.");
  
  const db = mongoose.connection.db;
  const productsColl = db.collection("products");
  const categoriesColl = db.collection("categories");
  
  // Find or create the default category "Máy tính"
  let defaultCategory = await categoriesColl.findOne({ name: "Máy tính" });
  if (!defaultCategory) {
    const res = await categoriesColl.insertOne({
      name: "Máy tính",
      isActive: true,
      image: ""
    });
    defaultCategory = { _id: res.insertedId, name: "Máy tính" };
    console.log("Created default 'Máy tính' category.");
  }
  
  const products = await productsColl.find({}).toArray();
  console.log(`Found ${products.length} products. Checking for invalid category types...`);
  
  let updateCount = 0;
  for (const product of products) {
    const catVal = product.category;
    
    // Check if category is a string and not a 24-character hex ObjectId
    const isString = typeof catVal === "string";
    const isValidObjectId = mongoose.Types.ObjectId.isValid(catVal);
    
    if (isString && (!isValidObjectId || catVal === "Máy tính")) {
      console.log(`Product "${product.name}" (_id: ${product._id}) has invalid category: "${catVal}". Updating to category "${defaultCategory.name}" (_id: ${defaultCategory._id})...`);
      
      await productsColl.updateOne(
        { _id: product._id },
        { $set: { category: defaultCategory._id } }
      );
      updateCount++;
    }
  }
  
  console.log(`Cleanup completed. Updated ${updateCount} products.`);
  process.exit(0);
}).catch(err => {
  console.error("Database connection failed:", err);
  process.exit(1);
});
