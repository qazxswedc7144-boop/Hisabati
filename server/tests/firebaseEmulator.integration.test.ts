import assert from 'node:assert/strict';

const projectId = 'demo-hisabati';
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!authEmulatorHost || !firestoreEmulatorHost) {
  throw new Error('Firebase integration tests require both Auth and Firestore emulators.');
}

// Set the application configuration before importing modules that initialize Firebase.
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_API_KEY = 'demo-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = `${projectId}.firebaseapp.com`;
process.env.VITE_FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_DATABASE_ID = '(default)';
process.env.VITE_FIREBASE_USE_EMULATORS = 'true';
process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;

const [
  adminAppSdk,
  adminAuthSdk,
  adminFirestoreSdk,
  clientAuthSdk,
  clientFirestoreSdk,
  firebaseModule,
  authServiceModule,
  verifierModule,
  adminServerModule,
] = await Promise.all([
  import('firebase-admin/app'),
  import('firebase-admin/auth'),
  import('firebase-admin/firestore'),
  import('firebase/auth'),
  import('firebase/firestore'),
  import('../../src/core/database/firebase'),
  import('../../src/core/services/rbac/AuthService.service'),
  import('../infrastructure/ServerMembershipVerifier'),
  import('../infrastructure/adminServer'),
]);

const adminApp = adminAppSdk.initializeApp({ projectId }, 'hisabati-emulator-integration');
const adminAuth = adminAuthSdk.getAuth(adminApp);
const adminDb = adminFirestoreSdk.getFirestore(adminApp);
const clientAuth = firebaseModule.auth;
const clientDb = firebaseModule.db;

assert.ok(clientAuth, 'Application Firebase Auth must initialize against the emulator.');
assert.ok(clientDb, 'Application Firestore must initialize against the emulator.');

const uid = `hisabati-it-${Date.now()}`;
const email = `${uid}@example.test`;
const password = 'Integration-Only-Password-42!';
const organizationId = `org-${uid}`;
const missingMembershipOrgId = `org-no-member-${uid}`;
const now = new Date().toISOString();

const waitForAuthenticatedActor = async (): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (clientAuth.currentUser?.uid === uid && authServiceModule.authService.getActiveActor().id === uid) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Firebase Auth state listener did not publish the authenticated application actor.');
};

const results: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: 'Application AuthService signs in through the Auth Emulator',
    run: async () => {
      await adminAuth.createUser({ uid, email, password, displayName: 'Hisabati Emulator User' });
      await authServiceModule.authService.login(email, password);
      await waitForAuthenticatedActor();
      const actor = authServiceModule.authService.getActiveActor();
      assert.equal(actor.id, uid);
      assert.equal(actor.role, 'pending_membership');
      assert.equal(authServiceModule.authService.getStatus(), 'authenticated');
    },
  },
  {
    name: 'Client Firestore cannot read or write authoritative organization data',
    run: async () => {
      const orgRef = clientFirestoreSdk.doc(clientDb, 'organizations', organizationId);
      await assert.rejects(
        () => clientFirestoreSdk.getDoc(orgRef),
        (error: { code?: string }) => error.code === 'permission-denied',
        'Authenticated clients must not read authoritative organization records directly.',
      );
      await assert.rejects(
        () => clientFirestoreSdk.setDoc(orgRef, { name: 'Client Spoofed Organization' }),
        (error: { code?: string }) => error.code === 'permission-denied',
        'Authenticated clients must not write authoritative organization records directly.',
      );
    },
  },
  {
    name: 'Server verifier reads the real Firestore membership and ignores client role spoofing',
    run: async () => {
      await adminDb.collection('organizations').doc(organizationId).set({
        name: 'Emulator Integration Organization',
        ownerId: uid,
        status: 'active',
        settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
        createdAt: now,
        updatedAt: now,
      });
      await adminDb.collection('organizations').doc(organizationId).collection('members').doc(uid).set({
        role: 'viewer',
        status: 'active',
        permissions: ['reports:read'],
        createdAt: now,
        updatedAt: now,
      });

      adminServerModule.setAdminAuthMock(adminAuth);
      adminServerModule.setAdminFirestoreMock(adminDb);
      verifierModule.ServerMembershipVerifier.setForceAdminSdkForTest(true);

      const idToken = await clientAuth.currentUser!.getIdToken(true);
      const result = await verifierModule.ServerMembershipVerifier.verifyMembership({
        idToken,
        organizationId,
        clientClaimedUid: 'attacker-controlled-uid',
        clientClaimedRole: 'owner',
        clientClaimedPermissions: ['transactions:reverse', 'team:manage_members'],
      });

      assert.equal(result.success, true);
      assert.equal(result.verifiedByBackend, true);
      assert.equal(result.verifiedUid, uid);
      assert.equal(result.membership?.userId, uid);
      assert.equal(result.membership?.role, 'viewer');
      assert.deepEqual(result.membership?.permissions, ['reports:read']);
    },
  },
  {
    name: 'Server verifier rejects an authenticated user without a Firestore membership',
    run: async () => {
      await adminDb.collection('organizations').doc(missingMembershipOrgId).set({
        name: 'No Membership Organization',
        ownerId: 'another-user',
        status: 'active',
        settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
        createdAt: now,
        updatedAt: now,
      });
      const idToken = await clientAuth.currentUser!.getIdToken();
      const result = await verifierModule.ServerMembershipVerifier.verifyMembership({
        idToken,
        organizationId: missingMembershipOrgId,
      });
      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'MEMBERSHIP_NOT_FOUND');
      assert.equal(result.verifiedUid, uid);
    },
  },
  {
    name: 'Server verifier rejects suspended Firestore memberships',
    run: async () => {
      await adminDb.collection('organizations').doc(organizationId).collection('members').doc(uid).update({
        status: 'suspended',
      });
      const idToken = await clientAuth.currentUser!.getIdToken();
      const result = await verifierModule.ServerMembershipVerifier.verifyMembership({
        idToken,
        organizationId,
      });
      assert.equal(result.success, false);
      assert.equal(result.error?.code, 'MEMBERSHIP_SUSPENDED');
    },
  },
];

let failed = 0;
try {
  for (const test of results) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`, error);
    }
  }
} finally {
  try {
    await clientAuthSdk.signOut(clientAuth);
  } catch {
    // Cleanup must continue even if the emulator session has already ended.
  }
  try {
    await adminDb.collection('organizations').doc(organizationId).collection('members').doc(uid).delete();
    await adminDb.collection('organizations').doc(organizationId).delete();
    await adminDb.collection('organizations').doc(missingMembershipOrgId).delete();
    await adminAuth.deleteUser(uid);
  } catch (error) {
    console.warn('Emulator test cleanup reported a non-fatal error:', error);
  }
  adminServerModule.clearAdminMocks();
  verifierModule.ServerMembershipVerifier.setForceAdminSdkForTest(false);
  await adminAppSdk.deleteApp(adminApp);
}

console.log(`Firebase Emulator Integration: ${results.length - failed}/${results.length} passed`);
if (failed > 0) {
  process.exitCode = 1;
}
