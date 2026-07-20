const express = require("express");
const router = express.Router();
const News = require("../models/News");
const { authenticateToken, authorizeRoles } = require("../middlewares/auth");
const User = require("../models/users");

// ==========================================
// NHÓM API DÀNH CHO KHÁCH HÀNG (CLIENT/ANDROID APP)
// ==========================================

/**
 * @route   GET /api/newsRouter/get-all-news
 * @desc    Lấy danh sách tất cả các bài viết tin tức ở trạng thái 'published' (Đã xuất bản)
 * @access  Public
 */
router.get("/get-all-news", async (req, res) => {
  try {
    // Lấy thông số trang hiện tại (page) và giới hạn số bài (limit) từ Query String.
    // Nếu không truyền, mặc định sẽ là Trang 1 và lấy tối đa 10 bài viết.
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Tính số lượng bài viết cần bỏ qua để nhảy tới trang yêu cầu
    const skip = (page - 1) * limit;

    // Chỉ truy vấn các bài viết có status là 'published', sắp xếp mới nhất lên đầu,
    // bỏ qua số lượng skip và giới hạn lấy ra số lượng limit bản ghi.
    const newsList = await News.find({ status: "published" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      code: 200,
      message: "Lấy danh sách bài viết phân trang thành công",
      page: page,
      limit: limit,
      data: newsList,
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi lấy danh sách bài viết",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/newsRouter/get-news-by-id/:id
 * @desc    Lấy chi tiết một bài viết tin tức theo ID (Chỉ cho phép nếu bài viết đã xuất bản)
 * @access  Public
 */
router.get("/get-news-by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Tìm bài viết theo ID và có status là 'published'
    const newsItem = await News.findOne({ _id: id, status: "published" });

    if (!newsItem) {
      return res.status(404).json({
        code: 404,
        message: "Không tìm thấy bài viết hoặc bài viết đã bị ẩn/xóa",
      });
    }

    // Tăng số lượt xem của bài viết lên 1 đơn vị
    newsItem.views += 1;
    await newsItem.save();

    return res.status(200).json({
      code: 200,
      message: "Lấy chi tiết bài viết thành công",
      data: newsItem,
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      message: "Lỗi máy chủ khi lấy chi tiết bài viết",
      error: error.message,
    });
  }
});

// ==========================================
// NHÓM API DÀNH CHO QUẢN TRỊ (ADMIN/SUPER ADMIN)
// ==========================================

/**
 * @route   GET /api/newsRouter/admin/get-all-news
 * @desc    Lấy toàn bộ danh sách bài viết bao gồm cả nháp và ẩn (Phục vụ trang Admin)
 * @access  Private (Cần bổ sung auth middleware sau này)
 */
router.get(
  "/admin/get-all-news",
  authenticateToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      // Lấy thông số trang hiện tại (page) và giới hạn số bài (limit) từ Query String.
      // Nếu không truyền, mặc định sẽ là Trang 1 và lấy tối đa 10 bài viết quản trị.
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      // Tính số lượng bài viết cần bỏ qua để nhảy tới trang yêu cầu
      const skip = (page - 1) * limit;

      // Admin lấy tất cả các bài viết không phân biệt trạng thái (bao gồm cả draft, hidden),
      // sắp xếp mới nhất lên đầu, bỏ qua số lượng skip và giới hạn lấy ra số lượng limit bản ghi.
      const allNews = await News.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return res.status(200).json({
        code: 200,
        message: "Lấy danh sách bài viết quản trị phân trang thành công",
        page: page,
        limit: limit,
        data: allNews,
      });
    } catch (error) {
      return res.status(500).json({
        code: 500,
        message: "Lỗi máy chủ khi lấy danh sách bài viết quản trị",
        error: error.message,
      });
    }
  },
);

/**
 * @route   POST /api/newsRouter/admin/add-news
 * @desc    Tạo một bài viết tin tức mới
 * @access  Private (Cần bổ sung auth middleware sau này)
 */
router.post(
  "/admin/add-news",
  authenticateToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { title, content, image, status } = req.body;

      // Lấy thông tin User đăng nhập hiện tại từ Database để lấy tên hiển thị
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy thông tin tài khoản người đăng.",
        });
      }
      const authorName = user.name;

      // Kiểm tra trùng lặp tiêu đề (không phân biệt hoa thường) HOẶC trùng lặp nội dung bài viết
      const existingNews = await News.findOne({
        $or: [
          { title: { $regex: new RegExp("^" + title.trim() + "$", "i") } },
          { content: content.trim() },
        ],
      });

      if (existingNews) {
        // Phân biệt nguyên nhân trùng lặp để phản hồi thông báo chính xác
        const isTitleDup =
          existingNews.title.toLowerCase() === title.trim().toLowerCase();
        return res.status(400).json({
          code: 400,
          message: isTitleDup
            ? "Bài viết với tiêu đề này đã tồn tại, vui lòng nhập tiêu đề khác!"
            : "Nội dung bài viết này đã trùng lặp hoàn toàn với một bài viết khác!",
        });
      }

      // Khởi tạo đối tượng bài viết mới từ dữ liệu gửi lên
      const newNews = new News({
        title: title.trim(),
        content,
        image,
        status, // Trạng thái bài viết: 'draft' (nháp), 'published' (xuất bản), 'hidden' (ẩn)
        author: authorName, // Gán động tên hiển thị của Admin vừa đăng bài
      });

      // Lưu bài viết vào cơ sở dữ liệu
      const savedNews = await newNews.save();

      return res.status(201).json({
        code: 201,
        message: "Tạo bài viết mới thành công",
        data: savedNews,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: "Lỗi khi tạo bài viết mới",
        error: error.message,
      });
    }
  },
);

