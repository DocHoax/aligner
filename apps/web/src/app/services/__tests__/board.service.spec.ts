import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { BoardService } from '../board.service';
import { Board } from '../../models/auth.models';

describe('BoardService', () => {
  let boardService: BoardService;
  let mockHttpClient: any;
  let mockAuthService: any;

  const mockBoards: Board[] = [
    {
      id: 'brd_1',
      workspaceId: 'ws_1',
      name: 'System Architecture',
      description: 'Core design doc',
      createdBy: 'usr_1',
      isPublic: false,
      userRole: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'brd_2',
      workspaceId: 'ws_1',
      name: 'Sprint Retro',
      description: 'Team retrospective',
      createdBy: 'usr_2',
      isPublic: false,
      userRole: 'editor',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
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

    boardService = Object.create(BoardService.prototype);
    (boardService as any).http = mockHttpClient;
    (boardService as any).authService = mockAuthService;
    (boardService as any).loading = { set: vi.fn() };

    let boardsVal: Board[] = [];
    const boards = Object.assign(
      () => boardsVal,
      {
        set: vi.fn((value: Board[]) => { boardsVal = value; }),
        update: vi.fn((fn: (value: Board[]) => Board[]) => { boardsVal = fn(boardsVal); })
      }
    );
    (boardService as any).boards = boards;

    let curBoardVal: Board | null = null;
    const currentBoard = Object.assign(
      () => curBoardVal,
      {
        set: vi.fn((value: Board | null) => { curBoardVal = value; }),
        update: vi.fn((fn: (value: Board | null) => Board | null) => {
          curBoardVal = fn(curBoardVal);
        })
      }
    );
    (boardService as any).currentBoard = currentBoard;

    let curRoleVal: 'owner' | 'editor' | 'viewer' = 'viewer';
    (boardService as any).currentBoardRole = Object.assign(
      () => curRoleVal,
      { set: vi.fn((value: 'owner' | 'editor' | 'viewer') => { curRoleVal = value; }) }
    );
  });

  it('loads workspace boards and updates signal', async () => {
    mockHttpClient.get.mockReturnValue(of(mockBoards));

    const res = await new Promise<Board[]>((resolve, reject) => {
      boardService.loadBoards('ws_1').subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.length).toBe(2);
    expect(res[0]?.name).toBe('System Architecture');
    expect((boardService.boards as any).set).toHaveBeenCalledWith(mockBoards);
  });

  it('creates board and prepends to list', async () => {
    const newBoard: Board = {
      id: 'brd_new',
      workspaceId: 'ws_1',
      name: 'New Diagram',
      description: 'New diagram description',
      createdBy: 'usr_1',
      isPublic: false,
      userRole: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    mockHttpClient.post.mockReturnValue(of(newBoard));

    const res = await new Promise<Board>((resolve, reject) => {
      boardService.createBoard('ws_1', { name: 'New Diagram', description: 'New diagram description' }).subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.id).toBe('brd_new');
    expect((boardService.boards as any).update).toHaveBeenCalled();
  });

  it('retrieves single board details and sets current board state', async () => {
    mockHttpClient.get.mockReturnValue(of(mockBoards[0]));

    const res = await new Promise<Board>((resolve, reject) => {
      boardService.getBoard('brd_1').subscribe({
        next: resolve,
        error: reject
      });
    });

    expect(res.id).toBe('brd_1');
    expect((boardService.currentBoard as any).set).toHaveBeenCalledWith(mockBoards[0]);
    expect((boardService.currentBoardRole as any).set).toHaveBeenCalledWith('owner');
  });
});
