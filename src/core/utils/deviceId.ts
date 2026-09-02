/**
 * Device Identification Utility for Multi-Device Operations.
 * Generates and preserves a persistent, unique device identifier per client installation.
 */

const DEVICE_ID_STORAGE_KEY = 'hisabati_device_id';
const DEVICE_NAME_STORAGE_KEY = 'hisabati_device_name';

let memoryDeviceId: string | null = null;
let memoryDeviceName: string | null = null;

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    if (!memoryDeviceId) {
      memoryDeviceId = 'dev_local_' + Date.now().toString(36);
    }
    return memoryDeviceId;
  }
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return memoryDeviceId || 'dev_fallback';
  }
}

export function getDeviceName(): string {
  if (typeof localStorage === 'undefined') {
    return memoryDeviceName || 'جهاز متصفح';
  }
  try {
    let deviceName = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
    if (!deviceName) {
      // Detect basic device archetype for friendly identification
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      let type = 'جهاز غير معروف';
      if (/android/i.test(ua)) type = 'هاتف أندرويد';
      else if (/iphone|ipad|ipod/i.test(ua)) type = 'آيفون / آيباد';
      else if (/windows/i.test(ua)) type = 'كمبيوتر ويندوز';
      else if (/macintosh|mac os x/i.test(ua)) type = 'كمبيوتر ماك';
      else if (/linux/i.test(ua)) type = 'كمبيوتر لينكس';

      deviceName = `${type} (${getDeviceId().substring(4, 9)})`;
      localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
    }
    return deviceName;
  } catch {
    return 'جهاز متصفح';
  }
}

export function setDeviceName(name: string): void {
  if (name.trim()) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DEVICE_NAME_STORAGE_KEY, name.trim());
      } catch {
        memoryDeviceName = name.trim();
      }
    } else {
      memoryDeviceName = name.trim();
    }
  }
}
