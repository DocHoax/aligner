import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { Board, UserRole } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  readonly boards = signal<Board[]>([]);
  readonly currentBoard = signal<Board | null>(null);
  readonly currentBoardRole = signal<UserRole>('viewer');
  readonly loading = signal<boolean>(false);

  loadBoards(workspaceId: string): Observable<Board[]> {
    this.loading.set(true);
    return this.http
      .get<Board[]>(`/api/workspaces/${workspaceId}/boards`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Board[] | { boards?: Board[] }) =>
          Array.isArray(response) ? response : response.boards ?? []
        ),
        tap({
          next: (bList) => {
            this.boards.set(bList || []);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  createBoard(
    workspaceId: string,
    payload: { name: string; description?: string; isPublic?: boolean }
  ): Observable<Board> {
    return this.http
      .post<Board>(`/api/workspaces/${workspaceId}/boards`, payload, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Board | { board?: Board }) =>
          'board' in response && response.board ? response.board : response as Board
        ),
        tap((newBoard) => {
          this.boards.update((list) => [newBoard, ...list]);
        })
      );
  }

  getBoard(boardId: string): Observable<Board> {
    this.loading.set(true);
    return this.http
      .get<Board>(`/api/boards/${boardId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Board | { board?: Board }) =>
          'board' in response && response.board ? response.board : response as Board
        ),
        tap({
          next: (board) => {
            this.currentBoard.set(board);
            if (board.userRole) {
              this.currentBoardRole.set(board.userRole);
            }
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  updateBoard(
    boardId: string,
    payload: { name?: string; description?: string; isPublic?: boolean }
  ): Observable<Board> {
    return this.http
      .patch<Board>(`/api/boards/${boardId}`, payload, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Board | { board?: Board }) =>
          'board' in response && response.board ? response.board : response as Board
        ),
        tap((updated) => {
          this.boards.update((list) =>
            list.map((b) => (b.id === boardId ? { ...b, ...updated } : b))
          );
          if (this.currentBoard()?.id === boardId) {
            this.currentBoard.update((b) => (b ? { ...b, ...updated } : null));
          }
        })
      );
  }

  deleteBoard(boardId: string): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`/api/boards/${boardId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap(() => {
          this.boards.update((list) => list.filter((b) => b.id !== boardId));
          if (this.currentBoard()?.id === boardId) {
            this.currentBoard.set(null);
          }
        })
      );
  }

  exportBoard(boardId: string): Observable<any> {
    return this.http.get<any>(`/api/boards/${boardId}/export`, {
      headers: this.authService.getAuthHeaders()
    });
  }
}
