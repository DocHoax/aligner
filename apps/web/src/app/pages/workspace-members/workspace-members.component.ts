import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from '../../services/workspace.service';
import { WorkspaceMember, UserRole } from '../../models/auth.models';

@Component({
  selector: 'app-workspace-members',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <!-- Top Navigation -->
      <header class="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between z-20">
        <div class="flex items-center gap-4">
          <a
            [routerLink]="['/workspaces', workspaceId()]"
            class="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition flex items-center gap-2 text-sm font-medium"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Back to Boards</span>
          </a>
          <div class="h-5 w-px bg-slate-800"></div>
          <h1 class="text-base font-bold text-white tracking-tight">
            {{ currentWorkspace()?.name || 'Workspace' }} &bull; Members & Access
          </h1>
        </div>
      </header>

      <!-- Main Content -->
      <main class="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 class="text-2xl font-bold text-white tracking-tight">Workspace Members</h2>
            <p class="text-sm text-slate-400 mt-1">
              Manage who has access to this workspace and their role permissions.
            </p>
          </div>

          @if (isOwner()) {
            <button
              (click)="isInviteModalOpen.set(true)"
              class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Member</span>
            </button>
          }
        </div>

        @if (isLoading()) {
          <div class="flex flex-col items-center justify-center py-20 text-slate-500">
            <svg class="animate-spin h-8 w-8 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm">Loading members...</span>
          </div>
        } @else {
          <!-- Member List Card -->
          <div class="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div class="divide-y divide-slate-800/80">
              @for (member of members(); track member.id) {
                <div class="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition">
                  <!-- User Profile Info -->
                  <div class="flex items-center gap-3.5 min-w-0">
                    <div
                      class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow shrink-0"
                      [style.backgroundColor]="member.avatarColor || '#3b82f6'"
                    >
                      {{ getInitials(member.displayName) }}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-white text-sm truncate">{{ member.displayName }}</span>
                        @if (member.userId === currentUser()?.id) {
                          <span class="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                            You
                          </span>
                        }
                      </div>
                      <div class="text-xs text-slate-400 truncate">{{ member.email }}</div>
                    </div>
                  </div>

                  <!-- Role Selector & Actions -->
                  <div class="flex items-center gap-3 shrink-0">
                    @if (isOwner() && member.userId !== currentUser()?.id) {
                      <!-- Role Dropdown for Owner -->
                      <select
                        [ngModel]="member.role"
                        (ngModelChange)="onUpdateRole(member.userId, $event)"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer transition"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>

                      <button
                        (click)="onRemoveMember(member)"
                        title="Remove member"
                        class="p-1.5 rounded-lg hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 transition"
                      >
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    } @else {
                      <!-- Static Role Pill -->
                      <span
                        class="text-xs font-semibold uppercase px-2.5 py-1 rounded-full border"
                        [ngClass]="{
                          'bg-blue-950/60': member.role === 'owner',
                          'border-blue-800/80': member.role === 'owner',
                          'bg-emerald-950/60': member.role === 'editor',
                          'border-emerald-800/80': member.role === 'editor'
                        }"
                        [class.text-blue-300]="member.role === 'owner'"
                        [class.text-emerald-300]="member.role === 'editor'"
                        [class.bg-slate-800]="member.role === 'viewer'"
                        [class.text-slate-300]="member.role === 'viewer'"
                        [class.border-slate-700]="member.role === 'viewer'"
                      >
                        {{ member.role }}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </main>

      <!-- Invite Member Modal -->
      @if (isInviteModalOpen()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-white">Add Member to Workspace</h3>
              <button
                (click)="isInviteModalOpen.set(false)"
                class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            @if (inviteError()) {
              <div class="mb-4 p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <span>{{ inviteError() }}</span>
              </div>
            }

            <form (ngSubmit)="onInvite()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">User Email Address</label>
                <input
                  type="email"
                  [(ngModel)]="inviteEmail"
                  name="inviteEmail"
                  required
                  placeholder="teammate@company.com"
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Role Permission</label>
                <select
                  [(ngModel)]="inviteRole"
                  name="inviteRole"
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 transition"
                >
                  <option value="editor">Editor (Can create & edit boards)</option>
                  <option value="viewer">Viewer (Read-only access)</option>
                  <option value="owner">Owner (Full administrative rights)</option>
                </select>
              </div>

              <div class="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  (click)="isInviteModalOpen.set(false)"
                  class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!inviteEmail.trim() || isSubmitting()"
                  class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition disabled:opacity-50"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `
})
export class WorkspaceMembersComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);

  readonly currentUser = this.auth.currentUser;
  readonly members = this.workspaceService.members;
  readonly currentWorkspace = this.workspaceService.currentWorkspace;

  readonly workspaceId = signal<string>('');
  readonly isOwner = computed(() => {
    const ws = this.currentWorkspace();
    return ws?.userRole === 'owner' || ws?.ownerId === this.currentUser()?.id;
  });

  isLoading = signal(false);
  isSubmitting = signal(false);
  isInviteModalOpen = signal(false);

  inviteEmail = '';
  inviteRole: UserRole = 'editor';
  inviteError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const wsId = this.route.snapshot.paramMap.get('workspaceId');
    if (!wsId) return;
    this.workspaceId.set(wsId);

    this.isLoading.set(true);
    try {
      if (!this.currentWorkspace() || this.currentWorkspace()?.id !== wsId) {
        await this.workspaceService.getWorkspace(wsId);
      }
      await this.workspaceService.loadMembers(wsId);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  getInitials(name: string): string {
    return (name || 'U')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  async onInvite(): Promise<void> {
    if (!this.inviteEmail.trim()) return;

    this.isSubmitting.set(true);
    this.inviteError.set(null);

    try {
      await this.workspaceService.addMember(this.workspaceId(), this.inviteEmail.trim(), this.inviteRole);
      this.isInviteModalOpen.set(false);
      this.inviteEmail = '';
      this.inviteRole = 'editor';
    } catch (err: any) {
      this.inviteError.set(err.message || 'Failed to add member. Check that the user exists.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onUpdateRole(userId: string, newRole: UserRole): Promise<void> {
    try {
      await this.workspaceService.updateMemberRole(this.workspaceId(), userId, newRole);
    } catch (err: any) {
      alert(err.message || 'Failed to update member role');
    }
  }

  async onRemoveMember(member: WorkspaceMember): Promise<void> {
    if (!confirm(`Are you sure you want to remove ${member.displayName} from this workspace?`)) return;

    try {
      await this.workspaceService.removeMember(this.workspaceId(), member.userId);
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  }
}
