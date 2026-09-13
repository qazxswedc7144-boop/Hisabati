/**
 * Cryptographic checksum & SHA-256 integrity hash generator using native Web Crypto API.
 */

export async function calculateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Builds deterministic JSON string for SHA-256 hashing.
 */
function buildCanonicalContent(payload: {
  schemaVersion: number;
  appVersion: string;
  backupId: string;
  deviceId: string;
  createdAt: string;
  accountsLength: number;
  transactionsLength: number;
  totalDebitSum: number;
  totalCreditSum: number;
  accounts: any[];
  transactions: any[];
}): string {
  return JSON.stringify({
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    backupId: payload.backupId,
    deviceId: payload.deviceId,
    createdAt: payload.createdAt,
    accountsLength: payload.accountsLength,
    transactionsLength: payload.transactionsLength,
    totalDebitSum: payload.totalDebitSum,
    totalCreditSum: payload.totalCreditSum,
    accounts: (payload.accounts || []).map((a) => ({
      id: a.id,
      name: a.name,
      currentBalance: a.currentBalance,
      updatedAt: a.updatedAt,
    })),
    transactions: (payload.transactions || []).map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: t.amount,
      type: t.type,
      date: t.date,
      operationId: t.operationId,
      updatedAt: t.updatedAt,
    })),
  });
}

/**
 * Calculates current V3 backup payload SHA-256 hash.
 */
export async function calculateBackupPayloadHash(payloadWithoutHash: {
  metadata: {
    backupSchemaVersion?: number;
    databaseSchemaVersion?: number;
    financialFormatVersion?: number;
    schemaVersion?: number;
    appVersion: string;
    backupId: string;
    deviceId: string;
    deviceName?: string;
    createdAt: string;
    accountCount: number;
    transactionCount: number;
    totalDebitSum: number;
    totalCreditSum: number;
    isEncrypted?: boolean;
  };
  accounts: any[];
  transactions: any[];
  settings?: any[];
}): Promise<string> {
  const schemaVer =
    payloadWithoutHash.metadata.schemaVersion ??
    payloadWithoutHash.metadata.backupSchemaVersion ??
    3;

  const contentToHash = buildCanonicalContent({
    schemaVersion: schemaVer,
    appVersion: payloadWithoutHash.metadata.appVersion,
    backupId: payloadWithoutHash.metadata.backupId,
    deviceId: payloadWithoutHash.metadata.deviceId,
    createdAt: payloadWithoutHash.metadata.createdAt,
    accountsLength: payloadWithoutHash.accounts.length,
    transactionsLength: payloadWithoutHash.transactions.length,
    totalDebitSum: payloadWithoutHash.metadata.totalDebitSum,
    totalCreditSum: payloadWithoutHash.metadata.totalCreditSum,
    accounts: payloadWithoutHash.accounts,
    transactions: payloadWithoutHash.transactions,
  });

  return await calculateSHA256(contentToHash);
}

/**
 * Calculates legacy V1 / V2 backup payload hash using the legacy schemaVersion (1 or 2).
 */
export async function calculateLegacyBackupPayloadHash(
  payloadWithoutHash: {
    metadata: any;
    accounts: any[];
    transactions: any[];
    settings?: any[];
  },
  legacyVersion: number = 1
): Promise<string> {
  const contentToHash = buildCanonicalContent({
    schemaVersion: legacyVersion,
    appVersion: payloadWithoutHash.metadata.appVersion,
    backupId: payloadWithoutHash.metadata.backupId,
    deviceId: payloadWithoutHash.metadata.deviceId,
    createdAt: payloadWithoutHash.metadata.createdAt,
    accountsLength: (payloadWithoutHash.accounts || []).length,
    transactionsLength: (payloadWithoutHash.transactions || []).length,
    totalDebitSum: payloadWithoutHash.metadata.totalDebitSum,
    totalCreditSum: payloadWithoutHash.metadata.totalCreditSum,
    accounts: payloadWithoutHash.accounts,
    transactions: payloadWithoutHash.transactions,
  });

  return await calculateSHA256(contentToHash);
}

