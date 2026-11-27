import assert from 'node:assert/strict';

const projectId = 'demo-hisabati';
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

process.env.FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_API_KEY = 'demo-api-key';
process.env.VITE_FIREBASE_AUTH_DOMAIN = projectId + '.firebaseapp.com';
process.env.VITE_FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_DATABASE_ID = '(default)';
process.env.VITE_FIREBASE_USE_EMULATORS = 'true';
process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;

const [
  adminAppSdk,
  adminAuthSdk,
  adminFirestoreSdk,
  clientAuthSdk,
  firebaseModule,
  serverModule,
  adminServerModule,
  verifierModule,
  leaseIssuerModule,
] = await Promise.all([
  import('firebase-admin/app'),
  import('firebase-admin/auth'),
  import('firebase-admin/firestore'),
  import('firebase/auth'),
  import('../../src/core/database/firebase'),
  import('../../server'),
  import('../infrastructure/adminServer'),
  import('../infrastructure/ServerMembershipVerifier'),
  import('../infrastructure/ServerLeaseIssuer'),
]);

const adminApp = adminAppSdk.initializeApp({ projectId }, 'hisabati-tenant-http-integration');
const adminAuth = adminAuthSdk.getAuth(adminApp);
const adminDb = adminFirestoreSdk.getFirestore(adminApp);
const clientAuth = firebaseModule.auth;
assert.ok(clientAuth, 'Application Auth must initialize against Auth Emulator.');

const suffix = Date.now().toString();
const uidA = 'tenant-http-viewer-' + suffix;
const uidB = 'tenant-http-owner-' + suffix;
const emailA = uidA + '@example.test';
const emailB = uidB + '@example.test';
const password = 'Integration-Only-Password-42!';
const orgId = 'tenant-http-org-' + suffix;
const missingOrgId = 'tenant-http-missing-' + suffix;
const now = new Date().toISOString();

let tokenA = '';
let tokenB = '';
let httpServer: any;
let baseUrl = '';

const results: Array<{ name: string; run: () => Promise<void> }> = [];

const requestJson = async (path: string, body?: unknown, token?: string) => {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
};

