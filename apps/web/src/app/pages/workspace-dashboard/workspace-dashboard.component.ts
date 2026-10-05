import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from '../../services/workspace.service';
import { BoardService } from '../../services/board.service';
import { Workspace, Board } from '../../models/auth.models';

@Component({
  selector: 'app-workspace-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen w-full bg-slate-950 flex flex-col text-slate-100 selection:bg-indigo-500 selection:text-white">
      <!-- Top Navigation Header -->
      <header class="h-16 px-6 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-xl flex items-center justify-between shrink-0 sticky top-0 z-30">
        <div class="flex items-center gap-4">
          <!-- Logo -->
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span class="font-bold text-lg tracking-tight text-white">Alignify</span>
          </div>

          <div class="h-5 w-px bg-slate-800"></div>

          <!-- Workspace Selector Dropdown -->
          <div class="relative">
            <button
              (click)="isWsDropdownOpen = !isWsDropdownOpen"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-sm font-medium transition-colors"
            >
              <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
              <span class="max-w-[160px] truncate">{{ activeWorkspace()?.name || 'Select Workspace' }}</span>
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            @if (isWsDropdownOpen) {
              <div
                (click)="isWsDropdownOpen = false"
                class="fixed inset-0 z-40"
              ></div>
              <div class="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50">
                <div class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Workspaces
                </div>
                @for (ws of workspaceService.workspaces(); track ws.id) {
                  <button
                    (click)="selectWorkspace(ws)"
                    class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between hover:bg-slate-800 transition-colors"
                    [class.bg-slate-800]="ws.id === activeWorkspace()?.id"
                  >
                    <span class="truncate">{{ ws.name }}</span>
                    <span class="text-xs px-2 py-0.5 rounded uppercase font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                      {{ ws.userRole || 'member' }}
                    </span>
                  </button>
                }
                <div class="my-1 border-t border-slate-800"></div>
                <button
                  (click)="openCreateWsModal(); isWsDropdownOpen = false"
                  class="w-full text-left px-3 py-2 rounded-lg text-sm text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-2 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  <span>New Workspace</span>
                </button>
              </div>
            }
          </div>
        </div>

        <!-- User Profile & Action Menu -->
        <div class="flex items-center gap-4">
          @if (activeWorkspace()) {
            <a
              [routerLink]="['/workspaces', activeWorkspace()?.id, 'members']"
              class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 flex items-center gap-2 transition-colors"
            >
              <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
              <span>Manage Members</span>
            </a>
          }

          <!-- User Avatar & Dropdown -->
          <div class="relative">
            <button
              (click)="isUserDropdownOpen = !isUserDropdownOpen"
              class="flex items-center gap-2.5 p-1 rounded-full hover:bg-slate-800 transition-colors"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white uppercase shadow"
                [style.background-color]="currentUser()?.avatarColor || '#6366f1'"
              >
                {{ currentUser()?.displayName?.substring(0, 2) || 'U' }}
              </div>
            </button>

            @if (isUserDropdownOpen) {
              <div
                (click)="isUserDropdownOpen = false"
                class="fixed inset-0 z-40"
              ></div>
              <div class="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50">
                <div class="px-3 py-2 border-b border-slate-800 mb-1">
                  <p class="text-sm font-semibold text-slate-100 truncate">{{ currentUser()?.displayName }}</p>
                  <p class="text-xs text-slate-400 truncate">{{ currentUser()?.email }}</p>
                </div>
                <button
                  (click)="logout()"
                  class="w-full text-left px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            }
          </div>
        </div>
      </header>

      <!-- Main Workspace Boards Content -->
      <main class="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        <!-- Workspace Banner / Controls -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-bold tracking-tight text-white">{{ activeWorkspace()?.name || 'Workspace' }}</h1>
              @if (activeWorkspace()?.userRole) {
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {{ activeWorkspace()?.userRole }}
                </span>
              }
            </div>
            <p class="text-slate-400 text-sm mt-1">{{ activeWorkspace()?.description || 'Collaborative canvas boards' }}</p>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-3">
            @if (canCreateBoard()) {
              <button
                (click)="openCreateBoardModal()"
                class="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                <span>New Board</span>
              </button>
            }
          </div>
        </div>

        <!-- Boards Grid -->
        @if (boardService.loading()) {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            @for (i of [1,2,3]; track i) {
              <div class="h-48 rounded-2xl bg-slate-900 border border-slate-800"></div>
            }
          </div>
        } @else if (boards().length === 0) {
          <div class="rounded-2xl border-2 border-dashed border-slate-800 p-12 text-center flex flex-col items-center justify-center">
            <div class="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
              <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-slate-200">No boards created yet</h3>
            <p class="text-sm text-slate-400 mt-1 max-w-sm">Create your first collaborative whiteboard canvas to start designing with your team.</p>
            @if (canCreateBoard()) {
              <button
                (click)="openCreateBoardModal()"
                class="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all"
              >
                Create Board
              </button>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @for (board of boards(); track board.id) {
              <div
                class="group relative bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div>
                  <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>
                      </svg>
                    </div>
                    @if (canDeleteBoard(board)) {
                      <button
                        (click)="deleteBoard(board.id, $event)"
                        class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title="Delete Board"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    }
                  </div>

                  <h3 class="text-base font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    {{ board.name }}
                  </h3>
                  <p class="text-xs text-slate-400 mt-1 line-clamp-2">
                    {{ board.description || 'No description provided' }}
                  </p>
                </div>

                <div class="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <span class="text-xs text-slate-500">
                    Created {{ formatDate(board.createdAt) }}
                  </span>
                  <a
                    [routerLink]="['/boards', board.id]"
                    class="px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <span>Open Canvas</span>
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </a>
                </div>
              </div>
            }
          </div>
        }
      </main>

      <!-- Modal: Create Workspace -->
      @if (showCreateWsModal) {
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 class="text-xl font-bold text-white mb-2">Create Workspace</h3>
            <p class="text-sm text-slate-400 mb-6">Workspaces contain your team's collaborative canvas boards.</p>

            <form (ngSubmit)="submitCreateWs()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Workspace Name</label>
                <input
                  type="text"
                  [(ngModel)]="newWsName"
                  name="wsName"
                  required
                  placeholder="e.g. Design Systems"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Description (Optional)</label>
                <textarea
                  [(ngModel)]="newWsDesc"
                  name="wsDesc"
                  rows="3"
                  placeholder="Workspace purpose or team details"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  (click)="showCreateWsModal = false"
                  class="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!newWsName"
                  class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Modal: Create Board -->
      @if (showCreateBoardModal) {
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 class="text-xl font-bold text-white mb-2">Create New Board</h3>
            <p class="text-sm text-slate-400 mb-6">Create an infinite collaborative canvas board in {{ activeWorkspace()?.name }}.</p>

            <form (ngSubmit)="submitCreateBoard()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Board Name</label>
                <input
                  type="text"
                  [(ngModel)]="newBoardName"
                  name="bName"
                  required
                  placeholder="e.g. Architecture Roadmap"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Description (Optional)</label>
                <textarea
                  [(ngModel)]="newBoardDesc"
                  name="bDesc"
                  rows="3"
                  placeholder="What is this board for?"
                  class="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  (click)="showCreateBoardModal = false"
                  class="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!newBoardName"
                  class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `
})
export class WorkspaceDashboardComponent implements OnInit {
  authService = inject(AuthService);
  workspaceService = inject(WorkspaceService);
  boardService = inject(BoardService);

  currentUser = this.authService.currentUser;
  activeWorkspace = this.workspaceService.currentWorkspace;
  boards = this.boardService.boards;

  isWsDropdownOpen = false;
  isUserDropdownOpen = false;
  showCreateWsModal = false;
  showCreateBoardModal = false;

  newWsName = '';
  newWsDesc = '';
  newBoardName = '';
  newBoardDesc = '';

  ngOnInit(): void {
    this.workspaceService.loadWorkspaces().subscribe({
      next: (workspaces) => {
        if (workspaces && workspaces.length > 0 && workspaces[0]) {
          this.selectWorkspace(workspaces[0]);
        }
      }
    });
  }

  selectWorkspace(ws: Workspace): void {
    this.workspaceService.currentWorkspace.set(ws);
    this.boardService.loadBoards(ws.id).subscribe();
  }

  canCreateBoard(): boolean {
    const role = this.activeWorkspace()?.userRole;
    return role === 'owner' || role === 'editor';
  }

  canDeleteBoard(board: Board): boolean {
    const role = this.activeWorkspace()?.userRole;
    if (role === 'owner') return true;
    if (role === 'editor' && board.createdBy === this.currentUser()?.id) return true;
    return false;
  }

  openCreateWsModal(): void {
    this.newWsName = '';
    this.newWsDesc = '';
    this.showCreateWsModal = true;
  }

  submitCreateWs(): void {
    if (!this.newWsName) return;
    this.workspaceService.createWorkspace({ name: this.newWsName, description: this.newWsDesc }).subscribe({
      next: (ws) => {
        this.showCreateWsModal = false;
        this.selectWorkspace(ws);
      }
    });
  }

  openCreateBoardModal(): void {
    this.newBoardName = '';
    this.newBoardDesc = '';
    this.showCreateBoardModal = true;
  }

  submitCreateBoard(): void {
    const ws = this.activeWorkspace();
    if (!ws || !this.newBoardName) return;

    this.boardService.createBoard(ws.id, { name: this.newBoardName, description: this.newBoardDesc }).subscribe({
      next: () => {
        this.showCreateBoardModal = false;
      }
    });
  }

  deleteBoard(boardId: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this board?')) {
      this.boardService.deleteBoard(boardId).subscribe();
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  logout(): void {
    this.authService.logout();
  }
}
