import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from '../../services/workspace.service';
import { UserRole } from '../../models/auth.models';

@Component({
  selector: 'app-workspace-members',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen w-full bg-slate-950 flex flex-col text-slate-100 selection:bg-indigo-500 selection:text-white">
      <!-- Top Navigation Header -->
      <header class="h-16 px-6 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-xl flex items-center justify-between shrink-0 sticky top-0 z-30">
        <div class="flex items-center gap-4">
          <a
            routerLink="/workspaces"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-sm font-medium transition-colors text-slate-300 hover:text-white"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            <span>Back to Dashboard</span>
          </a>

          <div class="h-5 w-px bg-slate-800"></div>

          <div>
            <h1 class="text-sm font-semibold text-white">
              {{ workspaceService.currentWorkspace()?.name || 'Workspace' }} &bull; Members
            </h1>
          </div>
        </div>

        <!-- Invite Member Button -->
        @if (isOwner()) {
          <button
            (click)="showInviteModal = true"
            class="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow flex items-center gap-2 transition-colors cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
            <span>Invite Member</span>
          </button>
        }
      </header>

      <!-- Main Content Area -->
      <main class="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8">
        <div class="mb-6">
          <h2 class="text-2xl font-bold tracking-tight text-white">Team Members</h2>
          <p class="text-sm text-slate-400 mt-1">Manage collaborators and role permissions for this workspace.</p>
        </div>

        <!-- Members Table Card -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div class="divide-y divide-slate-800">
            @for (member of members(); track member.userId) {
              <div class="p-4 md:px-6 flex items-center justify-between gap-4">
                <!-- User Info -->
                <div class="flex items-center gap-3.5 min-w-0">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow"
                    [style.background-color]="member.avatarColor || '#6366f1'"
                  >
                    {{ member.displayName.substring(0, 2) }}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-slate-100 truncate">{{ member.displayName }}</p>
                      @if (member.userId === currentUser()?.id) {
                        <span class="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          You
                        </span>
                      }
                    </div>
                    <p class="text-xs text-slate-400 truncate">{{ member.email }}</p>
                  </div>
                </div>

                <!-- Role Selector / Badge -->
                <div class="flex items-center gap-3 shrink-0">
                  @if (isOwner() && member.userId !== currentUser()?.id) {
                    <select
                      [ngModel]="member.role"
                      (ngModelChange)="changeRole(member.userId, $event)"
                      class="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    <button
                      (click)="removeMember(member.userId)"
                      class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove Member"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  } @else {
                    <span
                      class="text-xs font-semibold uppercase px-2.5 py-1 rounded-full border"
                      [class.bg-purple-500-10]="member.role === 'owner'"
                      [class.text-purple-400]="member.role === 'owner'"
                      [class.border-purple-500-30]="member.role === 'owner'"
                      [class.bg-blue-500-10]="member.role === 'editor'"
                      [class.text-blue-400]="member.role === 'editor'"
                      [class.border-blue-500-30]="member.role === 'editor'"
                      [class.bg-slate-800]="member.role === 'viewer'"
                      [class.text-slate-400]="member.role === 'viewer'"
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
      </main>

      <!-- Modal: Invite Member -->
      @if (showInviteModal) {
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 class="text-xl font-bold text-white mb-2">Invite Workspace Member</h3>
            <p class="text-sm text-slate-400 mb-6">Enter their registered email address and assign an access role.</p>

            @if (inviteError()) {
              <div class="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                {{ inviteError() }}
              </div>
            }

            <form (ngSubmit)="submitInvite()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">User Email</label>
                <input
                  type="email"
                  [(ngModel)]="inviteEmail"
                  name="inviteEmail"
                  required
                  placeholder="teammate@company.com"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Role Permission</label>
                <select
                  [(ngModel)]="inviteRole"
                  name="inviteRole"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="editor">Editor (Can create & edit canvas objects)</option>
                  <option value="viewer">Viewer (Read-only view of boards)</option>
                  <option value="owner">Owner (Full workspace administrative access)</option>
                </select>
              </div>

              <div class="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  (click)="showInviteModal = false"
                  class="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!inviteEmail"
                  class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl cursor-pointer"
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
  authService = inject(AuthService);
  workspaceService = inject(WorkspaceService);
  private route = inject(ActivatedRoute);

  currentUser = this.authService.currentUser;
  members = this.workspaceService.members;

  workspaceId = '';
  showInviteModal = false;
  inviteEmail = '';
  inviteRole: UserRole = 'editor';
  inviteError = signal<string>('');

  ngOnInit(): void {
    this.workspaceId = this.route.snapshot.params['workspaceId'];
    if (this.workspaceId) {
      this.workspaceService.getWorkspace(this.workspaceId).subscribe();
      this.workspaceService.loadMembers(this.workspaceId).subscribe();
    }
  }

  isOwner(): boolean {
    const role = this.workspaceService.currentWorkspace()?.userRole;
    return role === 'owner';
  }

  submitInvite(): void {
    if (!this.inviteEmail || !this.workspaceId) return;

    this.inviteError.set('');
    this.workspaceService
      .inviteMember(this.workspaceId, {
        email: this.inviteEmail,
        role: this.inviteRole
      })
      .subscribe({
        next: () => {
          this.showInviteModal = false;
          this.inviteEmail = '';
        },
        error: (err) => {
          this.inviteError.set(err?.error?.error || 'Failed to add member. Please verify the user exists.');
        }
      });
  }

  changeRole(userId: string, newRole: UserRole): void {
    if (!this.workspaceId) return;
    this.workspaceService.updateMemberRole(this.workspaceId, userId, newRole).subscribe();
  }

  removeMember(userId: string): void {
    if (!this.workspaceId) return;
    if (confirm('Are you sure you want to remove this member from the workspace?')) {
      this.workspaceService.removeMember(this.workspaceId, userId).subscribe();
    }
  }
}
