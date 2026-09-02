import { AppMessage, MessageStatus } from '@/shared/types';

export interface WhatsAppSendResult {
  success: boolean;
  status: MessageStatus;
  url?: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WhatsAppProvider {
  id: string;
  name: string;
  isAutomatedConfigured(): boolean;
  isAutomatedAvailable(): boolean;
  cleanPhoneNumber(phone: string): string;
  generateWhatsAppUrl(phone: string, text: string): string;
  prepareUserInitiatedSend(message: AppMessage): WhatsAppSendResult;
  send(message: AppMessage): Promise<WhatsAppSendResult>;
  sendAutomated(message: AppMessage): Promise<WhatsAppSendResult>;
}

export class DefaultWhatsAppProvider implements WhatsAppProvider {
  id = 'direct_whatsapp_client';
  name = 'واتساب المباشر (توجيه المستخدم)';

  isAutomatedConfigured(): boolean {
    return false;
  }

  isAutomatedAvailable(): boolean {
    return false;
  }

  async send(message: AppMessage): Promise<WhatsAppSendResult> {
    return this.prepareUserInitiatedSend(message);
  }

  /**
   * Clean and normalize phone numbers for WhatsApp wa.me links
   * Supports Yemen (967), Saudi (966), Egypt (20), UAE (971), and general international formats
   */
  cleanPhoneNumber(phone: string): string {
    if (!phone) return '';
    
    // Remove all non-digits except a leading plus
    let clean = phone.replace(/[^\d+]/g, '');

    if (clean.startsWith('+')) {
      clean = clean.substring(1);
    } else if (clean.startsWith('00')) {
      clean = clean.substring(2);
    } else if (clean.startsWith('0') && clean.length === 10) {
      // Local 10-digit number starting with 0 (e.g., 05xxxxxxxx in KSA or 01xxxxxxxx in Egypt)
      // Default to standard Yemen code 967 if 9 digits or standard prefix
      clean = '967' + clean.substring(1);
    } else if (clean.length === 9 && (clean.startsWith('7') || clean.startsWith('1'))) {
      // Yemen mobile format (77xxxxxxx, 73xxxxxxx, 71xxxxxxx, 70xxxxxxx)
      clean = '967' + clean;
    }

    return clean;
  }

  /**
   * Generate standard WhatsApp URL
   */
  generateWhatsAppUrl(phone: string, text: string): string {
    const cleanedPhone = this.cleanPhoneNumber(phone);
    const encodedText = encodeURIComponent(text);
    if (cleanedPhone) {
      return `https://wa.me/${cleanedPhone}?text=${encodedText}`;
    }
    return `https://wa.me/?text=${encodedText}`;
  }

  /**
   * User-initiated WhatsApp preparation
   * Returns READY_TO_SEND with the direct wa.me link
   */
  prepareUserInitiatedSend(message: AppMessage): WhatsAppSendResult {
    const url = this.generateWhatsAppUrl(message.recipient, message.body);
    return {
      success: true,
      status: 'ready_to_send',
      url,
    };
  }

  /**
   * Automated background WhatsApp API (requires Meta WhatsApp Business Cloud API)
   * Strictly returns NOT_CONFIGURED when no backend provider exists
   */
  async sendAutomated(message: AppMessage): Promise<WhatsAppSendResult> {
    return {
      success: false,
      status: 'not_configured',
      errorCode: 'WHATSAPP_AUTOMATION_NOT_CONFIGURED',
      errorMessage:
        'الإرسال الآلي المباشر يتطلب تهيئة واجهة WhatsApp Business Cloud API عبر خادم معتمد. يرجى استخدام الإرسال المباشر عبر التطبيق.',
    };
  }
}

export const defaultWhatsAppProvider = new DefaultWhatsAppProvider();
