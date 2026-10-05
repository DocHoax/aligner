import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { WorkspaceService } from '../workspace.service';
import { Workspace, WorkspaceMember } from '../../models/auth.models';

describe('WorkspaceService', () => {
  let workspaceService: WorkspaceService;
  let mockHttpClient: any;
  let mockAuthService: any;

  const mockWorkspaces: Workspace[] = [
    {
      id: 'ws_1',
      name: 'Workspace Alpha',
      slug: 'workspace-alpha',
      description: 'Alpha workspace description',
      ownerId: 'usr_1',
      userRole: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'ws_2',
      name: 'Workspace Beta',
      slug: 'workspace-beta',
      description: 'Beta workspace description',
      ownerId: 'usr_2',
      userRole: 'editor',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ];

  const mockMembers: WorkspaceMember[] = [
    {
      userId: 'usr_1',
      email: 'owner@alignify.dev',
      displayName: 'Workspace Owner',
      avatarColor: '#3b82f6',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00Z'
    },
    {
      userId: 'usr_2',
      email: 'editor@alignify.dev',
      displayName: 'Workspace Editor',
      avatarColor: '#10b981',
      role: 'editor',
      joinedAt: '2026-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn()
    };

    mockAuthService = {
      getAuthHeaders: vi.fn().mockReturnValue({})
    };

    workspaceService = Object.create(WorkspaceService.prototype);
    (workspaceService as any).http = mockHttpClient;
    (workspaceService as any).authService = mockAuthService;
    (workspaceService as any).loading = { set: vi.fn() };
    (workspaceService as any).loading = { set: vi.fn() };

    let wsVal: Workspace[] = [];
    (workspaceService as any).workspaces = {
      set: vi.fn((val) => { wsVal = val; }),
      update: vi.fn((fn) => { wsVal = fn(wsVal); }),
      val: () => wsVal
    };

    let curWsVal: Workspace | null = null;
    (workspaceService as any).currentWorkspace = {
      set: vi.fn((val) => { curWsVal = val; }),
      update: vi.fn((fn) => { curWsVal = fn(curWsVal); }),
      val: () => curWsVal
    };

    let memVal: WorkspaceMember[] = [];
    (workspaceService as any).members = {
      set: vi.fn((val) => { memVal = val; }),
      update: vi.fn((fn) => { memVal = fn(memVal); }),
      val: () => memVal
    };
  });

  it('loads workspaces successfully and updates signal', async () => {
    mockHttpClient.get.mockReturnValue(of(mockWorkspaces));

    const res = await new Promise<Workspace[]>((resolve, reject) => {
      workspaceService.loadWorkspaces().subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.length).toBe(2);
    expect(res[0]?.name).toBe('Workspace Alpha');
    expect((workspaceService.workspaces as any).set).toHaveBeenCalledWith(mockWorkspaces);
  });

  it('creates workspace and prepends to list', async () => {
    const newWs: Workspace = {
      id: 'ws_new',
      name: 'Brand New',
      slug: 'brand-new',
      description: 'Desc',
      ownerId: 'usr_1',
      userRole: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    mockHttpClient.post.mockReturnValue(of(newWs));

    const res = await new Promise<Workspace>((resolve, reject) => {
      workspaceService.createWorkspace({ name: 'Brand New', description: 'Desc' }).subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.id).toBe('ws_new');
    expect((workspaceService.workspaces as any).update).toHaveBeenCalled();
  });

  it('loads workspace members', async () => {
    mockHttpClient.get.mockReturnValue(of(mockMembers));

    const res = await new Promise<WorkspaceMember[]>((resolve, reject) => {
      workspaceService.loadMembers('ws_1').subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.length).toBe(2);
    expect((workspaceService.members as any).set).toHaveBeenCalledWith(mockMembers);
  });
});