try {
  await adminAuth.createUser({ uid: uidA, email: emailA, password });
  await adminAuth.createUser({ uid: uidB, email: emailB, password });

  await clientAuthSdk.signInWithEmailAndPassword(clientAuth, emailA, password);
  tokenA = await clientAuth.currentUser!.getIdToken(true);
  await clientAuthSdk.signOut(clientAuth);
  await clientAuthSdk.signInWithEmailAndPassword(clientAuth, emailB, password);
  tokenB = await clientAuth.currentUser!.getIdToken(true);
  await clientAuthSdk.signOut(clientAuth);

  await adminDb.collection('organizations').doc(orgId).set({
    name: 'Tenant HTTP Integration',
    ownerId: uidA,
    status: 'active',
    settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
    createdAt: now,
    updatedAt: now,
  });
  await adminDb.collection('organizations').doc(orgId).collection('members').doc(uidA).set({
    role: 'viewer',
    status: 'active',
    permissions: ['reports:read'],
    createdAt: now,
    updatedAt: now,
  });
  await adminDb.collection('organizations').doc(orgId).collection('members').doc(uidB).set({
    role: 'owner',
    status: 'active',
    permissions: ['transactions:reverse', 'team:manage_members'],
    createdAt: now,
    updatedAt: now,
  });
  await adminDb.collection('organizations').doc(missingOrgId).set({
    name: 'Tenant HTTP Missing Membership',
    ownerId: 'someone-else',
    status: 'active',
    settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
    createdAt: now,
    updatedAt: now,
  });

  adminServerModule.setAdminAuthMock(adminAuth);
  adminServerModule.setAdminFirestoreMock(adminDb);
  verifierModule.ServerMembershipVerifier.setForceAdminSdkForTest(true);

  const app = serverModule.createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = 'http://127.0.0.1:' + address.port;

  results.push({
    name: 'HTTP verify-membership derives UID, role, and permissions from Auth and Firestore, not client claims',
    run: async () => {
      const response = await requestJson('/api/tenant/verify-membership', {
        organizationId: orgId,
        clientClaimedUid: uidB,
        clientClaimedRole: 'owner',
        clientClaimedPermissions: ['transactions:reverse', 'team:manage_members'],
      }, tokenA);
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.verifiedUid, uidA);
      assert.equal(response.body.membership.userId, uidA);
      assert.equal(response.body.membership.role, 'viewer');
      assert.deepEqual(response.body.membership.permissions, ['reports:read']);
    },
  });

  results.push({
    name: 'HTTP verify-membership rejects invalid Firebase ID tokens',
    run: async () => {
      const response = await requestJson('/api/tenant/verify-membership', {
        organizationId: orgId,
      }, 'not-a-valid-firebase-token');
      assert.equal(response.status, 403);
      assert.equal(response.body.success, false);
    },
  });

  results.push({
    name: 'HTTP verify-membership rejects authenticated users without Firestore membership',
    run: async () => {
      const response = await requestJson('/api/tenant/verify-membership', {
        organizationId: missingOrgId,
      }, tokenA);
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'MEMBERSHIP_NOT_FOUND');
    },
  });

  results.push({
    name: 'HTTP issue-lease requires a valid Firebase bearer token',
    run: async () => {
      const missing = await requestJson('/api/tenant/issue-lease', { organizationId: orgId });
      assert.equal(missing.status, 401);
      const invalid = await requestJson('/api/tenant/issue-lease', { organizationId: orgId }, 'invalid-token');
      assert.equal(invalid.status, 401);
    },
  });

  results.push({
    name: 'HTTP issue-lease binds the lease identity to the bearer token, not a conflicting body token',
    run: async () => {
      const response = await requestJson('/api/tenant/issue-lease', {
        organizationId: orgId,
        idToken: tokenB,
        clientClaimedUid: uidB,
        clientClaimedRole: 'owner',
        clientClaimedPermissions: ['transactions:reverse', 'team:manage_members'],
      }, tokenA);
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.lease.verifiedUid, uidA);
      assert.equal(response.body.lease.verifiedRole, 'viewer');
      assert.deepEqual(response.body.lease.verifiedPermissions, ['reports:read']);
      assert.equal(response.body.lease.organizationId, orgId);
      assert.equal(response.body.lease.audience, orgId);
      assert.equal(response.body.lease.issuer, 'hisabati-auth-server');
    },
  });

  results.push({
    name: 'HTTP-issued Capability Lease signature verifies and detects payload tampering',
    run: async () => {
      const response = await requestJson('/api/tenant/issue-lease', {
        organizationId: orgId,
      }, tokenA);
      assert.equal(response.status, 200);
      const lease = response.body.lease;
      const publicKeyResponse = await fetch(baseUrl + '/api/tenant/public-key');
      assert.equal(publicKeyResponse.status, 200);
      const publicKeyBody = await publicKeyResponse.json() as any;
      const cryptoLib = (await import('node:crypto')).webcrypto;
      const publicKey = await cryptoLib.subtle.importKey(
        'jwk',
        publicKeyBody.publicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const { integrityHash, ...unsignedLease } = lease;
      const canonical = leaseIssuerModule.ServerLeaseIssuer.buildCanonicalPayload(unsignedLease);
      const signature = Buffer.from(integrityHash, 'base64');
      const valid = await cryptoLib.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        new TextEncoder().encode(canonical),
      );
      assert.equal(valid, true);

      const tamperedLease = { ...unsignedLease, verifiedRole: 'owner' };
      const tamperedCanonical = leaseIssuerModule.ServerLeaseIssuer.buildCanonicalPayload(tamperedLease);
      const tamperedValid = await cryptoLib.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        new TextEncoder().encode(tamperedCanonical),
      );
      assert.equal(tamperedValid, false);
    },
  });

  results.push({
    name: 'HTTP verify-membership rejects suspended memberships',
    run: async () => {
      await adminDb.collection('organizations').doc(orgId).collection('members').doc(uidA).update({
        status: 'suspended',
      });
      const response = await requestJson('/api/tenant/verify-membership', {
        organizationId: orgId,
      }, tokenA);
      assert.equal(response.status, 403);
      assert.equal(response.body.code, 'MEMBERSHIP_SUSPENDED');
    },
  });

  let failed = 0;
  for (const test of results) {
    try {
      await test.run();
      console.log('PASS ' + test.name);
    } catch (error) {
      failed += 1;
      console.error('FAIL ' + test.name, error);
    }
  }
  console.log('Tenant HTTP Integration: ' + (results.length - failed) + '/' + results.length + ' passed');
  if (failed > 0) process.exitCode = 1;
} finally {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  try {
    await clientAuthSdk.signOut(clientAuth);
  } catch {
    // Continue cleanup after emulator session failures.
  }
  try {
    await adminDb.collection('organizations').doc(orgId).collection('members').doc(uidA).delete();
    await adminDb.collection('organizations').doc(orgId).collection('members').doc(uidB).delete();
    await adminDb.collection('organizations').doc(orgId).delete();
    await adminDb.collection('organizations').doc(missingOrgId).delete();
    await adminAuth.deleteUser(uidA);
    await adminAuth.deleteUser(uidB);
  } catch (error) {
    console.warn('Tenant HTTP integration cleanup reported a non-fatal error:', error);
  }
  adminServerModule.clearAdminMocks();
  verifierModule.ServerMembershipVerifier.setForceAdminSdkForTest(false);
  await adminAppSdk.deleteApp(adminApp);
}
