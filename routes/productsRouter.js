const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const upload = require("../middlewares/upload");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const { authenticateToken, authorizeRoles } = require("../middlewares/auth");
const ADMIN_ROLES = ["admin", "superadmin", "quß║ún l├╜ cß╗¡a h├áng", "quß║ún trß╗ï vi├¬n tß╗æi cao", "quß║ún trß╗ï vi├¬n"];

const redis = require("redis");
let client = null;

const productSort = (sort) => ({
  price_asc: { price: 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: 1 },
}[sort] || { createdAt: -1, _id: -1 });

const resolveCategoryQuery = async (category) => {
  const categoryMap = {
    "1": "─Éiß╗çn thoß║íi",
    "2": "M├íy t├¡nh",
    "3": "Tai nghe",
    "4": "─Éß╗ông hß╗ô",
    "laptop": "M├íy t├¡nh"
  };

  let targetCategory = categoryMap[category] || category;

  if (mongoose.Types.ObjectId.isValid(targetCategory)) {
    return new mongoose.Types.ObjectId(targetCategory);
  } else {
    const cat = await Category.findOne({ name: { $regex: new RegExp("^" + targetCategory + "$", "i") } });
    if (cat) {
      return cat._id;
    } else {
      return new mongoose.Types.ObjectId();
    }
  }
};

// --- Code gß╗æc cß╗ºa team (─æ╞░ß╗úc comment lß║íi ─æß╗â tham chiß║┐u) ---
// if (client) {
//   client.on("error", (error) => console.error(`Redis error: ${error.message}`));
//   client
//     .connect()
//     .catch((error) =>
//       console.error(`Redis connection failed: ${error.message}`),
//     );
// }

// --- Code xß╗¡ l├╜ Redis an to├án cho m├íy local (tß╗▒ ─æß╗Öng chuyß╗ân sang MongoDB nß║┐u ch╞░a bß║¡t Redis) ---
if (process.env.REDIS_URL) {
  client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: false, // Tß║»t tß╗▒ ─æß╗Öng kß║┐t nß╗æi lß║íi li├¬n tß╗Ñc ─æß╗â kh├┤ng bß╗ï r├íc terminal nß║┐u ch╞░a c├ái Redis Server
    },
  });

  client.on("error", () => {
    // Bß╗Å qua log r├íc khi kh├┤ng c├│ dß╗ïch vß╗Ñ Redis tr├¬n m├íy
  });

  client
    .connect()
    .then(() => console.log("Γ£à Redis Connected Successfully"))
    .catch(() => {
      console.log(
        "ΓÜá∩╕Å M├íy cß╗Ñc bß╗Ö ch╞░a chß║íy Redis Server (Tß╗▒ ─æß╗Öng bß╗Å qua Redis, d├╣ng MongoDB trß╗▒c tiß║┐p).",
      );
    });
}

// GET all products with pagination (Default 6 products per page)
router.get("/get-all-product", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    // Lß║Ñy tß╗òng sß╗æ l╞░ß╗úng sß║ún phß║⌐m ─æß╗â Client biß║┐t khi n├áo hß║┐t sß║ún phß║⌐m
    const category = String(req.query.category || "").trim();
    const status = String(req.query.status || "").trim();
    const sort = String(req.query.sort || "").trim();
    const query = status
      ? status === "active"
        ? { $or: [{ status: "active" }, { status: { $exists: false } }] }
        : { status }
      : { status: { $nin: ["inactive", "Ngß╗½ng b├ín", "hidden"] } };

    if (category) {
      query.category = await resolveCategoryQuery(category);
    }
    const totalProducts = await Product.countDocuments(query);

    // Lß║Ñy danh s├ích sß║ún phß║⌐m theo page v├á limit
    const products = await Product.find(query)
      .collation({ locale: "vi", strength: 1 })
      .sort(productSort(sort))
      .populate("category")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      code: 200,
      message: "Lß║Ñy danh s├ích sß║ún phß║⌐m th├ánh c├┤ng",
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
      message: "Lß║Ñy danh s├ích danh mß╗Ñc th├ánh c├┤ng",
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
      message: "Lß║Ñy danh s├ích sß║ún phß║⌐m mß╗¢i nhß║Ñt th├ánh c├┤ng",
      data: latestProducts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET single product detail by ID
router.get("/get-product-by-id/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ code: 400, message: "ID sß║ún phß║⌐m kh├┤ng hß╗úp lß╗ç", data: null });
    }

    const product = await Product.findById(req.params.id).populate("category");
    if (!product) {
      return res
        .status(404)
        .json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m", data: null });
    }
    res.status(200).json({
      code: 200,
      message: "Lß║Ñy chi tiß║┐t sß║ún phß║⌐m th├ánh c├┤ng",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message, data: null });
  }
});