/**
 * Verifies if payload matches current V3 hash format.
 */
export async function verifyCurrentBackupHash(payload: any): Promise<boolean> {
  if (!payload?.metadata?.integrityHash) return false;
  const expected = await calculateBackupPayloadHash({
    metadata: payload.metadata,
    accounts: payload.accounts || [],
    transactions: payload.transactions || [],
    settings: payload.settings || [],
  });
  return expected === payload.metadata.integrityHash;
}

/**
 * Verifies if payload matches legacy V1 or V2 hash format.
 */
export async function verifyLegacyBackupHash(payload: any, legacyVersion: number = 1): Promise<boolean> {
  if (!payload?.metadata?.integrityHash) return false;
  const expected = await calculateLegacyBackupPayloadHash(
    {
      metadata: payload.metadata,
      accounts: payload.accounts || [],
      transactions: payload.transactions || [],
      settings: payload.settings || [],
    },
    legacyVersion
  );
  return expected === payload.metadata.integrityHash;
}

/**
 * Dual verification helper: checks current V3 or legacy V1/V2 hash.
 */
export async function verifyBackupIntegrityHash(payload: any, version?: number): Promise<boolean> {
  if (!payload?.metadata?.integrityHash) return true;

  const ver = version ?? payload.metadata.backupSchemaVersion ?? payload.metadata.schemaVersion ?? 1;

  // 1. If explicit legacy version (1 or 2), verify legacy format
  if (ver === 1 || ver === 2) {
    const isLegacyValid = await verifyLegacyBackupHash(payload, ver);
    if (isLegacyValid) return true;
  }

  // 2. Try current V3 verification
  const isCurrentValid = await verifyCurrentBackupHash(payload);
  if (isCurrentValid) return true;

  // 3. If payload was migrated and carries originalSchemaVersion
  if (payload.metadata.originalSchemaVersion !== undefined) {
    const isOriginalLegacyValid = await verifyLegacyBackupHash(payload, payload.metadata.originalSchemaVersion);
    if (isOriginalLegacyValid) return true;
  }

  return false;
}

/**
 * SEC-02: AES-GCM 256 Backup Encryption / Decryption Utilities using Web Crypto API.
 */
const ENCRYPTION_KEY_STORAGE = 'hisabati_backup_master_key_v1';

async function getOrCreateMasterEncryptionKey(): Promise<CryptoKey> {
  let rawKeyHex: string | null = null;
  if (typeof localStorage !== 'undefined') {
    rawKeyHex = localStorage.getItem(ENCRYPTION_KEY_STORAGE);
  }

  let keyBytes: Uint8Array;
  if (rawKeyHex) {
    const matches = rawKeyHex.match(/.{1,2}/g);
    keyBytes = new Uint8Array(matches ? matches.map((b) => parseInt(b, 16)) : []);
  } else {
    keyBytes = crypto.getRandomValues(new Uint8Array(32)); // 256-bit key
    if (typeof localStorage !== 'undefined') {
      const hex = Array.from(keyBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(ENCRYPTION_KEY_STORAGE, hex);
    }
  }

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackupPayload(payload: any): Promise<{ cipherText: string; iv: string }> {
  const key = await getOrCreateMasterEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM
  const encoder = new TextEncoder();
  const plainTextBuffer = encoder.encode(JSON.stringify(payload));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainTextBuffer
  );

  const cipherArray = Array.from(new Uint8Array(cipherBuffer));
  const cipherText = btoa(String.fromCharCode(...cipherArray));
  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { cipherText, iv: ivHex };
}

export async function decryptBackupPayload(cipherText: string, ivHex: string): Promise<any> {
  const key = await getOrCreateMasterEncryptionKey();
  const matches = ivHex.match(/.{1,2}/g);
  const iv = new Uint8Array(matches ? matches.map((b) => parseInt(b, 16)) : []);

  const binaryString = atob(cipherText);
  const len = binaryString.length;
  const cipherBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    cipherBytes[i] = binaryString.charCodeAt(i);
  }

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(plainBuffer);
  return JSON.parse(jsonString);
}


