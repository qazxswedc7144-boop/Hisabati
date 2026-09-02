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

export async function calculateBackupPayloadHash(payloadWithoutHash: {
  metadata: {
    schemaVersion: number;
    appVersion: string;
    backupId: string;
    deviceId: string;
    createdAt: string;
    accountCount: number;
    transactionCount: number;
    totalDebitSum: number;
    totalCreditSum: number;
  };
  accounts: any[];
  transactions: any[];
  settings: any[];
}): Promise<string> {
  // Deterministic JSON string
  const contentToHash = JSON.stringify({
    schemaVersion: payloadWithoutHash.metadata.schemaVersion,
    appVersion: payloadWithoutHash.metadata.appVersion,
    backupId: payloadWithoutHash.metadata.backupId,
    deviceId: payloadWithoutHash.metadata.deviceId,
    createdAt: payloadWithoutHash.metadata.createdAt,
    accountsLength: payloadWithoutHash.accounts.length,
    transactionsLength: payloadWithoutHash.transactions.length,
    totalDebitSum: payloadWithoutHash.metadata.totalDebitSum,
    totalCreditSum: payloadWithoutHash.metadata.totalCreditSum,
    accounts: payloadWithoutHash.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currentBalance: a.currentBalance,
      updatedAt: a.updatedAt,
    })),
    transactions: payloadWithoutHash.transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      amount: t.amount,
      type: t.type,
      date: t.date,
      operationId: t.operationId,
      updatedAt: t.updatedAt,
    })),
  });

  return await calculateSHA256(contentToHash);
}
