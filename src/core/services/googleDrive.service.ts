/**
 * Google Drive REST API Client for Hisabati.
 * Handles client-side OAuth access token lifecycle, file search, upload, download, and deletion.
 * Uses least-privilege Google Drive scope (drive.file).
 */

import { DriveFileInfo } from '@/shared/types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const TOKEN_STORAGE_KEY = 'hisabati_gdrive_token';
const USER_INFO_STORAGE_KEY = 'hisabati_gdrive_user';
const TOKEN_EXPIRY_STORAGE_KEY = 'hisabati_gdrive_expiry';

export interface GoogleDriveUser {
  email: string;
  name: string;
  picture?: string;
}

export class GoogleDriveService {
  private cachedToken: string | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.cachedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    }
  }

  public getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') return this.cachedToken;
    if (!this.cachedToken) {
      this.cachedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    }
    const expiry = localStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      this.disconnect();
      return null;
    }
    return this.cachedToken;
  }

  public setAccessToken(token: string, expiresInSeconds = 3600, user?: GoogleDriveUser): void {
    this.cachedToken = token;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, (Date.now() + expiresInSeconds * 1000).toString());
      if (user) {
        localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(user));
      }
    }
  }

  public getUserInfo(): GoogleDriveUser | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(USER_INFO_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GoogleDriveUser;
    } catch {
      return null;
    }
  }

  public isConnected(): boolean {
    return !!this.getAccessToken();
  }

  public disconnect(): void {
    this.cachedToken = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
      localStorage.removeItem(USER_INFO_STORAGE_KEY);
    }
  }

  /**
   * Initializes Google Identity Services Token Client if available in window, or prompts token acquisition.
   */
  public async requestGoogleAuth(clientId?: string): Promise<boolean> {
    const googleClientId = clientId || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
    
    if (typeof window === 'undefined') return false;

    // Check if google accounts library is loaded
    const google = (window as any).google;
    if (google?.accounts?.oauth2 && googleClientId) {
      return new Promise<boolean>((resolve) => {
        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            callback: async (response: any) => {
              if (response && response.access_token) {
                // Fetch profile
                let profile: GoogleDriveUser | undefined;
                try {
                  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${response.access_token}` },
                  });
                  if (userRes.ok) {
                    const userData = await userRes.json();
                    profile = {
                      email: userData.email,
                      name: userData.name,
                      picture: userData.picture,
                    };
                  }
                } catch {
                  // Ignore user info fetch error
                }

                this.setAccessToken(
                  response.access_token,
                  response.expires_in ? parseInt(response.expires_in, 10) : 3600,
                  profile || { email: 'حساب Google متصل', name: 'Google User' }
                );
                resolve(true);
              } else {
                resolve(false);
              }
            },
          });
          client.requestAccessToken();
        } catch (err) {
          console.warn('Google Identity Client error:', err);
          resolve(false);
        }
      });
    }

    return false;
  }

  /**
   * Helper to perform authenticated HTTP fetch with timeout and error mapping
   */
  private async fetchWithAuth(url: string, options: RequestInit = {}, timeoutMs = 25000): Promise<Response> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('لم يتم تسجيل الدخول إلى Google Drive أو انتهت صلاحية الجلسة');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (response.status === 401) {
        this.disconnect();
        throw new Error('انتهت صلاحية رمز الوصول لـ Google Drive، يرجى إعادة تسجيل الدخول');
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`خطأ من خادم Google Drive (${response.status}): ${errorText.substring(0, 150)}`);
      }

      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('انتهت مهلة الاتصال بخادم Google Drive (Timeout)');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Finds or creates the app folder 'Hisabati' on the user's Drive.
   */
  public async getOrCreateAppFolder(): Promise<string> {
    const folderName = 'Hisabati_Backups';
    const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchUrl = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`;

    const res = await this.fetchWithAuth(searchUrl);
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Create folder
    const createUrl = `${DRIVE_API_BASE}/files`;
    const createRes = await this.fetchWithAuth(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    const folder = await createRes.json();
    return folder.id;
  }

  /**
   * Lists all backup and sync files stored in Google Drive folder.
   */
  public async listFiles(): Promise<DriveFileInfo[]> {
    const folderId = await this.getOrCreateAppFolder();
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,size,createdTime,modifiedTime,description)&orderBy=createdTime desc`;

    const res = await this.fetchWithAuth(url);
    const data = await res.json();

    const files: DriveFileInfo[] = (data.files || []).map((f: any) => {
      let metadata: any = undefined;
      if (f.description) {
        try {
          metadata = JSON.parse(f.description);
        } catch {
          // ignore
        }
      }
      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : undefined,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        metadata,
      };
    });

    return files;
  }

  /**
   * Uploads a JSON file to Google Drive (Multipart upload)
   */
  public async uploadJsonFile(
    filename: string,
    content: any,
    metadataSummary?: any
  ): Promise<{ id: string; name: string }> {
    const folderId = await this.getOrCreateAppFolder();
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const fileMetadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json',
      description: metadataSummary ? JSON.stringify(metadataSummary) : undefined,
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(fileMetadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(content) +
      closeDelimiter;

    const res = await this.fetchWithAuth(DRIVE_UPLOAD_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    const result = await res.json();
    return { id: result.id, name: result.name };
  }

  /**
   * Downloads and parses a JSON file by Drive file ID.
   */
  public async downloadJsonFile<T = any>(fileId: string): Promise<T> {
    const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
    const res = await this.fetchWithAuth(url);
    return (await res.json()) as T;
  }

  /**
   * Deletes a file by ID from Google Drive.
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    const url = `${DRIVE_API_BASE}/files/${fileId}`;
    await this.fetchWithAuth(url, { method: 'DELETE' });
    return true;
  }
}

export const googleDriveService = new GoogleDriveService();
