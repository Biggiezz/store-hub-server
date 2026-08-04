const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("cart and customer-order routes remain scoped to the JWT user", () => {
  const cartModel = read("models/Cart.js");
  const products = read("routes/productsRouter.js");
  const orders = read("routes/oderRouter.js");

  assert.match(cartModel, /userId:\s*\{[\s\S]*required:\s*true/);
  assert.doesNotMatch(products, /Cart\.(find|deleteMany)\(\{\}\)/);
  assert.doesNotMatch(orders, /Cart\.(find|deleteMany)\(\{\}\)/);
  assert.doesNotMatch(orders, /Order\.deleteMany\(/);
  assert.match(products, /router\.get\("\/get-cart", authenticateToken/);
  assert.match(products, /router\.post\("\/add-to-cart", authenticateToken/);
  assert.match(products, /userId: req\.user\.id/);
  assert.match(products, /findOneAndDelete\(\{ _id: req\.params\.id, userId: req\.user\.id \}\)/);
  assert.match(orders, /router\.post\("\/create-order", authenticateToken/);
  assert.match(orders, /Order\.find\(\{ user: req\.user\.id \}\)/);
});
