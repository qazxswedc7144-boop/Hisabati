import type {
  InvoiceLine,
  InvoiceLineInput,
  InvoiceTotals,
  InvoiceCalculationOptions,
} from '../../../shared/types/invoice.types';
import type { Money } from '../../../shared/types/money.types';

/**
 * Invoice Calculator Service
 *
 * PHASE F — Invoice Core Part 1
 *
 * Responsibilities:
 * - Calculate invoice line amounts
 * - Calculate invoice totals
 * - Preserve Money/currency semantics
 *
 * Non-responsibilities:
 * - No database access
 * - No account balance changes
 * - No transaction posting
 * - No invoice persistence
 *
 * Financial rule:
 * All monetary results are represented in minor units.
 */

const DEFAULT_QUANTITY_SCALE = 3;

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer.`);
  }
}

function assertMoney(money: Money, field: string): void {
  assertSafeInteger(money.amountMinor, `${field}.amountMinor`);
}

function assertSameCurrency(
  first: Money,
  second: Money,
  field: string,
): void {
  if (first.currency !== second.currency) {
    throw new Error(
      `Currency mismatch in ${field}: ${first.currency} !== ${second.currency}`,
    );
  }
}

/**
 * Converts a decimal quantity into an integer representation
 * according to the configured quantity scale.
 *
 * Example:
 * quantityScale = 3
 * 1.250 -> 1250
 */
function toScaledQuantity(
  quantity: number,
  quantityScale: number,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity must be a finite non-negative number.');
  }

  const multiplier = 10 ** quantityScale;
  const scaled = Math.round(quantity * multiplier);

  if (!Number.isSafeInteger(scaled)) {
    throw new Error('Quantity exceeds safe calculation limits.');
  }

  return scaled;
}

/**
 * Calculates the monetary amount for one invoice line.
 *
 * unitPrice is stored in minor units.
 * quantity may contain decimal values.
 */
export function calculateLineGrossAmount(
  line: InvoiceLineInput,
  options: InvoiceCalculationOptions = {},
): Money {
  assertMoney(line.unitPrice, 'unitPrice');

  const quantityScale =
    options.quantityScale ?? DEFAULT_QUANTITY_SCALE;

  if (
    !Number.isInteger(quantityScale) ||
    quantityScale < 0 ||
    quantityScale > 6
  ) {
    throw new Error('quantityScale must be an integer between 0 and 6.');
  }

  const scaledQuantity = toScaledQuantity(
    line.quantity,
    quantityScale,
  );

  const multiplier = 10 ** quantityScale;

  const amountMinor = Math.round(
    (line.unitPrice.amountMinor * scaledQuantity) / multiplier,
  );

  assertSafeInteger(amountMinor, 'grossAmount.amountMinor');

  return {
    amountMinor,
    currency: line.unitPrice.currency,
  };
}

/**
 * Calculates one complete invoice line.
 *
 * Formula:
 * gross = quantity × unit price
 * net   = gross - discount + tax
 */
export function calculateInvoiceLine(
  line: InvoiceLineInput,
  index = 0,
  options: InvoiceCalculationOptions = {},
): InvoiceLine {
  if (!line.itemName?.trim()) {
    throw new Error(`Invoice line ${index + 1}: itemName is required.`);
  }

  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error(
      `Invoice line ${index + 1}: quantity must be greater than zero.`,
    );
  }

  assertMoney(line.unitPrice, `line ${index + 1}.unitPrice`);

  const grossAmount = calculateLineGrossAmount(line, options);

  const discount: Money = line.discount ?? {
    amountMinor: 0,
    currency: line.unitPrice.currency,
  };

  const tax: Money = line.tax ?? {
    amountMinor: 0,
    currency: line.unitPrice.currency,
  };

  assertMoney(discount, `line ${index + 1}.discount`);
  assertMoney(tax, `line ${index + 1}.tax`);

  assertSameCurrency(
    line.unitPrice,
    discount,
    `line ${index + 1}.discount`,
  );

  assertSameCurrency(
    line.unitPrice,
    tax,
    `line ${index + 1}.tax`,
  );

  if (discount.amountMinor < 0) {
    throw new Error(
      `Invoice line ${index + 1}: discount cannot be negative.`,
    );
  }

  if (tax.amountMinor < 0) {
    throw new Error(
      `Invoice line ${index + 1}: tax cannot be negative.`,
    );
  }

  if (discount.amountMinor > grossAmount.amountMinor) {
    throw new Error(
      `Invoice line ${index + 1}: discount cannot exceed gross amount.`,
    );
  }

  const netAmountMinor =
    grossAmount.amountMinor -
    discount.amountMinor +
    tax.amountMinor;

  assertSafeInteger(netAmountMinor, 'netAmount.amountMinor');

  if (netAmountMinor < 0) {
    throw new Error(
      `Invoice line ${index + 1}: net amount cannot be negative.`,
    );
  }

  const id =
    line.id ??
    `line-${index + 1}`;

  return {
    id,
    itemId: line.itemId,
    itemName: line.itemName.trim(),
    quantity: line.quantity,
    unitPrice: {
      amountMinor: line.unitPrice.amountMinor,
      currency: line.unitPrice.currency,
    },
    discount,
    tax,
    grossAmount,
    netAmount: {
      amountMinor: netAmountMinor,
      currency: line.unitPrice.currency,
    },
    batchNumber: line.batchNumber,
    expiryDate: line.expiryDate,
    note: line.note,
  };
}

/**
 * Calculates invoice totals from already-calculated lines.
 */
export function calculateInvoiceTotals(
  lines: InvoiceLine[],
  currency: Money['currency'],
): InvoiceTotals {
  let grossAmountMinor = 0;
  let discountMinor = 0;
  let taxableAmountMinor = 0;
  let taxMinor = 0;
  let grandTotalMinor = 0;

  for (const line of lines) {
    assertMoney(line.grossAmount, 'line.grossAmount');
    assertMoney(line.discount, 'line.discount');
    assertMoney(line.tax, 'line.tax');
    assertMoney(line.netAmount, 'line.netAmount');

    if (line.grossAmount.currency !== currency) {
      throw new Error('Invoice line gross currency mismatch.');
    }

    if (line.discount.currency !== currency) {
      throw new Error('Invoice line discount currency mismatch.');
    }

    if (line.tax.currency !== currency) {
      throw new Error('Invoice line tax currency mismatch.');
    }

    if (line.netAmount.currency !== currency) {
      throw new Error('Invoice line net currency mismatch.');
    }

    grossAmountMinor += line.grossAmount.amountMinor;
    discountMinor += line.discount.amountMinor;

    /*
     * Taxable amount is the amount after discount
     * and before tax.
     */
    taxableAmountMinor +=
      line.grossAmount.amountMinor -
      line.discount.amountMinor;

    taxMinor += line.tax.amountMinor;
    grandTotalMinor += line.netAmount.amountMinor;
  }

  assertSafeInteger(grossAmountMinor, 'grossAmountMinor');
  assertSafeInteger(discountMinor, 'discountMinor');
  assertSafeInteger(taxableAmountMinor, 'taxableAmountMinor');
  assertSafeInteger(taxMinor, 'taxMinor');
  assertSafeInteger(grandTotalMinor, 'grandTotalMinor');

  return {
    grossAmount: {
      amountMinor: grossAmountMinor,
      currency,
    },
    discount: {
      amountMinor: discountMinor,
      currency,
    },
    taxableAmount: {
      amountMinor: taxableAmountMinor,
      currency,
    },
    tax: {
      amountMinor: taxMinor,
      currency,
    },
    grandTotal: {
      amountMinor: grandTotalMinor,
      currency,
    },
  };
}

/**
 * Calculates all invoice lines and the final invoice totals.
 */
export function calculateInvoice(
  lines: InvoiceLineInput[],
  currency: Money['currency'],
  options: InvoiceCalculationOptions = {},
): {
  lines: InvoiceLine[];
  totals: InvoiceTotals;
} {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Invoice must contain at least one line.');
  }

  const calculatedLines = lines.map((line, index) =>
    calculateInvoiceLine(line, index, options),
  );

  const totals = calculateInvoiceTotals(
    calculatedLines,
    currency,
  );

  return {
    lines: calculatedLines,
    totals,
  };
}
