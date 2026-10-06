import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { BoardActivity } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  readonly activities = signal<BoardActivity[]>([]);
  readonly loading = signal<boolean>(false);

  loadActivities(boardId: string, limit = 50, offset = 0): Observable<BoardActivity[]> {
    this.loading.set(true);
    return this.http
      .get<{ success: boolean; activities: BoardActivity[] }>(
        `/api/boards/${boardId}/activity?limit=${limit}&offset=${offset}`,
        { headers: this.authService.getAuthHeaders() }
      )
      .pipe(
        map((res) => res.activities || []),
        tap({
          next: (list) => {
            this.activities.set(list);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }
}
