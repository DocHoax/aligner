import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { BoardSnapshot } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  readonly versions = signal<BoardSnapshot[]>([]);
  readonly selectedVersion = signal<BoardSnapshot | null>(null);
  readonly loading = signal<boolean>(false);

  loadVersions(boardId: string): Observable<BoardSnapshot[]> {
    this.loading.set(true);
    return this.http
      .get<{ success: boolean; versions: BoardSnapshot[] }>(`/api/boards/${boardId}/versions`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((res) => res.versions || []),
        tap({
          next: (list) => {
            this.versions.set(list);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  getVersion(boardId: string, versionId: string): Observable<BoardSnapshot> {
    return this.http
      .get<{ success: boolean; version: BoardSnapshot }>(
        `/api/boards/${boardId}/versions/${versionId}`,
        { headers: this.authService.getAuthHeaders() }
      )
      .pipe(map((res) => res.version));
  }

  restoreVersion(boardId: string, versionId: string): Observable<{ success: boolean; restoredSeq: number }> {
    return this.http.post<{ success: boolean; restoredSeq: number }>(
      `/api/boards/${boardId}/versions/${versionId}/restore`,
      {},
      { headers: this.authService.getAuthHeaders() }
    );
  }
}