const storageReview = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "store-hub/reviews",
    resource_type: "auto",
    transformation: [
      {
        width: 720,
        crop: "limit",
        quality: "auto",
        fetch_format: "auto",
      }
    ]
  },
});

const uploadReview = multer({
  storage: storageReview,
  limits: { fileSize: 30 * 1024 * 1024 }, // Giß╗¢i hß║ín 30MB
});

/**
 * US25: Danh s├ích ─æ├ính gi├í sß║ún phß║⌐m d├ánh cho quß║ún trß╗ï vi├¬n.
 * GET /api/productsRouter/admin-reviews?rating=5&status=unreplied
 */
router.get(
  "/admin-reviews",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const ratingParam = String(req.query.rating || "all");
      const status = String(req.query.status || "all");

      if (
        ratingParam !== "all" &&
        !["1", "2", "3", "4", "5"].includes(ratingParam)
      ) {
        return res.status(400).json({
          code: 400,
          message: "Bß╗Ö lß╗ìc sß╗æ sao kh├┤ng hß╗úp lß╗ç.",
        });
      }

      if (!["all", "replied", "unreplied"].includes(status)) {
        return res.status(400).json({
          code: 400,
          message: "Bß╗Ö lß╗ìc trß║íng th├íi phß║ún hß╗ôi kh├┤ng hß╗úp lß╗ç.",
        });
      }

      const products = await Product.find(
        { "reviews.0": { $exists: true } },
        { name: 1, reviews: 1 },
      ).lean();

      const reviews = [];

      for (const product of products) {
        for (const review of product.reviews || []) {
          const rating = Number(review.rating || 0);
          const replyContent = String(review.replyContent || "").trim();
          const replied = replyContent.length > 0;

          if (ratingParam !== "all" && rating !== Number(ratingParam)) {
            continue;
          }

          if (status === "replied" && !replied) continue;
          if (status === "unreplied" && replied) continue;

          reviews.push({
            _id: String(review._id),
            productId: String(product._id),
            productName: product.name || "Sß║ún phß║⌐m kh├┤ng x├íc ─æß╗ïnh",
            customerName: review.customerName || "Kh├ích h├áng",
            rating,
            content: review.content || "",
            createdAt: review.createdAt || "",
            replyContent,
            replyCreatedAt: review.replyCreatedAt || "",
            status: replied ? "replied" : "unreplied",
          });
        }
      }

      const parseReviewDate = (value) => {
        if (!value) return 0;

        const dateText = String(value);
        const vnDate = dateText.match(
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
        );

        if (vnDate) {
          return new Date(
            Number(vnDate[3]),
            Number(vnDate[2]) - 1,
            Number(vnDate[1]),
          ).getTime();
        }

        const timestamp = new Date(dateText).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
      };

      reviews.sort(
        (a, b) => parseReviewDate(b.createdAt) - parseReviewDate(a.createdAt),
      );

      return res.status(200).json({
        code: 200,
        message: "Lß║Ñy danh s├ích ─æ├ính gi├í th├ánh c├┤ng.",
        data: reviews,
        total: reviews.length,
      });
    } catch (error) {
      console.error("[US25] Lß╗ùi lß║Ñy danh s├ích ─æ├ính gi├í:", error);

      return res.status(500).json({
        code: 500,
        message: "Kh├┤ng thß╗â lß║Ñy danh s├ích ─æ├ính gi├í.",
      });
    }
  },
);

