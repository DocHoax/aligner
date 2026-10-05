import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: Router,
          useValue: {
            createUrlTree: vi.fn((commands, extras) => ({ commands, extras }))
          }
        }
      ]
    });

    authService = TestBed.inject(AuthService);
  });

  it('should allow navigation when user is authenticated', () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);

    const mockRoute = {} as ActivatedRouteSnapshot;
    const mockState = { url: '/workspaces' } as RouterStateSnapshot;

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));
    expect(result).toBe(true);
  });

  it('should redirect to /login with returnUrl when user is not authenticated', () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(false);

    const mockRoute = {} as ActivatedRouteSnapshot;
    const mockState = { url: '/workspaces/ws_123' } as RouterStateSnapshot;

    const result: any = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));
    expect(result.commands).toEqual(['/login']);
    expect(result.extras?.queryParams?.returnUrl).toBe('/workspaces/ws_123');
  });
});
