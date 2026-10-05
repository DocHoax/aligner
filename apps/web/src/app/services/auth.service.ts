import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { User, AuthResponse, Workspace } from '../models/auth.models';

const TOKEN_KEY = 'alignify_token';
const USER_KEY = 'alignify_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly apiBase = '/api/auth';

  // Reactive state signals
  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly token = signal<string | null>(this.getStoredToken());
  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());

  constructor() {
    // If token exists, refresh current user
    if (this.token()) {
      this.getMe().subscribe({
        error: () => this.clearSession()
      });
    }
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.token();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  register(payload: {
    email: string;
    password: string;
    displayName: string;
    avatarColor?: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBase}/register`, payload).pipe(
      tap((res) => this.handleAuthSuccess(res)),
      catchError((err) => throwError(() => err))
    );
  }

  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBase}/login`, credentials).pipe(
      tap((res) => this.handleAuthSuccess(res)),
      catchError((err) => throwError(() => err))
    );
  }

  logout(): void {
    if (this.token()) {
      this.http
        .post(`${this.apiBase}/logout`, {}, { headers: this.getAuthHeaders() })
        .subscribe({ error: () => {} });
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  getMe(): Observable<{ user: User; workspaces: Workspace[] }> {
    return this.http
      .get<{ user: User; workspaces: Workspace[] }>(`${this.apiBase}/me`, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          if (res.user) {
            this.currentUser.set(res.user);
            localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          }
        })
      );
  }

  updateProfile(data: {
    displayName?: string;
    avatarColor?: string;
    password?: string;
  }): Observable<{ user: User }> {
    return this.http
      .patch<{ user: User }>(`${this.apiBase}/profile`, data, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        tap((res) => {
          if (res.user) {
            this.currentUser.set(res.user);
            localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          }
        })
      );
  }

  private handleAuthSuccess(res: AuthResponse): void {
    if (res.token) {
      this.token.set(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
    }
    if (res.user) {
      this.currentUser.set(res.user);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
  }

  private clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private getStoredUser(): User | null {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }
}
