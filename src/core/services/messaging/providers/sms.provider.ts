import { AppMessage, MessageStatus } from '@/shared/types';

export interface SmsSendResult {
  success: boolean;
  status: MessageStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SmsProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  send(message: AppMessage): Promise<SmsSendResult>;
}

/**
 * Default local SMS Provider when no external SMS gateway is configured.
 * Strictly avoids fake success reporting.
 */
export class DefaultSmsProvider implements SmsProvider {
  id = 'unconfigured_sms_gateway';
  name = 'بوابة SMS غير مهيأة';

  isConfigured(): boolean {
    return false;
  }

  async send(message: AppMessage): Promise<SmsSendResult> {
    // Return explicit NOT_CONFIGURED state
    return {
      success: false,
      status: 'not_configured',
      errorCode: 'SMS_PROVIDER_NOT_CONFIGURED',
      errorMessage: 'لا يوجد مزود خدمة رسائل SMS مُهيأ حالياً في النظام. يلزم ربط بوابة رسائل معتمدة.',
    };
  }
}

export const defaultSmsProvider = new DefaultSmsProvider();
