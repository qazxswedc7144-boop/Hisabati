import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth } from '@/core/database/firebase';
import { AuditActor, UserRole } from '@/shared/types';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'offline';

/**
 * AuthService: Manages user identity and session.
 * Now integrated with Firebase Authentication for SaaS identity.
 * Respects Offline-First by providing a local fallback when unauthenticated.
 */
export class AuthService {
  private static instance: AuthService;
  
  // Default fallback actor (Owner) - Used for local-only operation when not logged into Cloud
  private readonly DEFAULT_ACTOR: AuditActor = {
    id: 'user_local_default',
    name: 'مستخدم محلي',
    role: 'owner',
    email: 'local@hisabati.app',
  };

  private currentActor: AuditActor | null = null;
  private authStatus: AuthStatus = 'loading';
  private firebaseUser: User | null = null;

  private constructor() {
    // Only initialize the auth listener. 
    // The database initialization is orchestrated by TenantService 
    // which is called by App.tsx to ensure correct sequencing.
    this.initializeAuthListener();
  }

  private async initializeDefaultDb(): Promise<void> {
    // Deprecated: Redundant with TenantService.initialize()
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Listen to Firebase Auth state changes
   */
  private initializeAuthListener(): void {
    if (!auth) {
      this.currentActor = { ...this.DEFAULT_ACTOR };
      this.authStatus = 'unauthenticated';
      return;
    }
    
    onAuthStateChanged(auth, (user) => {
      this.firebaseUser = user;
      if (user) {
        this.currentActor = {
          id: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'مستخدم',
          email: user.email || undefined,
          role: 'pending_membership', // P1.2-B-H: Firebase auth != owner. Default to pending_membership until validated.
        };
        this.authStatus = 'authenticated';
      } else {
        this.currentActor = { ...this.DEFAULT_ACTOR };
        this.authStatus = 'unauthenticated';
      }
      
    });

    // Simple connectivity check for offline status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.firebaseUser) this.authStatus = 'unauthenticated';
        else this.authStatus = 'authenticated';
      });
      window.addEventListener('offline', () => {
        this.authStatus = 'offline';
      });
      if (!navigator.onLine) this.authStatus = 'offline';
    }
  }

  /**
   * Returns the current active actor in the session
   */
  public getActiveActor(): AuditActor {
    return this.currentActor || { ...this.DEFAULT_ACTOR };
  }

  /**
   * Returns the current authentication status
   */
  public getStatus(): AuthStatus {
    return this.authStatus;
  }

  /**
   * Updates the active session actor (Local/Testing switching)
   * This updates the UI state/Cache but doesn't change Firebase Auth.
   */
  public async setActiveActor(actor: AuditActor): Promise<void> {
    this.currentActor = { ...actor };
  }

  /**
   * Firebase Email/Password login
   */
  public async login(email: string, password: string): Promise<void> {
    if (!auth) {
      throw new Error('نظام المصادقة السحابي غير مفعل حالياً. يرجى إعداد المفاتيح البرمجية.');
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('AuthService: Login failed', error);
      throw new Error(this.mapAuthError(error.code));
    }
  }

  /**
   * Firebase Logout
   */
  public async logout(): Promise<void> {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error('AuthService: Logout failed', error);
    } finally {
      // Always reset to default local actor on logout
      this.currentActor = { ...this.DEFAULT_ACTOR };
      if (!auth) {
        this.authStatus = 'unauthenticated';
      }
    }
  }

  /**
   * Check for role
   */
  public isRole(role: UserRole): boolean {
    return this.getActiveActor().role === role;
  }

  private mapAuthError(code: string): string {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      case 'auth/network-request-failed':
        return 'خطأ في الاتصال بالشبكة، يرجى المحاولة لاحقاً';
      default:
        return 'حدث خطأ أثناء تسجيل الدخول';
    }
  }
}

export const authService = AuthService.getInstance();
