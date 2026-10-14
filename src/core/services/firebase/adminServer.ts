let adminInstance: any = null;
let isInitialized = false;

let mockAdminAuth: any = null;
let mockAdminFirestore: any = null;

export function setAdminAuthMock(auth: any) {
  mockAdminAuth = auth;
}

export function setAdminFirestoreMock(db: any) {
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
      const req = typeof eval === 'function' ? eval('require') : null;
      adminInstance = req ? req('firebase-admin') : null;
    } catch (e) {
      console.warn('[adminServer] Failed to load firebase-admin via dynamic require:', e);
    }
  }
  return adminInstance;
}

export function initFirebaseAdmin() {
  if (typeof window !== 'undefined') return null;
  const admin = getNodeAdmin();
  if (!admin) return null;

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
      const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
      const isVitest = typeof process !== 'undefined' && process.env.VITEST === 'true';
      if (isProd && !isVitest && process.env.HISABATI_ALLOW_UNINITIALIZED_ADMIN !== 'true') {
        throw new Error('Firebase Admin SDK initialization failed in production: ' + (err?.message || err));
      }
    }
  }
  return admin;
}

export function getAdminAuth() {
  if (mockAdminAuth) return mockAdminAuth;
  const admin = initFirebaseAdmin();
  if (!admin) {
    throw new Error('Firebase Admin Auth not available.');
  }
  return admin.auth();
}

export function getAdminFirestore() {
  if (mockAdminFirestore) return mockAdminFirestore;
  const admin = initFirebaseAdmin();
  if (!admin) {
    throw new Error('Firebase Admin Firestore not available.');
  }
  return admin.firestore();
}
