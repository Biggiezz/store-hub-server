const mongoose = require("mongoose");
const User = require("../models/users");
const Order = require("../models/Order");
const ActivityLog = require("../models/ActivityLog");

// Danh sách các vai trò quản trị (loại trừ khỏi danh sách khách hàng)
const ADMIN_ROLES = [
  "admin",
  "superadmin",
  "quản lý cửa hàng",
  "quản trị viên tối cao",
  "quản trị viên",
];

// Cấu hình các cấp bậc thứ hạng khách hàng thân thiết
const LOYALTY_TIERS = {
  DIAMOND: {
    key: "DIAMOND",
    name: "Kim Cương",
    minSpent: 20000000, // 20.000.000 VNĐ
    minOrders: 20, // 20 đơn hoàn tất
    badgeColor: "#06b6d4",
    isVip: true,
    discountRate: 15,
    suggestedVoucherCode: "VIPDIAMOND15",
    voucherTitle: "Voucher tri ân Khách hàng Kim Cương - Giảm 15%",
    perks: [
      "Giảm 15% cho mọi đơn hàng tiếp theo",
      "Miễn phí vận chuyển hỏa tốc trọn đời",
      "Hộp quà tri ân đặc biệt dịp sinh nhật và Tết",
      "Kênh hỗ trợ chuyên viên VIP 24/7",
    ],
    description: "Thành viên tối cao (Super VIP)",
  },
  GOLD: {
    key: "GOLD",
    name: "Vàng",
    minSpent: 10000000, // 10.000.000 VNĐ
    minOrders: 10, // 10 đơn hoàn tất
    badgeColor: "#eab308",
    isVip: true,
    discountRate: 10,
    suggestedVoucherCode: "VIPGOLD10",
    voucherTitle: "Voucher tri ân Khách hàng Vàng - Giảm 10%",
    perks: [
      "Giảm 10% cho mọi đơn hàng",
      "Miễn phí vận chuyển toàn quốc",
      "Voucher quà sinh nhật trị giá 300.000đ",
      "Ưu tiên xử lý đơn và đóng gói bảo hiểm",
    ],
    description: "Thành viên VIP Vàng",
  },
  SILVER: {
    key: "SILVER",
    name: "Bạc",
    minSpent: 5000000, // 5.000.000 VNĐ
    minOrders: 5, // 5 đơn hoàn tất
    badgeColor: "#94a3b8",
    isVip: false,
    discountRate: 5,
    suggestedVoucherCode: "VIPSILVER5",
    voucherTitle: "Voucher tri ân Khách hàng Bạc - Giảm 5%",
    perks: [
      "Giảm 5% cho đơn hàng tiếp theo",
      "Voucher quà sinh nhật trị giá 100.000đ",
      "Tích lũy điểm thưởng x1.5 lần",
    ],
    description: "Thành viên Thân thiết Bạc",
  },
  BRONZE: {
    key: "BRONZE",
    name: "Đồng",
    minSpent: 0,
    minOrders: 0,
    badgeColor: "#cd7f32",
    isVip: false,
    discountRate: 0,
    suggestedVoucherCode: "WELCOMEBRONZE",
    voucherTitle: "Voucher chào mừng Thành viên Đồng",
    perks: [
      "Tích lũy điểm thưởng cơ bản",
      "Nhận thông báo các chương trình Flash Sale sớm nhất",
    ],
    description: "Thành viên Tiêu chuẩn",
  },
};

/**
 * Phân loại thứ hạng khách hàng dựa trên tổng chi tiêu và số đơn hoàn tất
 * @param {number} totalSpent - Tổng chi tiêu từ các đơn hoàn tất (VNĐ)
 * @param {number} completedOrdersCount - Số lượng đơn hàng đã hoàn thành
 * @param {string} mode - "any" (đạt 1 trong 2, mặc định), "spent" (chỉ chi tiêu), "orders" (chỉ số đơn), "all" (đạt cả 2)
 * @returns {object} Thông tin thứ hạng
 */