// POST add a product review
router.post("/add-review", authenticateToken, (req, res) => {
  uploadReview.array("media", 5)(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ code: 400, message: "Lß╗ùi tß║úi tß╗çp: " + uploadError.message });
    }

    try {
      const { productId, customerName, customerImage, rating, content, orderId } = req.body;
      if (!productId || !customerName?.trim() || rating === undefined || !content?.trim()) {
        return res
          .status(400)
          .json({ code: 400, message: "Thiß║┐u th├┤ng tin ─æ├ính gi├í" });
      }

      const r = parseFloat(rating);
      if (isNaN(r) || r < 1 || r > 5) {
        return res.status(400).json({ code: 400, message: "─Éiß╗âm ─æ├ính gi├í phß║úi tß╗½ 1 ─æß║┐n 5 sao" });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res
          .status(404)
          .json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m" });
      }

      // Check if order was already reviewed
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.isReviewed) {
          return res
            .status(400)
            .json({ code: 400, message: "─É╞ín h├áng n├áy ─æ├ú ─æ╞░ß╗úc ─æ├ính gi├í tr╞░ß╗¢c ─æ├│" });
        }
      }

      const now = new Date();
      const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

      // Lß║Ñy danh s├ích URL cß╗ºa h├¼nh ß║únh/video tß║úi l├¬n tß╗½ Cloudinary
      const mediaUrls = req.files ? req.files.map(file => file.path) : [];

      const newReview = {
        customerName: customerName.trim(),
        customerImage: customerImage || "",
        rating: parseFloat(rating),
        content: content.trim(),
        media: mediaUrls,
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

      // Populate category tr╞░ß╗¢c khi trß║ú vß╗ü ─æß╗â tr├ính lß╗ùi JsonSyntaxException ß╗ƒ Client Android
      const populatedProduct = await Product.findById(product._id).populate("category");

      res.status(200).json({
        code: 200,
        message: "─É├ú th├¬m ─æ├ính gi├í th├ánh c├┤ng",
        data: populatedProduct,
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message });
    }
  });
});

router.post(
  "/reply-review",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
  try {
    const { productId, reviewId, replyContent } = req.body;
    if (
  !productId ||
  !reviewId ||
  typeof replyContent !== "string" ||
  !replyContent.trim()
) {
  return res.status(400).json({
    code: 400,
    message: "Vui l├▓ng nhß║¡p nß╗Öi dung phß║ún hß╗ôi.",
  });
}

if (replyContent.trim().length > 1000) {
  return res.status(400).json({
    code: 400,
    message: "Nß╗Öi dung phß║ún hß╗ôi kh├┤ng ─æ╞░ß╗úc v╞░ß╗út qu├í 1000 k├╜ tß╗▒.",
  });
}

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m" });
    }

    const review = product.reviews.find((r) => String(r._id) === String(reviewId));
    if (!review) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy ─æ├ính gi├í" });
    }

    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    review.replyContent = replyContent.trim();
    review.replyCreatedAt = formattedDate;

    await product.save();
    const populatedProduct = await Product.findById(product._id).populate("category");
    res.status(200).json({
      code: 200,
      message: "─É├ú phß║ún hß╗ôi ─æ├ính gi├í th├ánh c├┤ng",
      data: populatedProduct,
    });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
  },
);

