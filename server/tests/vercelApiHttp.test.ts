import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FirebaseTokenVerifier } from '../infrastructure/FirebaseTokenVerifier';
import { ServerMembershipVerifier } from '../infrastructure/ServerMembershipVerifier';

interface HttpResult {
  status: number;
  body: any;
}

function sendJson(
  port: number,
  path: string,
  method: 'GET' | 'POST',
  payload?: Record<string, unknown>,
  authorization?: string
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(body));
    }
    if (authorization) headers.authorization = authorization;

    const req = httpRequest(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { raw += chunk; });
        res.on('end', () => {
          let parsed: any = raw;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { /* preserve non-JSON response */ }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export class VercelApiHttpTestSuite {
  public static async runAll(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: Array<{ id: string; title: string; passed: boolean; error?: string }>;
  }> {
    // The suite exercises the same Express router over real HTTP sockets.
    process.env.VITEST = 'true';
    process.env.HISABATI_ALLOW_UNINITIALIZED_ADMIN ||= 'true';

    const { createApp } = await import('../../server');
    const server = createServer(createApp());
    const results: Array<{ id: string; title: string; passed: boolean; error?: string }> = [];

    const run = async (id: string, title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, title, passed: true });
      } catch (error: any) {
        results.push({ id, title, passed: false, error: error?.message || String(error) });
      }
    };

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    const port = address.port;

    try {
      await run('VERCEL-HTTP-01', 'GET /api/health responds through the Express HTTP server', async () => {
        const response = await sendJson(port, '/api/health', 'GET');
        if (response.status !== 200 || response.body?.status !== 'ok') {
          throw new Error(`Expected 200 {status: ok}; received ${response.status} ${JSON.stringify(response.body)}`);
        }
      });

      await run('VERCEL-HTTP-02', 'GET /api/tenant/public-key returns a browser-verifiable P-256 JWK', async () => {
        const response = await sendJson(port, '/api/tenant/public-key', 'GET');
        const jwk = response.body?.publicKeyJwk;
        if (
          response.status !== 200 ||
          response.body?.success !== true ||
          jwk?.kty !== 'EC' ||
          jwk?.crv !== 'P-256' ||
          typeof jwk?.x !== 'string' ||
          typeof jwk?.y !== 'string'
        ) {
          throw new Error(`Invalid public-key response: ${response.status} ${JSON.stringify(response.body)}`);
        }
      });

      await run('VERCEL-HTTP-03', 'POST /api/tenant/verify-membership fails closed when token is missing', async () => {
        const response = await sendJson(port, '/api/tenant/verify-membership', 'POST', {
          organizationId: 'org_http_missing_token',
        });
        if (response.status !== 400 || response.body?.code !== 'TOKEN_MISSING_OR_INVALID') {
          throw new Error(`Expected 400 TOKEN_MISSING_OR_INVALID; received ${response.status} ${JSON.stringify(response.body)}`);
        }
      });

      await run('VERCEL-HTTP-04', 'POST /api/tenant/verify-membership verifies token and ignores spoofed client claims', async () => {
        ServerMembershipVerifier.clearTestData();
        const organizationId = `org_http_${Date.now()}`;
        const verifiedUid = 'vercel_http_verified_user';
        const now = new Date().toISOString();
        ServerMembershipVerifier.registerTestOrganization({
          id: organizationId,
          name: 'HTTP Integration Organization',
          ownerId: 'real_owner',
          status: 'active',
          settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
          createdAt: now,
          updatedAt: now,
        });
        ServerMembershipVerifier.registerTestMembership({
          organizationId,
          userId: verifiedUid,
          role: 'viewer',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const token = FirebaseTokenVerifier.createTestToken({ uid: verifiedUid });
        const response = await sendJson(
          port,
          '/api/tenant/verify-membership',
          'POST',
          {
            organizationId,
            clientClaimedUid: 'spoofed_uid',
            clientClaimedRole: 'owner',
          },
          `Bearer ${token}`
        );
        if (
          response.status !== 200 ||
          response.body?.success !== true ||
          response.body?.verifiedUid !== verifiedUid ||
          response.body?.membership?.role !== 'viewer'
        ) {
          throw new Error(`Membership verification failed or trusted spoofed claims: ${response.status} ${JSON.stringify(response.body)}`);
        }
      });

      await run('VERCEL-HTTP-05', 'POST /api/tenant/issue-lease issues a signed lease after verified membership', async () => {
        const organizationId = `org_http_lease_${Date.now()}`;
        const verifiedUid = 'vercel_http_lease_user';
        const now = new Date().toISOString();
        ServerMembershipVerifier.registerTestOrganization({
          id: organizationId,
          name: 'HTTP Lease Organization',
          ownerId: 'real_owner',
          status: 'active',
          settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
          createdAt: now,
          updatedAt: now,
        });
        ServerMembershipVerifier.registerTestMembership({
          organizationId,
          userId: verifiedUid,
          role: 'accountant',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const token = FirebaseTokenVerifier.createTestToken({ uid: verifiedUid });
        const response = await sendJson(
          port,
          '/api/tenant/issue-lease',
          'POST',
          { organizationId, idToken: token },
          `Bearer ${token}`
        );
        if (
          response.status !== 200 ||
          response.body?.success !== true ||
          response.body?.lease?.organizationId !== organizationId ||
          response.body?.lease?.verifiedUid !== verifiedUid ||
          typeof response.body?.lease?.integrityHash !== 'string'
        ) {
          throw new Error(`Lease issuance failed: ${response.status} ${JSON.stringify(response.body)}`);
        }
      });
    } finally {
      ServerMembershipVerifier.clearTestData();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }

    return {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results,
    };
  }
}