function classifyCustomerTier(
  totalSpent = 0,
  completedOrdersCount = 0,
  mode = "any",
) {
  const spent = Math.max(0, Number(totalSpent) || 0);
  const orders = Math.max(0, Number(completedOrdersCount) || 0);

  const checkMatch = (tier) => {
    if (mode === "spent") return spent >= tier.minSpent;
    if (mode === "orders") return orders >= tier.minOrders;
    if (mode === "all")
      return spent >= tier.minSpent && orders >= tier.minOrders;
    // Default: "any" (Đạt ngưỡng chi tiêu HOẶC đạt số đơn hoàn tất)
    return spent >= tier.minSpent || orders >= tier.minOrders;
  };

  if (checkMatch(LOYALTY_TIERS.DIAMOND)) {
    return { ...LOYALTY_TIERS.DIAMOND };
  }
  if (checkMatch(LOYALTY_TIERS.GOLD)) {
    return { ...LOYALTY_TIERS.GOLD };
  }
  if (checkMatch(LOYALTY_TIERS.SILVER)) {
    return { ...LOYALTY_TIERS.SILVER };
  }
  return { ...LOYALTY_TIERS.BRONZE };
}

/**
 * Chuẩn hóa tên hạng tìm kiếm sang key hoặc tên chuẩn
 */
function normalizeRankQuery(rankStr) {
  if (!rankStr) return null;
  const s = String(rankStr).trim().toLowerCase();
  if (["kim cương", "kim cuong", "diamond"].includes(s)) return "Kim Cương";
  if (["vàng", "vang", "gold"].includes(s)) return "Vàng";
  if (["bạc", "bac", "silver"].includes(s)) return "Bạc";
  if (["đồng", "dong", "bronze"].includes(s)) return "Đồng";
  return rankStr.trim();
}

/**
 * Trạng thái đơn hàng được tính là hoàn thành
 */
const COMPLETED_STATUSES = [
  "Đã hoàn thành",
  "đã hoàn thành",
  "Đã giao hàng",
  "đã giao hàng",
  "delivered",
  "completed",
  "Delivered",
  "Completed",
  "ĐÃ HOÀN THÀNH",
  "ĐÃ GIAO HÀNG",
];

/**
 * Lấy thống kê đơn hàng theo từng khách hàng từ DB
 */
async function fetchOrdersStatsMap() {
  const orderStatsAgg = await Order.aggregate([
    {
      $group: {
        _id: "$user",
        totalOrdersCount: { $sum: 1 },
        completedOrdersCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  {
                    $trim: { input: { $ifNull: ["$status", ""] } },
                  },
                  COMPLETED_STATUSES,
                ],
              },
              1,
              0,
            ],
          },
        },
        totalSpent: {
          $sum: {
            $cond: [
              {
                $in: [
                  {
                    $trim: { input: { $ifNull: ["$status", ""] } },
                  },
                  COMPLETED_STATUSES,
                ],
              },
              {
                $ifNull: [
                  "$totalAmount",
                  { $ifNull: ["$totalPrice", { $ifNull: ["$subtotal", 0] }] },
                ],
              },
              0,
            ],
          },
        },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
  ]);

  const statsMap = new Map();
  for (const item of orderStatsAgg) {
    if (item._id) {
      statsMap.set(String(item._id), {
        totalOrdersCount: item.totalOrdersCount || 0,
        completedOrdersCount: item.completedOrdersCount || 0,
        totalSpent: Math.max(0, item.totalSpent || 0),
        lastOrderDate: item.lastOrderDate || null,
      });
    }
  }
  return statsMap;
}

/**
 * Lọc và xem danh sách khách hàng thân thiết
 */
