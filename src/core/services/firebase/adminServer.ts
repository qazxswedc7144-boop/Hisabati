let adminInstance: any = null;
let isInitialized = false;

let mockAdminAuth: any = null;
let mockAdminFirestore: any = null;

export function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return true;
  }
  return false;
}

export function setAdminAuthMock(auth: any) {
  if (isProductionEnvironment()) {
    throw new Error('Security Violation: Mock Admin Auth injection is strictly forbidden in production.');
  }
  mockAdminAuth = auth;
}

export function setAdminFirestoreMock(db: any) {
  if (isProductionEnvironment()) {
    throw new Error('Security Violation: Mock Admin Firestore injection is strictly forbidden in production.');
  }
  mockAdminFirestore = db;
}

export function clearAdminMocks() {
  mockAdminAuth = null;
  mockAdminFirestore = null;
}

function getNodeAdmin() {
  if (typeof window !== 'undefined') {
    throw new Error('Firebase Admin SDK is restricted to server-side execution.');
  }
  if (!adminInstance) {
    try {
      if (typeof require !== 'undefined') {
        adminInstance = require('firebase-admin');
      }
    } catch (e) {
      console.warn('[adminServer] Failed to load firebase-admin:', e);
    }
  }
  return adminInstance;
}

export function initFirebaseAdmin() {
  if (typeof window !== 'undefined') return null;
  const isProd = isProductionEnvironment();
  const admin = getNodeAdmin();
  if (!admin) {
    if (isProd) {
      throw new Error('Security Violation: Firebase Admin SDK package is required in production but could not be loaded.');
    }
    return null;
  }

  if (!isInitialized && (!admin.apps || admin.apps.length === 0)) {
    try {
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountEnv) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
        });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      } else {
        admin.initializeApp();
      }
      isInitialized = true;
    } catch (err: any) {
      console.warn('[FirebaseAdmin] Initialization warning or credentials missing:', err);
      if (isProd) {
        // Fail-Closed: HISABATI_ALLOW_UNINITIALIZED_ADMIN MUST NOT allow bypassing in production!
        throw new Error('Firebase Admin SDK initialization failed in production: ' + (err?.message || err));
      }
      if (process.env.HISABATI_ALLOW_UNINITIALIZED_ADMIN !== 'true') {
        throw new Error('Firebase Admin SDK initialization failed: ' + (err?.message || err));
      }
    }
  }
  return admin;
}

export function getAdminAuth() {
  if (isProductionEnvironment()) {
    if (mockAdminAuth) {
      throw new Error('Security Violation: Mock Admin Auth cannot be used in production.');
    }
    const admin = initFirebaseAdmin();
    if (!admin || !admin.apps || admin.apps.length === 0) {
      throw new Error('Firebase Admin Auth not available in production.');
    }
    return admin.auth();
  }

  if (mockAdminAuth) return mockAdminAuth;
  const admin = initFirebaseAdmin();
  if (!admin) {
    throw new Error('Firebase Admin Auth not available.');
  }
  return admin.auth();
}

export function getAdminFirestore() {
  if (isProductionEnvironment()) {
    if (mockAdminFirestore) {
      throw new Error('Security Violation: Mock Admin Firestore cannot be used in production.');
    }
    const admin = initFirebaseAdmin();
    if (!admin || !admin.apps || admin.apps.length === 0) {
      throw new Error('Firebase Admin Firestore not available in production.');
    }
    return admin.firestore();
  }

  if (mockAdminFirestore) return mockAdminFirestore;
  const admin = initFirebaseAdmin();
  if (!admin) {
    throw new Error('Firebase Admin Firestore not available.');
  }
  return admin.firestore();
}
