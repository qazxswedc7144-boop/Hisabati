import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-hisabati';
const runId = Date.now().toString(36);
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const clientApp = initializeApp({
  apiKey: 'fake-api-key-for-emulator',
  authDomain: projectId + '.firebaseapp.com',
  projectId,
  appId: '1:123456789:web:hisabati-integration',
}, 'hisabati-client-' + runId);

const adminApp = initializeAdminApp({ projectId }, 'hisabati-admin-' + runId);

async function main(): Promise<void> {
  const auth = initializeAuth(clientApp, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

  const clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);

  const adminAuth = getAdminAuth(adminApp);
  const adminDb = getAdminFirestore(adminApp);

  let user: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | undefined;
  let documentPath: ReturnType<typeof doc> | undefined;

  try {
    const email = 'integration-' + runId + '@example.test';
    const credential = await createUserWithEmailAndPassword(auth, email, 'TestPass-123456!');
    user = credential.user;

    const idToken = await user.getIdToken();
    const claims = await adminAuth.verifyIdToken(idToken);
    assert.equal(claims.uid, user.uid, 'Admin SDK must verify the Auth Emulator ID token');

    documentPath = doc(clientDb, 'integration-tests', user.uid);
    await setDoc(documentPath, {
      uid: user.uid,
      label: 'اختبار تكامل حساباتي',
      createdAt: new Date().toISOString(),
    });

    const clientSnapshot = await getDoc(documentPath);
    assert.equal(clientSnapshot.exists(), true, 'Authenticated client must read its own Firestore document');
    assert.equal(clientSnapshot.data().label, 'اختبار تكامل حساباتي');

    const adminSnapshot = await adminDb.collection('integration-tests').doc(user.uid).get();
    assert.equal(adminSnapshot.exists, true, 'Admin Firestore must observe the client write');
    assert.equal(adminSnapshot.data()?.uid, user.uid);

    await deleteDoc(documentPath);
    await deleteUser(user);
    user = undefined;

    console.log('Firebase Auth + client Firestore + Admin Firestore emulator integration passed.');
  } finally {
    if (documentPath) {
      try { await deleteDoc(documentPath); } catch { /* emulator cleanup is best-effort */ }
    }
    if (user) {
      try { await deleteUser(user); } catch { /* emulator cleanup is best-effort */ }
    }
    try { await signOut(auth); } catch { /* already signed out */ }
    await deleteAdminApp(adminApp);
    await deleteApp(clientApp);
  }
}

main().catch((error) => {
  console.error('Firebase emulator integration failed:', error);
  process.exitCode = 1;
});