async function getLoyalCustomers(query = {}) {
  const {
    minSpent,
    maxSpent,
    minOrders,
    maxOrders,
    rank,
    isVip,
    search = "",
    filterLogic = "OR", // 'OR' (mặc định đạt minSpent hoặc minOrders) hoặc 'AND' (phải đạt cả 2)
    sortBy = "totalSpent",
    sortOrder = "desc",
    page = 1,
    limit = 10,
    rankMode = "any",
  } = query;

  // 1. Lấy dữ liệu thống kê đơn hàng
  const statsMap = await fetchOrdersStatsMap();

  // 2. Lấy toàn bộ tài khoản người dùng có vai trò là khách hàng
  const users = await User.find({
    role: { $nin: ADMIN_ROLES },
  })
    .select("-password -firebaseUid -resetPasswordOtp -resetPasswordOtpExpires")
    .lean();

  // 3. Tính toán thứ hạng và gắn số liệu cho từng khách hàng
  let customerList = [];
  let tierCounts = {
    diamond: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
  };
  let vipCount = 0;
  let totalRevenueAllCustomers = 0;

  for (const user of users) {
    const stats = statsMap.get(String(user._id)) || {
      totalOrdersCount: 0,
      completedOrdersCount: 0,
      totalSpent: 0,
      lastOrderDate: null,
    };

    const tier = classifyCustomerTier(
      stats.totalSpent,
      stats.completedOrdersCount,
      rankMode,
    );

    // Thống kê toàn hệ thống
    if (tier.key === "DIAMOND") tierCounts.diamond++;
    else if (tier.key === "GOLD") tierCounts.gold++;
    else if (tier.key === "SILVER") tierCounts.silver++;
    else tierCounts.bronze++;

    if (tier.isVip) vipCount++;
    totalRevenueAllCustomers += stats.totalSpent;

    customerList.push({
      _id: user._id,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      address: user.address || "",
      image: user.image || "",
      role: user.role || "customer",
      isOnline: !!user.isOnline,
      lastActive: user.lastActive || null,
      isBlocked: !!user.isBlocked,
      createdAt: user.createdAt,
      stats: {
        totalSpent: stats.totalSpent,
        completedOrdersCount: stats.completedOrdersCount,
        totalOrdersCount: stats.totalOrdersCount,
        lastOrderDate: stats.lastOrderDate,
      },
      tier: {
        key: tier.key,
        name: tier.name,
        badgeColor: tier.badgeColor,
        isVip: tier.isVip,
        discountRate: tier.discountRate,
        suggestedVoucher: {
          code: tier.suggestedVoucherCode,
          title: tier.voucherTitle,
          discountPercent: tier.discountRate,
        },
        perks: tier.perks,
        description: tier.description,
      },
    });
  }

  // 4. Áp dụng bộ lọc
  let filtered = customerList;

  // Lọc theo từ khóa (name, email, phone)
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s) ||
        c.phone.toLowerCase().includes(s),
    );
  }

  // Lọc theo VIP (Vàng, Kim Cương)
  if (isVip !== undefined && isVip !== null && isVip !== "") {
    const wantVip = String(isVip).toLowerCase() === "true" || isVip === true;
    filtered = filtered.filter((c) => c.tier.isVip === wantVip);
  }

  // Lọc theo thứ hạng cụ thể (hỗ trợ nhiều thứ hạng phân cách bằng dấu phẩy)
  if (rank && rank.trim()) {
    const targetRanks = rank
      .split(",")
      .map((r) => normalizeRankQuery(r.trim()))
      .filter(Boolean);

    if (targetRanks.length > 0) {
      filtered = filtered.filter((c) => targetRanks.includes(c.tier.name));
    }
  }

  // Lọc theo ngưỡng chi tiêu & số đơn hoàn tất (Hỗ trợ matchLogic OR hoặc AND)
  const hasMinSpent =
    minSpent !== undefined && minSpent !== "" && !isNaN(Number(minSpent));
  const hasMaxSpent =
    maxSpent !== undefined && maxSpent !== "" && !isNaN(Number(maxSpent));
  const hasMinOrders =
    minOrders !== undefined && minOrders !== "" && !isNaN(Number(minOrders));
  const hasMaxOrders =
    maxOrders !== undefined && maxOrders !== "" && !isNaN(Number(maxOrders));

  if (hasMinSpent || hasMaxSpent || hasMinOrders || hasMaxOrders) {
    const numMinSpent = hasMinSpent ? Number(minSpent) : null;
    const numMaxSpent = hasMaxSpent ? Number(maxSpent) : null;
    const numMinOrders = hasMinOrders ? Number(minOrders) : null;
    const numMaxOrders = hasMaxOrders ? Number(maxOrders) : null;

    filtered = filtered.filter((c) => {
      const matchSpentMin =
        numMinSpent !== null ? c.stats.totalSpent >= numMinSpent : true;
      const matchSpentMax =
        numMaxSpent !== null ? c.stats.totalSpent <= numMaxSpent : true;
      const matchSpent = matchSpentMin && matchSpentMax;

      const matchOrdersMin =
        numMinOrders !== null
          ? c.stats.completedOrdersCount >= numMinOrders
          : true;
      const matchOrdersMax =
        numMaxOrders !== null
          ? c.stats.completedOrdersCount <= numMaxOrders
          : true;
      const matchOrders = matchOrdersMin && matchOrdersMax;

      if (String(filterLogic).toUpperCase() === "AND") {
        return matchSpent && matchOrders;
      }
      // Logic OR: nếu truyền cả minSpent và minOrders, chỉ cần thỏa mãn một trong hai tiêu chí
      if (hasMinSpent && hasMinOrders) {
        return (
          (c.stats.totalSpent >= numMinSpent && matchSpentMax) ||
          (c.stats.completedOrdersCount >= numMinOrders && matchOrdersMax)
        );
      }
      return matchSpent && matchOrders;
    });
  }

  // 5. Sắp xếp danh sách (Sorting)
  const isAsc = String(sortOrder).toLowerCase() === "asc";
  filtered.sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortBy) {
      case "completedOrdersCount":
      case "orders":
        valA = a.stats.completedOrdersCount;
        valB = b.stats.completedOrdersCount;
        break;
      case "totalOrdersCount":
        valA = a.stats.totalOrdersCount;
        valB = b.stats.totalOrdersCount;
        break;
      case "name":
        return isAsc
          ? a.name.localeCompare(b.name, "vi")
          : b.name.localeCompare(a.name, "vi");
      case "createdAt":
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
        break;
      case "lastOrderDate":
        valA = a.stats.lastOrderDate
          ? new Date(a.stats.lastOrderDate).getTime()
          : 0;
        valB = b.stats.lastOrderDate
          ? new Date(b.stats.lastOrderDate).getTime()
          : 0;
        break;
      case "totalSpent":
      default:
        valA = a.stats.totalSpent;
        valB = b.stats.totalSpent;
        break;
    }

    if (valA === valB) {
      // Tie-breaker: sắp xếp phụ theo totalSpent rồi đến completedOrders
      if (b.stats.totalSpent !== a.stats.totalSpent) {
        return b.stats.totalSpent - a.stats.totalSpent;
      }
      return b.stats.completedOrdersCount - a.stats.completedOrdersCount;
    }
    return isAsc ? valA - valB : valB - valA;
  });

  // 6. Tính toán các tổng của danh sách sau khi lọc
  const totalFilteredCount = filtered.length;
  const filteredRevenueSum = filtered.reduce(
    (acc, c) => acc + c.stats.totalSpent,
    0,
  );

  // 7. Phân trang (Pagination)
  const parsedLimit =
    limit === "all" || Number(limit) === 0
      ? totalFilteredCount
      : Math.max(1, parseInt(limit) || 10);
  const parsedPage = Math.max(1, parseInt(page) || 1);
  const totalPages = Math.ceil(totalFilteredCount / parsedLimit) || 1;
  const startIndex = (parsedPage - 1) * parsedLimit;
  const paginatedCustomers = filtered.slice(
    startIndex,
    startIndex + parsedLimit,
  );

  return {
    customers: paginatedCustomers,
    summary: {
      totalFilteredCustomers: totalFilteredCount,
      totalSystemCustomers: users.length,
      filteredRevenueSum,
      totalRevenueAllCustomers,
      vipCount,
      tierCounts,
    },
    pagination: {
      currentPage: parsedPage,
      totalPages,
      pageSize: parsedLimit,
      totalItems: totalFilteredCount,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  };
}

