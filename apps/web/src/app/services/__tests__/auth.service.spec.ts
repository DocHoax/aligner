import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AuthService } from '../auth.service';
import { User, AuthResponse } from '../../models/auth.models';

const storage = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear()
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;

describe('AuthService', () => {
  let authService: AuthService;
  let mockHttpClient: any;
  let mockRouter: any;

  const mockUser: User = {
    id: 'usr_test123',
    email: 'test@alignify.dev',
    displayName: 'Test User',
    avatarColor: '#3b82f6',
    createdAt: '2026-01-01T00:00:00Z'
  };

  const mockAuthResponse: AuthResponse = {
    token: 'jwt_mock_token_xyz',
    user: mockUser,
    workspace: {
      id: 'ws_test123',
      name: 'Personal Workspace',
      slug: 'personal-workspace',
      description: 'Default personal workspace',
      ownerId: 'usr_test123',
      userRole: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  };

  beforeEach(() => {
    const storage = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear()
    };
    localStorage.clear();

    mockHttpClient = {
      post: vi.fn(),
      get: vi.fn(),
      patch: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    // Instantiate service using prototype or direct assignment of injected dependencies
    authService = Object.create(AuthService.prototype);
    (authService as any).http = mockHttpClient;
    (authService as any).router = mockRouter;
    (authService as any).apiBase = '/api/auth';
    let userValue: User | null = null;
    const currentUser = Object.assign(
      () => userValue,
      {
        set: vi.fn((value: User | null) => { userValue = value; }),
        update: vi.fn((fn: (value: User | null) => User | null) => {
          userValue = fn(userValue);
        })
      }
    );
    (authService as any).currentUser = currentUser;

    let tokenValue: string | null = 'jwt_mock_token_xyz';
    const token = Object.assign(
      () => tokenValue,
      {
        set: vi.fn((value: string | null) => { tokenValue = value; })
      }
    );
    (authService as any).token = token;
  });

  it('handles successful registration and saves session', async () => {
    mockHttpClient.post.mockReturnValue(of(mockAuthResponse));

    const result = await new Promise<AuthResponse>((resolve, reject) => {
      authService.register({
        email: 'test@alignify.dev',
        password: 'password123',
        displayName: 'Test User',
        avatarColor: '#3b82f6'
      }).subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(result.token).toBe('jwt_mock_token_xyz');
    expect(result.user.email).toBe('test@alignify.dev');
    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/auth/register', {
      email: 'test@alignify.dev',
      password: 'password123',
      displayName: 'Test User',
      avatarColor: '#3b82f6'
    });
  });

  it('handles successful login and stores token', async () => {
    mockHttpClient.post.mockReturnValue(of(mockAuthResponse));

    const result = await new Promise<AuthResponse>((resolve, reject) => {
      authService.login({
        email: 'test@alignify.dev',
        password: 'password123'
      }).subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(result.token).toBe('jwt_mock_token_xyz');
    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/auth/login', {
      email: 'test@alignify.dev',
      password: 'password123'
    });
  });

  it('handles logout and clears session', () => {
    mockHttpClient.post.mockReturnValue(of({}));
    authService.logout();

    expect(mockHttpClient.post).toHaveBeenCalledWith('/api/auth/logout', {}, {
      headers: expect.anything()
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
