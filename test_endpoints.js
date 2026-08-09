/**
 * StoreHub API Automated Test Script
 * Run this script to test client and admin endpoints, input validation, and security vulnerabilities.
 * Usage: node test_endpoints.js [Optional: BASE_URL]
 * Example: node test_endpoints.js http://localhost:3000
 */

const BASE_URL = process.argv[2] || "https://storehub-server.vercel.app";

console.log("=================================================");
console.log(`🚀 STARTING STOREHUB API AUTOMATED TEST SUITE`);
console.log(`🎯 Target Server: ${BASE_URL}`);
console.log("=================================================\n");

const timestamp = Date.now();
const testUser = {
  name: "Automation Tester",
  email: `tester_${timestamp}@gmail.com`,
  phone: "0987654321",
  password: "securepassword123"
};

let authToken = "";
let adminToken = "";
let sampleProductId = "";
let sampleOrderId = "";

// Helper for sending JSON requests
async function sendRequest(path, method = "GET", body = null, headers = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

// Visual logger for test assertions
function logResult(testName, passed, details = "") {
  if (passed) {
    console.log(`✅ [PASSED] - ${testName} ${details ? `(${details})` : ""}`);
  } else {
    console.log(`❌ [FAILED] - ${testName} ${details ? `(${details})` : ""}`);
  }
}

async function runTests() {
  console.log("-------------------------------------------------");
  console.log("👤 PHASE 1: USER REGISTRATION & VALIDATION TESTS");
  console.log("-------------------------------------------------");

  // Test 1.1: Missing required fields
  const t1 = await sendRequest("/users/register", "POST", { name: "No Email User" });
  logResult(
    "Register with missing email/password", 
    t1.status === 400 && t1.data?.message?.includes("Vui lòng nhập đầy đủ"),
    `Status: ${t1.status}`
  );

  // Test 1.2: Register success
  const t2 = await sendRequest("/users/register", "POST", testUser);
  logResult(
    "Register successful new user",
    t2.status === 201 && t2.data?.data?.email === testUser.email,
    `Status: ${t2.status}`
  );

  // Test 1.3: Duplicate Email Check
  const t3 = await sendRequest("/users/register", "POST", testUser);
  logResult(
    "Register duplicate email validation check",
    t3.status === 400 && t3.data?.message?.includes("Email đã tồn tại"),
    `Status: ${t3.status}`
  );


  console.log("\n-------------------------------------------------");
  console.log("🔑 PHASE 2: USER LOGIN TESTS");
  console.log("-------------------------------------------------");

  // Test 2.1: Login with wrong password
  const t4 = await sendRequest("/users/login", "POST", {
    email: testUser.email,
    password: "wrongpassword"
  });
  logResult(
    "Login failure with incorrect password",
    t4.status === 400 && t4.data?.message?.includes("không chính xác"),
    `Status: ${t4.status}`
  );

  // Test 2.2: Login success
  const t5 = await sendRequest("/users/login", "POST", {
    email: testUser.email,
    password: testUser.password
  });
  const loginSuccess = t5.status === 200 && t5.data?.token;
  logResult(
    "Login successful and retrieved JWT Token",
    loginSuccess,
    `Status: ${t5.status}`
  );
  if (loginSuccess) {
    authToken = t5.data.token;
  }


  console.log("\n-------------------------------------------------");
  console.log("📦 PHASE 3: PRODUCT & CATEGORY RETRIEVAL TESTS");
  console.log("-------------------------------------------------");

  // Test 3.1: Get categories list
  const t6 = await sendRequest("/api/productsRouter/get-categories");
  logResult(
    "Get all categories",
    t6.status === 200 && Array.isArray(t6.data?.data),
    `Status: ${t6.status}`
  );

  // Test 3.2: Get all products
  const t7 = await sendRequest("/api/productsRouter/get-all-product");
  logResult(
    "Get all products with pagination",
    t7.status === 200 && Array.isArray(t7.data?.data),
    `Status: ${t7.status}`
  );
  if (t7.status === 200 && t7.data?.data?.length > 0) {
    sampleProductId = t7.data.data[0]._id;
  }

  // Test 3.3: Search products
  const t8 = await sendRequest(`/api/productsRouter/search-product?keyword=phone`);
  logResult(
    "Search products with keyword 'phone'",
    t8.status === 200 && Array.isArray(t8.data?.data),
    `Status: ${t8.status}`
  );


  console.log("\n-------------------------------------------------");
  console.log("🛒 PHASE 4: CART OPERATIONS TESTS");
  console.log("-------------------------------------------------");

  // Test 4.1: Add to cart without token (Guest)
  const t9 = await sendRequest("/api/productsRouter/add-to-cart", "POST", {
    productId: sampleProductId,
    quantity: 1
  });
  logResult(
    "Add to cart blocked if unauthorized (Guest)",
    t9.status === 401 || t9.status === 403 || t9.data?.code === 401,
    `Status: ${t9.status}`
  );

  // Test 4.2: Add to cart with token (Logged-in customer)
  if (authToken) {
    const t10 = await sendRequest(
      "/api/productsRouter/add-to-cart", 
      "POST", 
      { productId: sampleProductId, quantity: 1 },
      { "Authorization": `Bearer ${authToken}` }
    );
    logResult(
      "Add to cart successful with JWT Authorization",
      t10.status === 200 || t10.status === 201,
      `Status: ${t10.status}`
    );
  } else {
    console.log("⚠️ Skipping auth tests: authToken is missing.");
  }


  console.log("\n-------------------------------------------------");
  console.log("⚠️ PHASE 5: SECURITY VULNERABILITY AUDIT");
  console.log("-------------------------------------------------");

  // Test 5.1: Access all user details as a Customer
  if (authToken) {
    const t11 = await sendRequest(
      "/users/get-all-users",
      "GET",
      null,
      { "Authorization": `Bearer ${authToken}` }
    );
    // VULNERABILITY: If this endpoint returns 200 for a customer, it means it leaks data!
    const leaked = t11.status === 200;
    logResult(
      "Privilege Escalation check: '/get-all-users' restricted to Admins",
      !leaked,
      leaked ? "🔥 VULNERABILITY: Customer was allowed to read all user data!" : "Correctly restricted"
    );
  }

  // Test 5.2: Create a user/admin as a Customer
  if (authToken) {
    const t12 = await sendRequest(
      "/users/add-user",
      "POST",
      {
        name: "Malicious Admin",
        email: `hacked_${timestamp}@gmail.com`,
        phone: "0999999999",
        password: "password123",
        role: "admin"
      },
      { "Authorization": `Bearer ${authToken}` }
    );
    const escalated = t12.status === 200 || t12.status === 201;
    logResult(
      "Privilege Escalation check: '/add-user' restricted to Admins",
      !escalated,
      escalated ? "🔥 VULNERABILITY: Customer was allowed to create a new user/admin!" : "Correctly restricted"
    );
  }

  // Test 5.3: Unprotected Cancel Order Endpoint
  const t13 = await sendRequest("/api/oderRouter/cancel-order", "POST", {
    orderId: "66aa00000000000000000000", // dummy id
    reason: "No authentication"
  });
  // Since it doesn't verify JWT token, it should respond with 404 (matchedCount=0) instead of 401!
  const unprotectedCancel = t13.status === 404; // 404 means it evaluated the query instead of blocking with 401
  logResult(
    "Authentication check: '/cancel-order' requires token",
    !unprotectedCancel,
    unprotectedCancel ? "🔥 VULNERABILITY: Endpoint allows cancelling orders without JWT token!" : "Correctly protected"
  );

  console.log("\n=================================================");
  console.log("🏁 STOREHUB API TESTS COMPLETED");
  console.log("=================================================");
}

runTests();
