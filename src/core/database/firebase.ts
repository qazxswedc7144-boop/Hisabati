import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfigJson from '../../../firebase-applet-config.json';

// Build-time Vite values take precedence, with Node environment values available to
// emulator integration tests and server-side tooling.
const getEnv = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
    return import.meta.env[key] as string;
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
};

// Environment overrides are intentional: CI must be able to point the SDK at
// isolated emulator project IDs instead of silently using the applet project.
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || firebaseConfigJson.apiKey,
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || firebaseConfigJson.authDomain,
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || firebaseConfigJson.projectId,
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || firebaseConfigJson.storageBucket,
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || firebaseConfigJson.messagingSenderId,
  appId: getEnv('VITE_FIREBASE_APP_ID') || firebaseConfigJson.appId,
  firestoreDatabaseId: getEnv('VITE_FIREBASE_DATABASE_ID') || firebaseConfigJson.firestoreDatabaseId,
};

const parseEmulatorAddress = (address: string, defaultPort: number): { host: string; port: number } => {
  const normalized = address.replace(/^https?:\\/\\//, '');
  const separator = normalized.lastIndexOf(':');
  if (separator <= 0) {
    return { host: normalized, port: defaultPort };
  }
  const host = normalized.slice(0, separator);
  const port = Number(normalized.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid Firebase emulator address: ${address}`);
  }
  return { host, port };
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Defensive initialization: only initialize if apiKey is present to avoid crash.
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'UNDEFINED') {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

    // Emulator use is opt-in and requires explicit hosts. Production behavior is
    // unchanged unless VITE_FIREBASE_USE_EMULATORS=true is deliberately supplied.
    if (getEnv('VITE_FIREBASE_USE_EMULATORS') === 'true') {
      const authHost = getEnv('VITE_FIREBASE_AUTH_EMULATOR_HOST');
      const firestoreHost = getEnv('VITE_FIREBASE_FIRESTORE_EMULATOR_HOST');
      if (!authHost || !firestoreHost) {
        throw new Error('Firebase emulator mode requires explicit Auth and Firestore emulator hosts.');
      }

      const authUrl = /^https?:\\/\\//.test(authHost) ? authHost : `http://${authHost}`;
      const firestoreAddress = parseEmulatorAddress(firestoreHost, 8080);
      connectAuthEmulator(auth, authUrl, { disableWarnings: true });
      connectFirestoreEmulator(db, firestoreAddress.host, firestoreAddress.port);
    }

    console.log('Firebase initialized successfully');
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
} else {
  console.warn('Firebase API Key is missing. Cloud features (Auth/Sync) are disabled. Please configure Firebase in the settings menu.');
}

export { app, auth, db };
export default app;
