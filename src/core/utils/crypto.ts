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
 * SEC-02: AES-GCM 256 Backup Encryption / Decryption Utilities & Secure Key Lifecycle using Web Crypto API.
 */
const LEGACY_KEY_STORAGE = 'hisabati_backup_master_key_v1';
const PROTECTED_KEY_STORAGE = 'hisabati_backup_protected_key_v2';
const DEVICE_SALT_STORAGE = 'hisabati_device_salt_v1';

// Polyfill localStorage for Node.js test environment if not present
if (typeof localStorage === 'undefined' && typeof global !== 'undefined') {
  const store = new Map<string, string>();
  (global as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; }
  };
}

async function getLocalWrappingKey(): Promise<CryptoKey> {
  let saltHex: string | null = null;
  if (typeof localStorage !== 'undefined') {
    saltHex = localStorage.getItem(DEVICE_SALT_STORAGE);
  }
  let salt: Uint8Array;
  if (saltHex) {
    const matches = saltHex.match(/.{1,2}/g);
    salt = new Uint8Array(matches ? matches.map((b) => parseInt(b, 16)) : []);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    if (typeof localStorage !== 'undefined') {
      const hex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_SALT_STORAGE, hex);
    }
  }

  const enc = new TextEncoder();
  const baseKeyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('hisabati_device_local_wrapping_secret_2026'),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportMasterEncryptionKey(): Promise<string> {
  const key = await getOrCreateMasterEncryptionKey();
  const raw = await crypto.subtle.exportKey('raw', key);
  const bytes = new Uint8Array(raw);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importMasterEncryptionKey(keyHex: string): Promise<void> {
  const matches = keyHex.match(/.{1,2}/g);
  if (!matches || matches.length !== 32) {
    throw new Error('مفتاح التشفير غير صالح (يجب أن يكون 32 بايت بصيغة Hex)');
  }
  const keyBytes = new Uint8Array(matches.map((b) => parseInt(b, 16)));
  
  const wrappingKey = await getLocalWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    keyBytes
  );

  const cipherArray = Array.from(new Uint8Array(cipherBuffer));
  const cipherText = btoa(String.fromCharCode(...cipherArray));
  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      PROTECTED_KEY_STORAGE,
      JSON.stringify({ cipherText, iv: ivHex })
    );
    localStorage.removeItem(LEGACY_KEY_STORAGE);
  }
}

export async function deleteMasterEncryptionKey(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(PROTECTED_KEY_STORAGE);
    localStorage.removeItem(LEGACY_KEY_STORAGE);
    localStorage.removeItem(DEVICE_SALT_STORAGE);
  }
}

async function getOrCreateMasterEncryptionKey(): Promise<CryptoKey> {
  let keyBytes: Uint8Array | null = null;

  if (typeof localStorage !== 'undefined') {
    // 1. Check legacy unencrypted key first (for automatic migration)
    const legacyHex = localStorage.getItem(LEGACY_KEY_STORAGE);
    if (legacyHex) {
      const matches = legacyHex.match(/.{1,2}/g);
      keyBytes = new Uint8Array(matches ? matches.map((b) => parseInt(b, 16)) : []);
      await importMasterEncryptionKey(legacyHex);
    } else {
      // 2. Check protected storage
      const protectedStr = localStorage.getItem(PROTECTED_KEY_STORAGE);
      if (protectedStr) {
        try {
          const { cipherText, iv: ivHex } = JSON.parse(protectedStr);
          const wrappingKey = await getLocalWrappingKey();
          const matches = ivHex.match(/.{1,2}/g);
          const iv = new Uint8Array(matches ? matches.map((b) => parseInt(b, 16)) : []);

          const binaryString = atob(cipherText);
          const cipherBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            cipherBytes[i] = binaryString.charCodeAt(i);
          }

          const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            wrappingKey,
            cipherBytes
          );
          keyBytes = new Uint8Array(plainBuffer);
        } catch (err) {
          console.error('Failed to decrypt protected master key, regenerating:', err);
        }
      }
    }
  }

  if (!keyBytes || keyBytes.length !== 32) {
    keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const tempHex = Array.from(keyBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    await importMasterEncryptionKey(tempHex);
  }

  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
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


