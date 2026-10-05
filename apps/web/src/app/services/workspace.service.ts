import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Workspace, WorkspaceMember } from '../models/auth.models';

const API_BASE = 'http://localhost:8080/api';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private readonly auth = inject(AuthService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly currentWorkspace = signal<Workspace | null>(null);
  readonly members = signal<WorkspaceMember[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  async loadWorkspaces(): Promise<Workspace[]> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const res = await fetch(`${API_BASE}/workspaces`, {
        headers: this.auth.getAuthHeader()
      });

      if (!res.ok) {
        throw new Error('Failed to load workspaces');
      }

      const payload: { workspaces: Workspace[] } = await res.json();
      const list = payload.workspaces;
      this.workspaces.set(list);

      // Default current workspace if none selected
      if (!this.currentWorkspace() && list.length > 0) {
        const stored = this.auth.currentWorkspace();
        const found = stored ? list.find((w) => w.id === stored.id) : null;
        this.selectWorkspace(found || list[0]!);
      }

      return list;
    } catch (err: any) {
      this.error.set(err.message || 'Error loading workspaces');
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  selectWorkspace(workspace: Workspace): void {
    this.currentWorkspace.set(workspace);
    this.auth.setCurrentWorkspace(workspace);
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}`, {
      headers: this.auth.getAuthHeader()
    });

    if (!res.ok) {
      throw new Error('Failed to fetch workspace');
    }

    const payload: { workspace: Workspace } = await res.json();
    const ws = payload.workspace;
    this.currentWorkspace.set(ws);
    return ws;
  }

  async createWorkspace(data: { name: string; description?: string }): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create workspace' }));
      throw new Error(err.error || 'Failed to create workspace');
    }

    const payload: { workspace: Workspace } = await res.json();
    const ws = payload.workspace;
    this.workspaces.update((list) => [ws, ...list]);
    this.selectWorkspace(ws);
    return ws;
  }

  async updateWorkspace(workspaceId: string, data: { name?: string; description?: string }): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update workspace' }));
      throw new Error(err.error || 'Failed to update workspace');
    }

    const payload: { workspace: Workspace } = await res.json();
    const updated = payload.workspace;
    this.workspaces.update((list) => list.map((w) => (w.id === workspaceId ? updated : w)));
    if (this.currentWorkspace()?.id === workspaceId) {
      this.selectWorkspace(updated);
    }
    return updated;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: this.auth.getAuthHeader()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete workspace' }));
      throw new Error(err.error || 'Failed to delete workspace');
    }

    this.workspaces.update((list) => list.filter((w) => w.id !== workspaceId));
    if (this.currentWorkspace()?.id === workspaceId) {
      const remaining = this.workspaces();
      if (remaining.length > 0) {
        this.selectWorkspace(remaining[0]!);
      } else {
        this.currentWorkspace.set(null);
      }
    }
  }

  // --- Member Management ---

  async loadMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    this.isLoading.set(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members`, {
        headers: this.auth.getAuthHeader()
      });

      if (!res.ok) {
        throw new Error('Failed to load members');
      }

      const payload: { members: WorkspaceMember[] } = await res.json();
      const list = payload.members;
      this.members.set(list);
      return list;
    } catch (err: any) {
      this.error.set(err.message || 'Error loading members');
      throw err;
    } finally {
      this.isLoading.set(false);
    }
  }

  async addMember(workspaceId: string, email: string, role: 'owner' | 'editor' | 'viewer'): Promise<WorkspaceMember> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify({ email, role })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add member' }));
      throw new Error(err.error || 'Failed to add member');
    }

    const payload: { member: WorkspaceMember } = await res.json();
    const member = payload.member;
    this.members.update((list) => [...list, member]);
    return member;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: 'owner' | 'editor' | 'viewer'): Promise<WorkspaceMember> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.auth.getAuthHeader()
      },
      body: JSON.stringify({ role })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update member role' }));
      throw new Error(err.error || 'Failed to update member role');
    }

    await res.json();
    await this.loadMembers(workspaceId);
    const updated = this.members().find((member) => member.userId === userId);
    if (!updated) {
      throw new Error('Updated member was not returned by the server');
    }
    return updated;
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
      headers: this.auth.getAuthHeader()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to remove member' }));
      throw new Error(err.error || 'Failed to remove member');
    }

    this.members.update((list) => list.filter((m) => m.userId !== userId));
  }
}
