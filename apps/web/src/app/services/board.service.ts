import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Board, UserRole } from '../models/auth.models';

const API_BASE = 'http://localhost:8080/api';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private readonly auth = inject(AuthService);

  readonly boards = signal<Board[]>([]);
  readonly currentBoard = signal<Board | null>(null);
  readonly currentBoardRole = signal<UserRole | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  async loadWorkspaceBoards(workspaceId: string): Promise<Board[]> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/boards`, {
        headers: this.auth.getAuthHeader()
      });

      if (!res.ok) {
        throw new Error('Failed to load workspace boards');
      }

      const payload: { boards: Board[] } = await res.json();
      const list = payload.boards;
      this.boards.set(list);
      return list;
    } catch (err: any) {
      this.error.set(err.message || 'Error loading boards');
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async getBoard(boardId: string): Promise<Board> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${API_BASE}/boards/${boardId}`, {
        headers: this.auth.getAuthHeader()
      });

      if (!res.ok) {
        throw new Error('Failed to fetch board');
      }

      const payload: { board: Board; userRole?: UserRole } = await res.json();
      const board = { ...payload.board, userRole: payload.userRole } as Board;
      this.currentBoard.set(board);
      this.currentBoardRole.set(board.userRole || 'editor');
      return board;
    } catch (err: any) {
      this.error.set(err.message || 'Error loading board');
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async createBoard(workspaceId: string, data: { name: string; description?: string; isPublic?: boolean }): Promise<Board> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create board' }));
      throw new Error(err.error || 'Failed to create board');
    }

    const payload: { board: Board; userRole?: UserRole } = await res.json();
    const board = { ...payload.board, userRole: payload.userRole || 'owner' } as Board;
    this.boards.update((list) => [board, ...list]);
    this.currentBoard.set(board);
    this.currentBoardRole.set(board.userRole || 'owner');
    return board;
  }

  async updateBoard(boardId: string, data: { name?: string; description?: string; isPublic?: boolean }): Promise<Board> {
    const res = await fetch(`${API_BASE}/boards/${boardId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update board' }));
      throw new Error(err.error || 'Failed to update board');
    }

    const payload: { board: Board } = await res.json();
    const updated = payload.board;
    this.boards.update((list) => list.map((b) => (b.id === boardId ? updated : b)));
    if (this.currentBoard()?.id === boardId) {
      this.currentBoard.set(updated);
    }
    return updated;
  }

  async deleteBoard(boardId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/boards/${boardId}`, {
      method: 'DELETE',
      headers: this.auth.getAuthHeader()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete board' }));
      throw new Error(err.error || 'Failed to delete board');
    }

    this.boards.update((list) => list.filter((b) => b.id !== boardId));
    if (this.currentBoard()?.id === boardId) {
      this.currentBoard.set(null);
    }
  }

  async exportBoard(boardId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/boards/${boardId}/export`, {
      headers: this.auth.getAuthHeader()
    });

    if (!res.ok) {
      throw new Error('Failed to export board');
    }

    return await res.json();
  }
}
