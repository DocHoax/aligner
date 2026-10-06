import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { BoardComment } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class CommentService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  readonly comments = signal<BoardComment[]>([]);
  readonly activeThread = signal<BoardComment | null>(null);
  readonly loading = signal<boolean>(false);

  loadComments(boardId: string): Observable<BoardComment[]> {
    this.loading.set(true);
    return this.http
      .get<{ success: boolean; comments: BoardComment[] }>(`/api/boards/${boardId}/comments`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((res) => res.comments || []),
        tap({
          next: (list) => {
            this.comments.set(list);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  createComment(
    boardId: string,
    payload: { content: string; parentId?: string; x?: number; y?: number }
  ): Observable<BoardComment> {
    return this.http
      .post<{ success: boolean; comment: BoardComment }>(
        `/api/boards/${boardId}/comments`,
        payload,
        { headers: this.authService.getAuthHeaders() }
      )
      .pipe(
        map((res) => res.comment),
        tap((newComment) => {
          if (newComment.parentId) {
            // It's a reply
            this.comments.update((list) =>
              list.map((c) => {
                if (c.id === newComment.parentId) {
                  return {
                    ...c,
                    replies: [...(c.replies || []), newComment]
                  };
                }
                return c;
              })
            );
          } else {
            // New root comment
            this.comments.update((list) => [...list, newComment]);
          }
        })
      );
  }

  updateComment(
    boardId: string,
    commentId: string,
    payload: { content?: string; resolved?: boolean }
  ): Observable<BoardComment> {
    return this.http
      .patch<{ success: boolean; comment: BoardComment }>(
        `/api/boards/${boardId}/comments/${commentId}`,
        payload,
        { headers: this.authService.getAuthHeaders() }
      )
      .pipe(
        map((res) => res.comment),
        tap((updated) => {
          this.comments.update((list) =>
            list.map((c) => {
              if (c.id === commentId) {
                return { ...c, ...updated };
              }
              if (c.replies) {
                return {
                  ...c,
                  replies: c.replies.map((r) => (r.id === commentId ? { ...r, ...updated } : r))
                };
              }
              return c;
            })
          );
        })
      );
  }

  deleteComment(boardId: string, commentId: string): Observable<{ success: boolean }> {
    return this.http
      .delete<{ success: boolean }>(`/api/boards/${boardId}/comments/${commentId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap(() => {
          this.comments.update((list) =>
            list
              .filter((c) => c.id !== commentId)
              .map((c) => ({
                ...c,
                replies: (c.replies || []).filter((r) => r.id !== commentId)
              }))
          );
          if (this.activeThread()?.id === commentId) {
            this.activeThread.set(null);
          }
        })
      );
  }

  setActiveThread(thread: BoardComment | null): void {
    this.activeThread.set(thread);
  }
}
