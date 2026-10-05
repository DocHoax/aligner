import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { WorkspaceService } from './workspace.service';
import { AuthService } from './auth.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    TestBed.configureTestingModule({
      providers: [
        WorkspaceService,
        AuthService,
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });
    service = TestBed.inject(WorkspaceService);
    authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'getAuthHeader').mockReturnValue({ Authorization: 'Bearer test' });
  });

  it('should load workspaces and update signal', async () => {
    const mockWorkspaces = [
      {
        id: 'ws_1',
        name: 'Design System Team',
        slug: 'design-system',
        ownerId: 'usr_1',
        userRole: 'owner' as const,
        memberCount: 3,
        boardCount: 5,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      }
    ];

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workspaces: mockWorkspaces })
    } as Response);

    const result = await service.loadWorkspaces();
    expect(result.length).toBe(1);
    expect(service.workspaces().length).toBe(1);
    expect(service.workspaces()[0]?.name).toBe('Design System Team');
    expect(service.currentWorkspace()?.id).toBe('ws_1');
  });

  it('should create workspace and prepend to signal list', async () => {
    const newWs = {
      id: 'ws_2',
      name: 'Engineering Workspace',
      slug: 'engineering',
      ownerId: 'usr_1',
      userRole: 'owner' as const,
      memberCount: 1,
      boardCount: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workspace: newWs })
    } as Response);

    const created = await service.createWorkspace({ name: 'Engineering Workspace' });
    expect(created.name).toBe('Engineering Workspace');
    expect(service.currentWorkspace()?.id).toBe('ws_2');
    expect(service.workspaces().some((w) => w.id === 'ws_2')).toBe(true);
  });
});
