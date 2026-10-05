import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      }
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });
    service = TestBed.inject(AuthService);
  });

  it('should initialize with no authenticated user if storage is empty', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.token()).toBeNull();
  });

  it('should handle registration and set user and token in state', async () => {
    const mockResponse = {
      token: 'mock-jwt-token',
      user: {
        id: 'usr_123',
        email: 'test@alignify.com',
        displayName: 'Test User',
        avatarColor: '#3b82f6',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      workspace: {
        id: 'ws_123',
        name: 'Personal Workspace',
        slug: 'personal-workspace',
        ownerId: 'usr_123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await service.register({
      email: 'test@alignify.com',
      password: 'password123',
      displayName: 'Test User',
      avatarColor: '#3b82f6'
    });

    expect(result.token).toBe('mock-jwt-token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.email).toBe('test@alignify.com');
    expect(localStorage.getItem('alignify_token')).toBe('mock-jwt-token');
  });

  it('should handle login and set user and token', async () => {
    const mockResponse = {
      token: 'mock-login-token',
      user: {
        id: 'usr_456',
        email: 'user@alignify.com',
        displayName: 'Login User',
        avatarColor: '#10b981',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const result = await service.login({
      email: 'user@alignify.com',
      password: 'secretpassword'
    });

    expect(result.token).toBe('mock-login-token');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.displayName).toBe('Login User');
  });

  it('should clear state and storage on logout', () => {
    localStorage.setItem('alignify_token', 'test-tok');
    localStorage.setItem('alignify_user', JSON.stringify({ id: '1', email: 'a@b.com' }));

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('alignify_token')).toBeNull();
  });
});
