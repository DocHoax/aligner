import { Component, OnInit, inject, signal, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkspaceService } from '../../services/workspace.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-share-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100"
        (click)="close()"
        (keydown.escape)="close()"
      >
        <div
          class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100 text-slate-100"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <div>
                <h2 class="text-base font-semibold text-slate-100">Share Board</h2>
                <p class="text-xs text-slate-400">Invite collaborators and manage access permissions</p>
              </div>
            </div>
            <button
              (click)="close()"
              class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="p-6 space-y-6">
            <!-- Copy Link Section -->
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">Board Link</label>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  readonly
                  [value]="shareUrl"
                  class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono select-all focus:outline-none"
                />
                <button
                  (click)="copyLink()"
                  class="px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
                  [class.bg-emerald-600]="copied()"
                  [class.text-white]="copied()"
                  [class.bg-slate-800]="!copied()"
                  [class.text-slate-200]="!copied()"
                  [class.hover:bg-slate-700]="!copied()"
                >
                  @if (copied()) {
                    <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied</span>
                  } @else {
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copy Link</span>
                  }
                </button>
              </div>
            </div>

            <!-- Invite Member Form -->
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">Invite by Email</label>
              <div class="flex items-center gap-2">
                <input
                  type="email"
                  [(ngModel)]="inviteEmail"
                  placeholder="collaborator@company.com"
                  class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <select
                  [(ngModel)]="inviteRole"
                  class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  (click)="inviteMember()"
                  [disabled]="!inviteEmail.trim() || isInviting()"
                  class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Invite
                </button>
              </div>
            </div>

            <!-- Workspace Collaborators List -->
            <div class="space-y-2">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-400">Collaborators & Members</label>
              <div class="bg-slate-950/60 border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800/60">
                @for (member of workspaceService.members(); track member.userId || member.email) {
                  <div class="px-3.5 py-2.5 flex items-center justify-between text-xs">
                    <div class="flex items-center gap-2.5">
                      <div class="w-6 h-6 rounded-full bg-indigo-600/40 border border-indigo-500/40 flex items-center justify-center text-[10px] font-bold text-indigo-300 uppercase">
                        {{ (member.name || member.email || 'U').charAt(0) }}
                      </div>
                      <div>
                        <div class="font-medium text-slate-200">{{ member.name || member.email }}</div>
                        <div class="text-[10px] text-slate-500">{{ member.email }}</div>
                      </div>
                    </div>

                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                      [ngClass]="{
                        'bg-amber-500/20 text-amber-300': member.role === 'owner',
                        'bg-indigo-500/20 text-indigo-300': member.role === 'editor',
                        'bg-slate-800 text-slate-400': member.role === 'viewer'
                      }"
                    >
                      {{ member.role }}
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class ShareDialogComponent implements OnInit {
  readonly workspaceId = input<string>('');
  readonly isOpen = signal(false);
  readonly copied = signal(false);
  readonly isInviting = signal(false);

  inviteEmail = '';
  inviteRole: 'editor' | 'viewer' = 'editor';

  readonly workspaceService = inject(WorkspaceService);
  readonly authService = inject(AuthService);

  get shareUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  ngOnInit(): void {
    if (this.workspaceId()) {
      this.workspaceService.loadMembers(this.workspaceId()).subscribe();
    }
  }

  open(): void {
    this.isOpen.set(true);
    if (this.workspaceId()) {
      this.workspaceService.loadMembers(this.workspaceId()).subscribe();
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  copyLink(): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.shareUrl).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    }
  }

  inviteMember(): void {
    const email = this.inviteEmail.trim();
    const wsId = this.workspaceId();
    if (!email || !wsId || this.isInviting()) return;

    this.isInviting.set(true);
    this.workspaceService.inviteMember(wsId, { email, role: this.inviteRole }).subscribe({
      next: () => {
        this.inviteEmail = '';
        this.isInviting.set(false);
      },
      error: () => this.isInviting.set(false)
    });
  }
}
