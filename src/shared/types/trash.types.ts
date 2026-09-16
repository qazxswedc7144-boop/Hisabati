import { Account } from './account.types';
import { Transaction } from './transaction.types';

export type TrashEntityType = 'account';

export interface TrashItem {
  id: string; // The original entity ID
  entityType: TrashEntityType;
  data: {
    account: Account;
    transactions: Transaction[];
  };
  deletedAt: string;
  expiresAt: string; // deletedAt + 30-60 days
}
