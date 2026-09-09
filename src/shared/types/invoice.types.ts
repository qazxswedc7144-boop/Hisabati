/**
 * Invoice Domain Model
 *
 * PHASE F — Invoice Core — Part 1
 *
 * Scope:
 * - Domain types only
 * - No database dependency
 * - No UI dependency
 * - No transaction engine dependency
 * - No financial posting
 *
 * Financial safety:
 * - Reuses the canonical Money / MinorUnit model.
 * - Never owns or mutates account balances.
 */

import type { CurrencyCode } from './common.types';
import type {
  InvoiceNumberingFormat,
} from './settings.types';
import type { Money } from './money.types';

export const INVOICE_DOMAIN_VERSION = 1 as const;

/**
 * Distinguishes the business direction of the invoice.
 */
export type InvoiceType =
  | 'sales'
  | 'purchase';

/**
 * Invoice lifecycle.
 *
 * draft:
 *   Editable and not financially posted.
 *
 * posted:
 *   Finalized. Financial posting will be handled later
 *   by the dedicated posting layer.
 *
 * cancelled:
 *   Cancelled without deleting historical data.
 */
export type InvoiceStatus =
  | 'draft'
  | 'posted'
  | 'cancelled';

/**
 * Customer for sales invoices
 * Supplier for purchase invoices.
 */
export interface InvoiceParty {
  id?: string;
  name: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
}

/**
 * Input model for creating an invoice line.
 *
 * This type contains user/domain input only.
 * Calculated values are intentionally not stored here.
 */
export interface InvoiceLineInput {
  id?: string;

  /**
   * Future reference to a product/item.
   *
   * Invoice Core does not depend on an Inventory module yet.
   */
  itemId?: string;

  /**
   * Snapshot name shown on the invoice.
   */
  itemName: string;

  /**
   * Quantity may be fractional.
   *
   * Example:
   * 1
   * 2
   * 0.5
   */
  quantity: number;

  /**
   * Canonical monetary value.
   */
  unitPrice: Money;

  /**
   * Optional line discount.
   *
   * Must use the same currency as unitPrice.
   */
  discount?: Money;

  /**
   * Optional line tax.
   *
   * Must use the same currency as unitPrice.
   */
  tax?: Money;

  /**
   * Optional inventory metadata.
   *
   * These fields are domain-compatible but do not
   * require an Inventory module to exist yet.
   */
  batchNumber?: string;

  expiryDate?: string;

  note?: string;
}

/**
 * A fully calculated invoice line.
 *
 * This is the result of the Invoice Calculator.
 */
export interface InvoiceLine {
  id: string;

  itemId?: string;

  itemName: string;

  quantity: number;

  unitPrice: Money;

  discount: Money;

  tax: Money;

  /**
   * Gross amount before discount.
   */
  grossAmount: Money;

  /**
   * Amount after discount and before tax.
   */
  netAmount: Money;

  batchNumber?: string;

  expiryDate?: string;

  note?: string;
}

/**
 * Calculated invoice totals.
 */
export interface InvoiceTotals {
  grossAmount: Money;

  discount: Money;

  taxableAmount: Money;

  tax: Money;

  grandTotal: Money;
}

/**
 * Invoice creation input.
 */
export interface CreateInvoiceInput {
  type: InvoiceType;

  invoiceNumber: string;

  date: string;

  dueDate?: string;

  party?: InvoiceParty;

  currency: CurrencyCode;

  lines: InvoiceLineInput[];

  notes?: string;
}

/**
 * Fully formed Invoice domain object.
 */
export interface Invoice {
  id: string;

  type: InvoiceType;

  status: InvoiceStatus;

  invoiceNumber: string;

  date: string;

  dueDate?: string;

  party?: InvoiceParty;

  currency: CurrencyCode;

  lines: InvoiceLine[];

  totals: InvoiceTotals;

  notes?: string;

  /**
   * Links the invoice to financial transactions only
   * after the future posting layer creates them.
   *
   * Invoice Core itself does not create transactions.
   */
  financialTransactionIds?: string[];

  createdAt: string;

  updatedAt: string;

  domainVersion: typeof INVOICE_DOMAIN_VERSION;
}

/**
 * Calculator options.
 */
export interface InvoiceCalculationOptions {
  /**
   * Maximum supported decimal places for quantity.
   *
   * Default is implementation-defined by Calculator.
   */
  quantityScale?: number;
}

/**
 * Invoice validation codes.
 *
 * These codes are domain-level and independent of UI.
 */
export type InvoiceValidationCode =
  | 'INVALID_TYPE'
  | 'INVALID_STATUS'
  | 'INVALID_NUMBER'
  | 'INVALID_DATE'
  | 'INVALID_DUE_DATE'
  | 'INVALID_CURRENCY'
  | 'NO_LINES'
  | 'INVALID_LINE'
  | 'INVALID_ITEM_NAME'
  | 'INVALID_QUANTITY'
  | 'INVALID_UNIT_PRICE'
  | 'INVALID_DISCOUNT'
  | 'INVALID_TAX'
  | 'INVALID_EXPIRY_DATE'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_TOTAL';

/**
 * Domain validation error.
 */
export interface InvoiceValidationError {
  code: InvoiceValidationCode;

  message: string;

  field?: string;

  lineId?: string;
}

/**
 * Validation result.
 */
export interface InvoiceValidationResult {
  valid: boolean;

  errors: InvoiceValidationError[];
}

/**
 * Invoice numbering preview.
 *
 * Actual number allocation will be implemented later
 * in InvoiceNumberService.
 */
export interface InvoiceNumberPreview {
  format: InvoiceNumberingFormat;

  prefix: string;

  sequence: number;

  year?: number;

  formatted: string;
}