/**
 * @route   PUT /api/newsRouter/admin/update-news/:id
 * @desc    Cập nhật thông tin hoặc trạng thái (ẩn/hiện) của bài viết
 * @access  Private (Cần bổ sung auth middleware sau này)
 */
router.put(
  "/admin/update-news/:id",
  authenticateToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, image, status, author } = req.body;

      // Nếu người dùng có thay đổi tiêu đề hoặc nội dung, tiến hành kiểm tra trùng lặp
      if (title || content) {
        const checkConditions = [];

        if (title) {
          checkConditions.push({
            title: { $regex: new RegExp("^" + title.trim() + "$", "i") },
          });
        }
        if (content) {
          checkConditions.push({ content: content.trim() });
        }

        // Tìm bài viết khác (ID khác bài viết hiện tại) bị trùng lặp tiêu đề hoặc nội dung
        const duplicateNews = await News.findOne({
          _id: { $ne: id },
          $or: checkConditions,
        });

        if (duplicateNews) {
          const isTitleDup =
            title &&
            duplicateNews.title.toLowerCase() === title.trim().toLowerCase();
          return res.status(400).json({
            code: 400,
            message: isTitleDup
              ? "Tiêu đề chỉnh sửa đã trùng lặp với một bài viết khác!"
              : "Nội dung chỉnh sửa đã trùng lặp với một bài viết khác!",
          });
        }
      }

      // Chuẩn bị dữ liệu cập nhật (nếu có title thì trim trước khi lưu)
      const updateData = { ...req.body };
      if (title) {
        updateData.title = title.trim();
      }

      // Tìm và cập nhật bài viết theo ID
      const updatedNews = await News.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }, // Trả về tài liệu sau khi cập nhật và kiểm tra validate
      );

      if (!updatedNews) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy bài viết cần cập nhật",
        });
      }

      return res.status(200).json({
        code: 200,
        message: "Cập nhật bài viết thành công",
        data: updatedNews,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: "Lỗi khi cập nhật bài viết",
        error: error.message,
      });
    }
  },
);

/**
 * @route   DELETE /api/newsRouter/admin/delete-news/:id
 * @desc    Xóa vĩnh viễn bài viết khỏi cơ sở dữ liệu
 * @access  Private (Cần bổ sung auth middleware sau này)
 */
router.delete(
  "/admin/delete-news/:id",
  authenticateToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Tìm và xóa bài viết theo ID
      const deletedNews = await News.findByIdAndDelete(id);

      if (!deletedNews) {
        return res.status(404).json({
          code: 404,
          message: "Không tìm thấy bài viết cần xóa",
        });
      }

      return res.status(200).json({
        code: 200,
        message: "Xóa bài viết thành công",
        data: deletedNews,
      });
    } catch (error) {
      return res.status(500).json({
        code: 500,
        message: "Lỗi máy chủ khi xóa bài viết",
        error: error.message,
      });
    }
  },
);

module.exports = router;