// GET /api/productsRouter/admin/reviews (Quß║ún trß╗ï vi├¬n: Lß║Ñy danh s├ích ─æ├ính gi├í k├¿m bß╗Ö lß╗ìc sao & trß║íng th├íi phß║ún hß╗ôi)
router.get(
  "/admin/reviews",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.max(1, parseInt(req.query.limit) || 10);
      const skip = (page - 1) * limit;

      const { rating, replyStatus, productId, search } = req.query;

      const pipeline = [];

      // 1. Lß╗ìc theo sß║ún phß║⌐m cß╗Ñ thß╗â nß║┐u c├│
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        pipeline.push({ $match: { _id: new mongoose.Types.ObjectId(productId) } });
      }

      // 2. Chß╗ë x├⌐t c├íc sß║ún phß║⌐m c├│ ─æ├ính gi├í
      pipeline.push({ $match: { "reviews.0": { $exists: true } } });

      // 3. T├ích tß╗½ng ─æ├ính gi├í th├ánh bß║ún ghi ri├¬ng biß╗çt
      pipeline.push({ $unwind: "$reviews" });

      // 4. Lß╗ìc theo sß╗æ sao ─æ├ính gi├í (1ΓÇô5 sao hoß║╖c khoß║úng 1-2 sao)
      if (rating) {
        const ratingStr = String(rating).trim();
        if (ratingStr.includes("-")) {
          const [min, max] = ratingStr.split("-").map(Number);
          if (!isNaN(min) && !isNaN(max)) {
            pipeline.push({ $match: { "reviews.rating": { $gte: min, $lte: max } } });
          }
        } else if (ratingStr.includes(",")) {
          const ratings = ratingStr.split(",").map(Number).filter((n) => !isNaN(n));
          if (ratings.length > 0) {
            pipeline.push({ $match: { "reviews.rating": { $in: ratings } } });
          }
        } else {
          const numRating = Number(ratingStr);
          if (!isNaN(numRating)) {
            pipeline.push({ $match: { "reviews.rating": numRating } });
          }
        }
      }

      // 5. Lß╗ìc theo trß║íng th├íi phß║ún hß╗ôi (─æ├ú trß║ú lß╗¥i / ch╞░a trß║ú lß╗¥i)
      if (replyStatus === "unanswered") {
        pipeline.push({
          $match: {
            $or: [
              { "reviews.replyContent": { $exists: false } },
              { "reviews.replyContent": "" },
              { "reviews.replyContent": null },
            ],
          },
        });
      } else if (replyStatus === "answered") {
        pipeline.push({
          $match: {
            "reviews.replyContent": { $exists: true, $nin: ["", null] },
          },
        });
      }

      // 6. T├¼m kiß║┐m theo t├¬n kh├ích, nß╗Öi dung ─æ├ính gi├í hoß║╖c t├¬n sß║ún phß║⌐m
      if (search && String(search).trim()) {
        const searchRegex = new RegExp(String(search).trim(), "i");
        pipeline.push({
          $match: {
            $or: [
              { "reviews.customerName": searchRegex },
              { "reviews.content": searchRegex },
              { name: searchRegex },
            ],
          },
        });
      }

      // 7. Sß║»p xß║┐p: ─æ├ính gi├í mß╗¢i nhß║Ñt l├¬n ─æß║ºu
      pipeline.push({ $sort: { "reviews._id": -1 } });

      // 8. Ph├ón trang v├á chiß║┐u dß╗» liß╗çu
      pipeline.push({
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: "$reviews._id",
                reviewId: "$reviews._id",
                productId: "$_id",
                productName: "$name",
                productImage: "$image",
                customerName: "$reviews.customerName",
                customerImage: "$reviews.customerImage",
                rating: "$reviews.rating",
                content: "$reviews.content",
                media: "$reviews.media",
                createdAt: "$reviews.createdAt",
                replyContent: "$reviews.replyContent",
                replyCreatedAt: "$reviews.replyCreatedAt",
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      });

      const result = await Product.aggregate(pipeline);
      const reviews = result[0]?.data || [];
      const totalReviews = result[0]?.totalCount[0]?.count || 0;

      res.status(200).json({
        code: 200,
        message: "Lß║Ñy danh s├ích ─æ├ính gi├í th├ánh c├┤ng",
        data: reviews,
        pagination: {
          totalReviews,
          currentPage: page,
          totalPages: Math.ceil(totalReviews / limit) || 1,
          limit,
        },
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: [] });
    }
  },
);