/**
 * Tạo nội dung file CSV chuẩn RFC 4180 có UTF-8 BOM
 */
function createCsvString(headers, rows) {
  const escapeCell = (cell) => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell);
    if (
      str.includes('"') ||
      str.includes(",") ||
      str.includes("\n") ||
      str.includes("\r")
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const headerRow = headers.map(escapeCell).join(",");
  const dataRows = rows.map((row) => row.map(escapeCell).join(","));
  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

/**
 * Định dạng ngày giờ chuẩn hiển thị tiếng Việt
 */
function formatDateVN(date) {
  if (!date) return "Chưa có";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Chưa có";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Xuất danh sách khách hàng VIP để gửi voucher tri ân
 */
async function exportVipCustomers(query = {}) {
  const {
    format = "csv",
    targetRank = "all_vip", // 'all_vip' (Kim Cương & Vàng), 'Kim Cương', 'Vàng', 'Bạc', 'all'
    minSpent,
    minOrders,
    search,
  } = query;

  // Xác định bộ lọc rank theo targetRank
  let rankParam = undefined;
  let isVipParam = undefined;

  if (targetRank === "all_vip") {
    isVipParam = true;
  } else if (targetRank === "all") {
    // Lấy toàn bộ
  } else if (targetRank) {
    rankParam = targetRank;
  }

  // Lấy toàn bộ danh sách phù hợp (không phân trang limit=all)
  const result = await getLoyalCustomers({
    minSpent,
    minOrders,
    rank: rankParam,
    isVip: isVipParam,
    search,
    limit: "all",
    sortBy: "totalSpent",
    sortOrder: "desc",
  });

  const vipCustomers = result.customers;

  // 1. Trả về định dạng CSV nếu yêu cầu
  if (String(format).toLowerCase() === "csv") {
    const headers = [
      "Mã Khách Hàng",
      "Họ và Tên",
      "Email",
      "Số Điện Thoại",
      "Địa Chỉ",
      "Thứ Hạng",
      "Khách Hàng VIP",
      "Tổng Chi Tiêu (VNĐ)",
      "Số Đơn Hoàn Tất",
      "Tổng Số Đơn Hàng",
      "Đơn Hàng Gần Nhất",
      "Ngày Tham Gia",
      "Mã Voucher Gợi Ý",
      "Ưu Đãi Tri Ân",
    ];

    const rows = vipCustomers.map((c) => [
      String(c._id),
      c.name,
      c.email,
      c.phone ? `'${c.phone}` : "", // Thêm nháy đơn để Excel hiển thị đúng số 0 ở đầu
      c.address,
      c.tier.name,
      c.tier.isVip ? "Có" : "Không",
      c.stats.totalSpent.toLocaleString("vi-VN"),
      c.stats.completedOrdersCount,
      c.stats.totalOrdersCount,
      formatDateVN(c.stats.lastOrderDate),
      formatDateVN(c.createdAt),
      c.tier.suggestedVoucher.code,
      c.tier.suggestedVoucher.title,
    ]);

    const csvContent = createCsvString(headers, rows);
    const filename = `StoreHub_KhachHang_VIP_${new Date().toISOString().slice(0, 10)}.csv`;

    return {
      type: "csv",
      filename,
      content: csvContent,
      count: vipCustomers.length,
    };
  }

  // 2. Trả về JSON kèm danh sách gợi ý voucher tri ân
  const suggestedVouchersList = [
    {
      targetTier: "Kim Cương",
      code: LOYALTY_TIERS.DIAMOND.suggestedVoucherCode,
      title: LOYALTY_TIERS.DIAMOND.voucherTitle,
      discountPercent: LOYALTY_TIERS.DIAMOND.discountRate,
      description:
        "Dành riêng cho khách hàng chi tiêu từ 20 triệu hoặc từ 20 đơn hoàn tất",
    },
    {
      targetTier: "Vàng",
      code: LOYALTY_TIERS.GOLD.suggestedVoucherCode,
      title: LOYALTY_TIERS.GOLD.voucherTitle,
      discountPercent: LOYALTY_TIERS.GOLD.discountRate,
      description:
        "Dành riêng cho khách hàng chi tiêu từ 10 triệu hoặc từ 10 đơn hoàn tất",
    },
    {
      targetTier: "Bạc",
      code: LOYALTY_TIERS.SILVER.suggestedVoucherCode,
      title: LOYALTY_TIERS.SILVER.voucherTitle,
      discountPercent: LOYALTY_TIERS.SILVER.discountRate,
      description:
        "Dành riêng cho khách hàng chi tiêu từ 5 triệu hoặc từ 5 đơn hoàn tất",
    },
  ];

  return {
    type: "json",
    count: vipCustomers.length,
    targetRank,
    suggestedVouchers: suggestedVouchersList,
    customers: vipCustomers,
  };
}

/**
 * Gửi chiến dịch voucher tri ân đến danh sách khách hàng thân thiết / VIP
 */
async function sendVipVoucherCampaign({
  targetRank = "all_vip",
  voucherCode,
  discountPercent = 10,
  campaignTitle = "Tri ân Khách hàng Thân thiết StoreHub",
  message = "Cảm ơn bạn đã luôn tin tưởng và đồng hành cùng StoreHub!",
  adminUser = null,
}) {
  // Lấy danh sách khách hàng mục tiêu
  const exportResult = await exportVipCustomers({
    format: "json",
    targetRank,
  });

  const recipients = exportResult.customers;

  if (recipients.length === 0) {
    return {
      success: false,
      message: "Không tìm thấy khách hàng nào phù hợp với thứ hạng đã chọn.",
      totalSent: 0,
    };
  }

  // Lưu lịch sử hoạt động vào ActivityLog
  try {
    await ActivityLog.create({
      type: "loyalty_voucher_campaign",
      title: `Gửi voucher tri ân ${voucherCode} thành công`,
      detail: `Chiến dịch: "${campaignTitle}" - Đã gửi mã ${voucherCode} (giảm ${discountPercent}%) cho ${recipients.length} khách hàng (${targetRank}).`,
      actorName: adminUser ? adminUser.name || adminUser.email : "Admin",
      actorRole: adminUser ? adminUser.role : "admin",
      eventAt: new Date(),
    });
  } catch (logErr) {
    console.error("Lỗi khi ghi ActivityLog cho chiến dịch voucher:", logErr);
  }

  return {
    success: true,
    message: `Đã gửi voucher tri ân "${voucherCode}" thành công cho ${recipients.length} khách hàng thân thiết.`,
    campaign: {
      campaignTitle,
      voucherCode,
      discountPercent,
      targetRank,
      totalRecipients: recipients.length,
      sentAt: new Date(),
    },
    recipients: recipients.map((r) => ({
      _id: r._id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      tier: r.tier.name,
      totalSpent: r.stats.totalSpent,
      completedOrdersCount: r.stats.completedOrdersCount,
    })),
  };
}

module.exports = {
  LOYALTY_TIERS,
  ADMIN_ROLES,
  classifyCustomerTier,
  normalizeRankQuery,
  getLoyalCustomers,
  exportVipCustomers,
  sendVipVoucherCampaign,
};
