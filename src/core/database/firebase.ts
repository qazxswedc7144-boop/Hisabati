import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfigJson from '../../../firebase-applet-config.json';

// Configuration merging: prioritize env vars, fallback to applet config
const getEnv = (key: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || firebaseConfigJson.apiKey,
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseConfigJson.authDomain,
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || firebaseConfigJson.projectId,
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseConfigJson.storageBucket,
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseConfigJson.messagingSenderId,
  appId: getEnv('VITE_FIREBASE_APP_ID') || firebaseConfigJson.appId,
  firestoreDatabaseId: getEnv('VITE_FIREBASE_DATABASE_ID') || firebaseConfigJson.firestoreDatabaseId,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Defensive initialization: only initialize if apiKey is present to avoid crash
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'UNDEFINED') {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    // Explicitly use the databaseId from config if provided
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    console.log("Firebase initialized successfully");
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
} else {
  console.warn("Firebase API Key is missing. Cloud features (Auth/Sync) are disabled. Please configure Firebase in the settings menu.");
}

export { app, auth, db };
export default app;