router.put(
  "/reply-review",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { productId, reviewId, replyContent } = req.body;

      if (
        !productId ||
        !reviewId ||
        typeof replyContent !== "string" ||
        !replyContent.trim()
      ) {
        return res.status(400).json({
          code: 400,
          message: "Vui l├▓ng nhß║¡p nß╗Öi dung phß║ún hß╗ôi.",
        });
      }

      const content = replyContent.trim();

      if (content.length > 1000) {
        return res.status(400).json({
          code: 400,
          message: "Nß╗Öi dung phß║ún hß╗ôi kh├┤ng ─æ╞░ß╗úc v╞░ß╗út qu├í 1000 k├╜ tß╗▒.",
        });
      }

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          code: 404,
          message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m.",
        });
      }

      const review = product.reviews.find(
        (item) => String(item._id) === String(reviewId),
      );

      if (!review) {
        return res.status(404).json({
          code: 404,
          message: "Kh├┤ng t├¼m thß║Ñy ─æ├ính gi├í.",
        });
      }

      if (!String(review.replyContent || "").trim()) {
        return res.status(400).json({
          code: 400,
          message: "─É├ính gi├í n├áy ch╞░a c├│ phß║ún hß╗ôi ─æß╗â chß╗ënh sß╗¡a.",
        });
      }

      review.replyContent = content;

      const now = new Date();
      review.replyCreatedAt =
        `${String(now.getDate()).padStart(2, "0")}/` +
        `${String(now.getMonth() + 1).padStart(2, "0")}/` +
        `${now.getFullYear()}`;

      await product.save();

      return res.status(200).json({
        code: 200,
        message: "Cß║¡p nhß║¡t phß║ún hß╗ôi th├ánh c├┤ng.",
        data: {
          productId: String(product._id),
          reviewId: String(review._id),
          replyContent: review.replyContent,
          replyCreatedAt: review.replyCreatedAt,
        },
      });
    } catch (error) {
      console.error("[US26] Lß╗ùi cß║¡p nhß║¡t phß║ún hß╗ôi:", error);

      return res.status(500).json({
        code: 500,
        message: "Kh├┤ng thß╗â cß║¡p nhß║¡t phß║ún hß╗ôi.",
      });
    }
  },
);

router.delete(
  "/reply-review",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { productId, reviewId } = req.body;

      if (!productId || !reviewId) {
        return res.status(400).json({
          code: 400,
          message: "Thiß║┐u th├┤ng tin sß║ún phß║⌐m hoß║╖c ─æ├ính gi├í.",
        });
      }

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          code: 404,
          message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m.",
        });
      }

      const review = product.reviews.find(
        (item) => String(item._id) === String(reviewId),
      );

      if (!review) {
        return res.status(404).json({
          code: 404,
          message: "Kh├┤ng t├¼m thß║Ñy ─æ├ính gi├í.",
        });
      }

      if (!String(review.replyContent || "").trim()) {
        return res.status(400).json({
          code: 400,
          message: "─É├ính gi├í n├áy ch╞░a c├│ phß║ún hß╗ôi ─æß╗â x├│a.",
        });
      }

      review.replyContent = "";
      review.replyCreatedAt = "";

      await product.save();

      return res.status(200).json({
        code: 200,
        message: "X├│a phß║ún hß╗ôi th├ánh c├┤ng.",
        data: {
          productId: String(product._id),
          reviewId: String(review._id),
        },
      });
    } catch (error) {
      console.error("[US26] Lß╗ùi x├│a phß║ún hß╗ôi:", error);

      return res.status(500).json({
        code: 500,
        message: "Kh├┤ng thß╗â x├│a phß║ún hß╗ôi.",
      });
    }
  },
);

