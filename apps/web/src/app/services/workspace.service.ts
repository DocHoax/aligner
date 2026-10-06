import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { Workspace, WorkspaceMember, UserRole } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private readonly apiBase = '/api/workspaces';

  readonly workspaces = signal<Workspace[]>([]);
  readonly currentWorkspace = signal<Workspace | null>(null);
  readonly members = signal<WorkspaceMember[]>([]);
  readonly loading = signal<boolean>(false);

  loadWorkspaces(): Observable<Workspace[]> {
    this.loading.set(true);
    return this.http
      .get<Workspace[]>(this.apiBase, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Workspace[] | { workspaces?: Workspace[] }) =>
          Array.isArray(response) ? response : response.workspaces ?? []
        ),
        tap({
          next: (wsList) => {
            this.workspaces.set(wsList || []);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  getWorkspace(workspaceId: string): Observable<Workspace> {
    this.loading.set(true);
    return this.http
      .get<Workspace>(`${this.apiBase}/${workspaceId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Workspace | { workspace?: Workspace }) =>
          'workspace' in response && response.workspace ? response.workspace : response as Workspace
        ),
        tap({
          next: (ws) => {
            this.currentWorkspace.set(ws);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        })
      );
  }

  createWorkspace(payload: { name: string; description?: string }): Observable<Workspace> {
    return this.http
      .post<Workspace>(this.apiBase, payload, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Workspace | { workspace?: Workspace }) =>
          'workspace' in response && response.workspace ? response.workspace : response as Workspace
        ),
        tap((ws) => {
          this.workspaces.update((list) => [ws, ...list]);
        })
      );
  }

  updateWorkspace(
    workspaceId: string,
    payload: { name?: string; description?: string }
  ): Observable<Workspace> {
    return this.http
      .patch<Workspace>(`${this.apiBase}/${workspaceId}`, payload, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: Workspace | { workspace?: Workspace }) =>
          'workspace' in response && response.workspace ? response.workspace : response as Workspace
        ),
        tap((updated) => {
          this.workspaces.update((list) =>
            list.map((w) => (w.id === workspaceId ? { ...w, ...updated } : w))
          );
          if (this.currentWorkspace()?.id === workspaceId) {
            this.currentWorkspace.update((w) => (w ? { ...w, ...updated } : null));
          }
        })
      );
  }

  deleteWorkspace(workspaceId: string): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`${this.apiBase}/${workspaceId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap(() => {
          this.workspaces.update((list) => list.filter((w) => w.id !== workspaceId));
          if (this.currentWorkspace()?.id === workspaceId) {
            this.currentWorkspace.set(null);
          }
        })
      );
  }

  loadMembers(workspaceId: string): Observable<WorkspaceMember[]> {
    return this.http
      .get<WorkspaceMember[]>(`${this.apiBase}/${workspaceId}/members`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: WorkspaceMember[] | { members?: WorkspaceMember[] }) =>
          Array.isArray(response) ? response : response.members ?? []
        ),
        tap((mList) => {
          this.members.set(mList || []);
        })
      );
  }

  inviteMember(
    workspaceId: string,
    payload: { email: string; role: UserRole }
  ): Observable<WorkspaceMember> {
    return this.http
      .post<WorkspaceMember>(`${this.apiBase}/${workspaceId}/members`, payload, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        map((response: WorkspaceMember | { member?: WorkspaceMember }) =>
          'member' in response && response.member ? response.member : response as WorkspaceMember
        ),
        tap((newMem) => {
          this.members.update((list) => {
            const exists = list.some((m) => m.userId === newMem.userId);
            if (exists) {
              return list.map((m) => (m.userId === newMem.userId ? newMem : m));
            }
            return [...list, newMem];
          });
        })
      );
  }

  updateMemberRole(
    workspaceId: string,
    userId: string,
    role: UserRole
  ): Observable<WorkspaceMember> {
    return this.http
      .patch<WorkspaceMember>(
        `${this.apiBase}/${workspaceId}/members/${userId}`,
        { role },
        { headers: this.authService.getAuthHeaders() }
      )
      .pipe(
        map((response: WorkspaceMember | { member?: WorkspaceMember }) =>
          'member' in response && response.member ? response.member : response as WorkspaceMember
        ),
        tap((updated) => {
          this.members.update((list) =>
            list.map((m) => (m.userId === userId ? { ...m, role: updated.role } : m))
          );
        })
      );
  }

  removeMember(workspaceId: string, userId: string): Observable<{ message: string }> {
    return this.http
      .delete<{ message: string }>(`${this.apiBase}/${workspaceId}/members/${userId}`, {
        headers: this.authService.getAuthHeaders()
      })
      .pipe(
        tap(() => {
          this.members.update((list) => list.filter((m) => m.userId !== userId));
        })
      );
  }
}
