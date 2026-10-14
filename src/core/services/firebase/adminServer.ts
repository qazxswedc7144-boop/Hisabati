import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let isInitialized = false;

export function initFirebaseAdmin() {
  if (!isInitialized && getApps().length === 0) {
    try {
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountEnv) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        initializeApp({
          credential: cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
        });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      } else {
        // Default initialization for GCP / environment default credentials
        initializeApp();
      }
      isInitialized = true;
    } catch (err) {
      console.warn('[FirebaseAdmin] Initialization warning or credentials missing:', err);
    }
  }
  return {
    auth: getAuth,
    firestore: getFirestore,
  };
}

export function getAdminAuth() {
  initFirebaseAdmin();
  return getAuth();
}

export function getAdminFirestore() {
  initFirebaseAdmin();
  return getFirestore();
}