// GET all cart items
router.get("/get-cart", authenticateToken, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Lß║Ñy danh s├ích giß╗Å h├áng th├ánh c├┤ng",
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
        .json({ code: 400, message: "M├ú sß║ún phß║⌐m kh├┤ng hß╗úp lß╗ç" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m" });
    }

    let colorName = "";
    let colorHex = "";
    if (colorId && product.colors && product.colors.length > 0) {
      const matchedColor = product.colors.find((c) => String(c._id) === String(colorId));
      if (matchedColor) {
        colorName = matchedColor.name;
        colorHex = matchedColor.hex; // Lß║Ñy th├¬m m├ú m├áu Hex t╞░╞íng ß╗⌐ng
      }
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ code: 400, message: "Sß╗æ l╞░ß╗úng kh├┤ng hß╗úp lß╗ç" });
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
        // L╞░u m├ú Hex t╞░╞íng ß╗⌐ng ─æß╗â hiß╗ân thß╗ï chß║Ñm m├áu ß╗ƒ Client (mß║╖c ─æß╗ïnh lß║Ñy m├áu ─æß║ºu ti├¬n nß║┐u lß╗ùi)
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
      message: "─É├ú th├¬m sß║ún phß║⌐m v├áo giß╗Å h├áng",
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
      return res.status(400).json({ code: 400, message: "Sß╗æ l╞░ß╗úng kh├┤ng hß╗úp lß╗ç" });
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
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m trong giß╗Å h├áng" });
    }
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "Cß║¡p nhß║¡t sß╗æ l╞░ß╗úng th├ánh c├┤ng",
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
      return res.status(400).json({ code: 400, message: "Sß║ún phß║⌐m trong giß╗Å h├áng kh├┤ng hß╗úp lß╗ç" });
    }
    const cartItem = await Cart.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!cartItem) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m trong giß╗Å h├áng" });
    }
    const cartItems = await Cart.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      code: 200,
      message: "X├│a sß║ún phß║⌐m khß╗Åi giß╗Å h├áng th├ánh c├┤ng",
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
          message: "T├¬n, gi├í, danh mß╗Ñc v├á h├¼nh ß║únh l├á bß║»t buß╗Öc",
          data: null,
        });
      }

      if (isNaN(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ code: 400, message: "Gi├í b├ín phß║úi l├á sß╗æ hß╗úp lß╗ç lß╗¢n h╞ín 0", data: null });
      }

      if (isNaN(Number(stock)) || Number(stock) < 0) {
        return res.status(400).json({ code: 400, message: "Sß╗æ l╞░ß╗úng tß╗ôn kho phß║úi l├á sß╗æ hß╗úp lß╗ç kh├┤ng ├óm", data: null });
      }

      // Ph├ón giß║úi danh mß╗Ñc tß╗½ name sang ID nß║┐u client gß╗¡i text danh mß╗Ñc
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
      res.status(201).json({ code: 201, message: "Th├¬m sß║ún phß║⌐m th├ánh c├┤ng", data: populatedProduct });
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
      // Kiß╗âm tra sß║ún phß║⌐m tß╗ôn tß║íi bß║▒ng truy vß║Ñn th├┤ (tr├ính Mongoose ├⌐p kiß╗âu lß╗ùi tr├¬n bß║ún ghi c┼⌐)
      const rawProduct = await Product.collection.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) });
      if (!rawProduct) {
        return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m", data: null });
      }

      console.log("update-product body:", req.body);
      const { name, price, category, description, stock, colors, isActive, soldQuantity, rating } = req.body;
      if (!name || !price || !category) {
        return res.status(400).json({ code: 400, message: "Thiß║┐u th├┤ng tin sß║ún phß║⌐m", data: null });
      }

      if (isNaN(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ code: 400, message: "Gi├í b├ín phß║úi l├á sß╗æ hß╗úp lß╗ç lß╗¢n h╞ín 0", data: null });
      }

      if (stock !== undefined && (isNaN(Number(stock)) || Number(stock) < 0)) {
        return res.status(400).json({ code: 400, message: "Sß╗æ l╞░ß╗úng tß╗ôn kho phß║úi l├á sß╗æ hß╗úp lß╗ç kh├┤ng ├óm", data: null });
      }

      // Ph├ón giß║úi danh mß╗Ñc tß╗½ name sang ID nß║┐u client gß╗¡i t├¬n danh mß╗Ñc
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
        { returnDocument: 'after', runValidators: true }
      ).populate("category");

      // X├│a cache t├¼m kiß║┐m
      if (client?.isReady) {
        const keys = await client.keys("search:v3:*");
        if (keys.length > 0) await client.del(keys);
      }

      res.json({ code: 200, message: "Cß║¡p nhß║¡t sß║ún phß║⌐m th├ánh c├┤ng", data: populatedProduct });
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

    // Check cache tr╞░ß╗¢c
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

    // Cache 5 ph├║t
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
      message: "T├¡nh ph├¡ vß║¡n chuyß╗ân th├ánh c├┤ng",
      data: {
        provider: provider || "GHN",
        service_id: 53320,
        service_name: "Giao h├áng ti├¬u chuß║⌐n",
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

// POST /api/productsRouter/checkout - Thanh to├ín giß╗Å h├áng v├á tß║ío ─É╞ín h├áng
router.post("/checkout", authenticateToken, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });

    if (cartItems.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "Giß╗Å h├áng cß╗ºa bß║ín ─æang trß╗æng"
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

    // Cß║¡p nhß║¡t tß╗ôn kho v├á sß╗æ l╞░ß╗úng ─æ├ú b├ín cho tß╗½ng sß║ún phß║⌐m
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
      message: "Thanh to├ín ─æ╞ín h├áng th├ánh c├┤ng!",
      data: savedOrder
    });
  } catch (error) {
    console.error("Lß╗ùi khi thanh to├ín ─æ╞ín h├áng:", error);
    res.status(500).json({
      code: 500,
      message: "Lß╗ùi m├íy chß╗º khi thanh to├ín ─æ╞ín h├áng."
    });
  }
});

