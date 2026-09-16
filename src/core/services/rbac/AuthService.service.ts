import { AuditActor, UserRole } from '@/shared/types';

/**
 * AuthService: Abstracted session management layer.
 * Decouples actor identity and role from direct localStorage manipulation.
 * Provides a secure, observable source of truth for the active session.
 */
export class AuthService {
  private static instance: AuthService;
  
  // Default fallback actor (Owner)
  private readonly DEFAULT_ACTOR: AuditActor = {
    id: 'user_owner_default',
    name: 'المدير المالي (المالك)',
    role: 'owner',
    email: 'owner@hisabati.app',
  };

  private currentActor: AuditActor | null = null;
  private readonly STORAGE_KEY = 'hisabati_active_actor';

  private constructor() {
    this.loadSession();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Load session from storage if available, otherwise use default
   */
  private loadSession(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (this.isValidActor(parsed)) {
            this.currentActor = parsed;
            return;
          }
        }
      }
    } catch (e) {
      console.warn('AuthService: Failed to load session from storage', e);
    }
    this.currentActor = { ...this.DEFAULT_ACTOR };
  }

  /**
   * Validates the structure of a stored actor
   */
  private isValidActor(actor: any): actor is AuditActor {
    return (
      actor &&
      typeof actor.id === 'string' &&
      typeof actor.role === 'string' &&
      typeof actor.name === 'string'
    );
  }

  /**
   * Returns the current active actor in the session
   */
  public getActiveActor(): AuditActor {
    if (!this.currentActor) {
      this.loadSession();
    }
    return this.currentActor || { ...this.DEFAULT_ACTOR };
  }

  /**
   * Updates the active session actor and persists it to storage
   */
  public async login(actor: AuditActor): Promise<void> {
    if (!this.isValidActor(actor)) {
      throw new Error('بيانات المستخدم غير صالحة');
    }
    
    this.currentActor = { ...actor };
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentActor));
      }
    } catch (e) {
      console.warn('AuthService: Failed to persist session', e);
    }
  }

  /**
   * Resets session to default owner
   */
  public async logout(): Promise<void> {
    this.currentActor = { ...this.DEFAULT_ACTOR };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch (e) {
      console.warn('AuthService: Failed to clear session', e);
    }
  }

  /**
   * Quick check for role
   */
  public isRole(role: UserRole): boolean {
    return this.getActiveActor().role === role;
  }
}

export const authService = AuthService.getInstance();
