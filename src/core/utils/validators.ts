export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateAccountForm(data: { name?: string; phone?: string }): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.name || !data.name.trim()) {
    errors.name = 'اسم الحساب مطلوب ولا يمكن أن يكون فارغاً';
  } else if (data.name.trim().length < 2) {
    errors.name = 'اسم الحساب يجب أن يتكون من حرفين على الأقل';
  }

  if (data.phone && data.phone.trim()) {
    const phoneClean = data.phone.trim();
    if (!/^[0-9+-\s()]{6,20}$/.test(phoneClean)) {
      errors.phone = 'رقم الهاتف غير صحيح';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateTransactionForm(data: {
  accountId?: string;
  amount?: number;
  date?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.accountId || !data.accountId.trim()) {
    errors.accountId = 'يرجى اختيار الحساب المراد تسجيل العملية له';
  }

  if (data.amount === undefined || data.amount === null || isNaN(data.amount) || data.amount <= 0) {
    errors.amount = 'يرجى إدخال مبلغ صحيح أكبر من الصفر';
  }

  if (!data.date || !data.date.trim()) {
    errors.date = 'يرجى اختيار تاريخ العملية';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
