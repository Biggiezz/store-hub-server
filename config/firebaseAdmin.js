const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getFirebaseAuth() {
  if (getApps().length > 0) {
    return getAuth();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    const error = new Error("Firebase Admin is not fully configured.");
    error.code = "firebase/config-missing";
    throw error;
  }

  const app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });

  return getAuth(app);
}

module.exports = { getFirebaseAuth };
