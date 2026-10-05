import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BoardService } from './board.service';
import { AuthService } from './auth.service';

describe('BoardService', () => {
  let service: BoardService;
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    TestBed.configureTestingModule({
      providers: [
        BoardService,
        AuthService,
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });
    service = TestBed.inject(BoardService);
    authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'getAuthHeader').mockReturnValue({ Authorization: 'Bearer test' });
  });

  it('should load workspace boards and populate signal', async () => {
    const mockBoards = [
      {
        id: 'brd_1',
        workspaceId: 'ws_1',
        name: 'Sprint Planning Canvas',
        isPublic: false,
        createdBy: 'usr_1',
        userRole: 'owner' as const,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01'
      }
    ];

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ boards: mockBoards })
    } as Response);

    const result = await service.loadWorkspaceBoards('ws_1');
    expect(result.length).toBe(1);
    expect(service.boards().length).toBe(1);
    expect(service.boards()[0]?.name).toBe('Sprint Planning Canvas');
  });

  it('should create board and add to signal', async () => {
    const newBoard = {
      id: 'brd_2',
      workspaceId: 'ws_1',
      name: 'System Architecture Diagram',
      isPublic: false,
      createdBy: 'usr_1',
      userRole: 'owner' as const,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ board: newBoard })
    } as Response);

    const created = await service.createBoard('ws_1', { name: 'System Architecture Diagram' });
    expect(created.name).toBe('System Architecture Diagram');
    expect(service.currentBoard()?.id).toBe('brd_2');
    expect(service.boards().some((b) => b.id === 'brd_2')).toBe(true);
  });
});
