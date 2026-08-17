try {
  require('../app');
  console.log("✅ App required successfully. No syntax or import errors.");
  process.exit(0);
} catch (e) {
  console.error("❌ App require failed:", e);
  process.exit(1);
}
