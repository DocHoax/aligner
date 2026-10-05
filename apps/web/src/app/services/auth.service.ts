import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthResponse, UserProfile, Workspace } from '../models/auth.models';

const API_BASE = 'http://localhost:8080/api';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly router = inject(Router);
  private readonly tokenSignal = signal<string | null>(this.getStoredToken());
  private readonly currentUserSignal = signal<UserProfile | null>(this.getStoredUser());
  private readonly currentWorkspaceSignal = signal<Workspace | null>(this.getStoredWorkspace());

  readonly token = computed(() => this.tokenSignal());
  readonly currentUser = computed(() => this.currentUserSignal());
  readonly currentWorkspace = computed(() => this.currentWorkspaceSignal());
  readonly isAuthenticated = computed(() => !!this.tokenSignal() && !!this.currentUserSignal());

  constructor() {
    if (this.tokenSignal() && !this.currentUserSignal()) {
      this.getMe().catch(() => this.logout());
    }
  }

  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('alignify_token') || sessionStorage.getItem('alignify_token');
  }

  private getStoredUser(): UserProfile | null {
    if (typeof window === 'undefined') return null;
    const userJson = localStorage.getItem('alignify_user') || sessionStorage.getItem('alignify_user');
    if (!userJson) return null;
    try {
      return JSON.parse(userJson) as UserProfile;
    } catch {
      return null;
    }
  }

  private getStoredWorkspace(): Workspace | null {
    if (typeof window === 'undefined') return null;
    const wsJson = localStorage.getItem('alignify_workspace') || sessionStorage.getItem('alignify_workspace');
    if (!wsJson) return null;
    try {
      return JSON.parse(wsJson) as Workspace;
    } catch {
      return null;
    }
  }

  private saveAuth(res: AuthResponse, remember = true): void {
    this.tokenSignal.set(res.token);
    this.currentUserSignal.set(res.user);
    if (res.workspace) {
      this.currentWorkspaceSignal.set(res.workspace);
    }

    if (typeof window === 'undefined') return;

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('alignify_token', res.token);
    storage.setItem('alignify_user', JSON.stringify(res.user));
    if (res.workspace) {
      storage.setItem('alignify_workspace', JSON.stringify(res.workspace));
    }
  }

  setCurrentWorkspace(workspace: Workspace): void {
    this.currentWorkspaceSignal.set(workspace);
    if (typeof window !== 'undefined') {
      localStorage.setItem('alignify_workspace', JSON.stringify(workspace));
    }
  }

  async register(data: {
    email: string;
    password: string;
    displayName: string;
    avatarColor?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(err.error || 'Registration failed');
    }

    const authRes: AuthResponse = await res.json();
    this.saveAuth(authRes);
    return authRes;
  }

  async login(data: { email: string; password: string }, remember = true): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Invalid email or password' }));
      throw new Error(err.error || 'Invalid email or password');
    }

    const authRes: AuthResponse = await res.json();
    this.saveAuth(authRes, remember);
    return authRes;
  }

  async getMe(): Promise<UserProfile> {
    const token = this.tokenSignal();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const payload: { user: UserProfile } = await res.json();
    const user = payload.user;
    this.currentUserSignal.set(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('alignify_user', JSON.stringify(user));
    }
    return user;
  }

  async updateProfile(data: {
    displayName?: string;
    avatarColor?: string;
    password?: string;
  }): Promise<UserProfile> {
    const token = this.tokenSignal();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update profile' }));
      throw new Error(err.error || 'Failed to update profile');
    }

    const payload: { user: UserProfile } = await res.json();
    const user = payload.user;
    this.currentUserSignal.set(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('alignify_user', JSON.stringify(user));
    }
    return user;
  }

  logout(): void {
    const token = this.tokenSignal();
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }

    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
    this.currentWorkspaceSignal.set(null);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('alignify_token');
      localStorage.removeItem('alignify_user');
      localStorage.removeItem('alignify_workspace');
      sessionStorage.removeItem('alignify_token');
      sessionStorage.removeItem('alignify_user');
      sessionStorage.removeItem('alignify_workspace');
    }

    this.router.navigate(['/login']);
  }

  getAuthHeader(): Record<string, string> {
    const token = this.tokenSignal();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