router.post(
  "/add-category",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  upload.single("image"),
  async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: "T├¬n danh mß╗Ñc l├á bß║»t buß╗Öc" });
    }

    const cleanName = name.trim();
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp("^" + cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
    });
    if (existingCategory) {
      return res.status(400).json({ code: 400, message: "Danh mß╗Ñc ─æ├ú tß╗ôn tß║íi" });
    }

    const newCategory = await Category.create({
      name: cleanName,
      image,
    });

    res.status(201).json({ code: 201, message: "Th├¬m danh mß╗Ñc th├ánh c├┤ng", data: newCategory });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ code: 400, message: "Danh mß╗Ñc ─æ├ú tß╗ôn tß║íi" });
    }
    res.status(500).json({ code: 500, message: error.message });
  }
  },
);

router.put(
  "/update-category/:id",
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  upload.single("image"),
  async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy danh mß╗Ñc" });
    }

    if (name && name.trim()) {
      const cleanName = name.trim();
      const duplicateCategory = await Category.findOne({
        _id: { $ne: req.params.id },
        name: { $regex: new RegExp("^" + cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
      });
      if (duplicateCategory) {
        return res.status(400).json({ code: 400, message: "T├¬n danh mß╗Ñc ─æ├ú tß╗ôn tß║íi" });
      }
      category.name = cleanName;
    }
    if (isActive !== undefined) category.isActive = isActive === "true" || isActive === true;
    if (req.file) category.image = req.file.path;

    const updatedCategory = await category.save();
    res.status(200).json({ code: 200, message: "Cß║¡p nhß║¡t danh mß╗Ñc th├ánh c├┤ng", data: updatedCategory });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ code: 400, message: "T├¬n danh mß╗Ñc ─æ├ú tß╗ôn tß║íi" });
    }
    res.status(500).json({ code: 500, message: error.message });
  }
  },
);

// DELETE category
router.delete("/delete-category/:id", authenticateToken, authorizeRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy danh mß╗Ñc" });
    }

    // Kiß╗âm tra xem c├│ sß║ún phß║⌐m n├áo thuß╗Öc danh mß╗Ñc n├áy kh├┤ng
    const hasProduct = await Product.exists({ category: req.params.id });
    if (hasProduct) {
      return res.status(400).json({ code: 400, message: "Kh├┤ng thß╗â x├│a danh mß╗Ñc n├áy v├¼ c├│ sß║ún phß║⌐m ─æang thuß╗Öc danh mß╗Ñc n├áy" });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json({ code: 200, message: "X├│a danh mß╗Ñc th├ánh c├┤ng" });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

// DELETE product (Only Superadmin has right to delete/deactivate products)
router.delete("/delete-product/:id", authenticateToken, authorizeRoles("superadmin", "quß║ún trß╗ï vi├¬n tß╗æi cao"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ code: 404, message: "Kh├┤ng t├¼m thß║Ñy sß║ún phß║⌐m" });
    }

    // Thß╗▒c hiß╗çn x├│a cß╗⌐ng sß║ún phß║⌐m khß╗Åi Database
    await Product.findByIdAndDelete(req.params.id);

    // Dß╗ìn dß║╣p cache t├¼m kiß║┐m an to├án (tr├ính lß╗ùi nghß║╜n/timeout tr├¬n m├┤i tr╞░ß╗¥ng Serverless)
    try {
      if (client?.isReady) {
        const keys = await client.keys("search:v3:*");
        if (keys.length > 0) await client.del(keys);
      }
    } catch (redisError) {
      console.error("Lß╗ùi x├│a cache Redis khi x├│a sß║ún phß║⌐m:", redisError);
    }

    res.status(200).json({ code: 200, message: "X├│a sß║ún phß║⌐m th├ánh c├┤ng" });
  } catch (error) {
    res.status(500).json({ code: 500, message: error.message });
  }
});

module.exports = router;

