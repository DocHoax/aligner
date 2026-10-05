import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from '../../services/workspace.service';
import { BoardService } from '../../services/board.service';
import { Workspace } from '../../models/auth.models';

@Component({
  selector: 'app-workspace-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <!-- Top Navigation Bar -->
      <header class="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between z-20">
        <div class="flex items-center gap-6">
          <!-- Logo -->
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20">
              <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
            <span class="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Alignify
            </span>
          </div>

          <!-- Divider -->
          <div class="h-5 w-px bg-slate-800"></div>

          <!-- Workspace Selector Dropdown -->
          <div class="relative">
            <button
              (click)="isWorkspaceMenuOpen.set(!isWorkspaceMenuOpen())"
              class="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-sm font-medium text-slate-200 transition"
            >
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>{{ currentWorkspace()?.name || 'Select Workspace' }}</span>
              <svg class="w-4 h-4 text-slate-400 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            @if (isWorkspaceMenuOpen()) {
              <div
                class="absolute left-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-30 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <div class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Workspaces
                </div>
                @for (ws of workspaces(); track ws.id) {
                  <button
                    (click)="onSelectWorkspace(ws)"
                    class="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 text-sm flex items-center justify-between text-slate-300 hover:text-white transition"
                    [ngClass]="{ 'bg-blue-600/10': ws.id === currentWorkspace()?.id }"
                    [class.text-blue-400]="ws.id === currentWorkspace()?.id"
                  >
                    <span class="truncate font-medium">{{ ws.name }}</span>
                    @if (ws.id === currentWorkspace()?.id) {
                      <svg class="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    }
                  </button>
                }
                <div class="my-1.5 border-t border-slate-800"></div>
                <button
                  (click)="openNewWorkspaceModal()"
                  class="w-full text-left px-3.5 py-2 hover:bg-slate-800/80 text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-2 transition"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Create Workspace</span>
                </button>
              </div>
            }
          </div>
        </div>

        <!-- User Profile & Navigation -->
        <div class="flex items-center gap-4">
          @if (currentWorkspace()) {
            <a
              [routerLink]="['/workspaces', currentWorkspace()?.id, 'members']"
              class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition"
            >
              <svg class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span>Members</span>
            </a>
          }

          <!-- User Avatar Menu Button -->
          <div class="relative">
            <button
              (click)="isUserMenuOpen.set(!isUserMenuOpen())"
              class="flex items-center gap-2.5 p-1 rounded-full hover:ring-2 hover:ring-slate-700 transition"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
                [style.backgroundColor]="currentUser()?.avatarColor || '#3b82f6'"
              >
                {{ getUserInitials() }}
              </div>
            </button>

            @if (isUserMenuOpen()) {
              <div
                class="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-30 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <div class="px-4 py-2 border-b border-slate-800">
                  <div class="text-sm font-semibold text-white truncate">{{ currentUser()?.displayName }}</div>
                  <div class="text-xs text-slate-400 truncate">{{ currentUser()?.email }}</div>
                </div>
                <button
                  (click)="onLogout()"
                  class="w-full text-left px-4 py-2 hover:bg-rose-950/40 text-xs font-medium text-rose-400 hover:text-rose-300 flex items-center gap-2 transition"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            }
          </div>
        </div>
      </header>

      <!-- Main Workspace View -->
      <main class="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        @if (isLoading()) {
          <div class="flex flex-col items-center justify-center py-24 text-slate-500">
            <svg class="animate-spin h-8 w-8 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm">Loading workspace boards...</span>
          </div>
        } @else {
          <!-- Header Actions -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <div class="flex items-center gap-3">
                <h1 class="text-2xl font-bold text-white tracking-tight">
                  {{ currentWorkspace()?.name || 'Workspace' }}
                </h1>
                <span
                  class="text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full border"
                  [ngClass]="{
                    'bg-blue-950/60': currentRole() === 'owner',
                    'border-blue-800/80': currentRole() === 'owner',
                    'bg-emerald-950/60': currentRole() === 'editor',
                    'border-emerald-800/80': currentRole() === 'editor'
                  }"
                  [class.text-blue-300]="currentRole() === 'owner'"
                  [class.text-emerald-300]="currentRole() === 'editor'"
                  [class.bg-slate-800]="currentRole() === 'viewer'"
                  [class.text-slate-300]="currentRole() === 'viewer'"
                  [class.border-slate-700]="currentRole() === 'viewer'"
                >
                  {{ currentRole() }}
                </span>
              </div>
              <p class="text-sm text-slate-400 mt-1">
                {{ currentWorkspace()?.description || 'Collaborative visual workspace for diagrams and architecture.' }}
              </p>
            </div>

            <div class="flex items-center gap-3">
              @if (currentRole() !== 'viewer') {
                <button
                  (click)="isCreateBoardModalOpen.set(true)"
                  class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition duration-150"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>New Board</span>
                </button>
              }
            </div>
          </div>

          <!-- Board Gallery Grid -->
          @if (boards().length === 0) {
            <div class="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
              <div class="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-4">
                <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
              </div>
              <h3 class="text-base font-semibold text-white mb-1">No boards in this workspace</h3>
              <p class="text-sm text-slate-400 mb-6 max-w-sm text-center">
                Create your first visual board to start designing diagrams and collaborating with your team.
              </p>
              @if (currentRole() !== 'viewer') {
                <button
                  (click)="isCreateBoardModalOpen.set(true)"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md transition"
                >
                  Create First Board
                </button>
              }
            </div>
          } @else {
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              @for (board of boards(); track board.id) {
                <div
                  (click)="navigateToBoard(board.id)"
                  class="group relative bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer flex flex-col hover:shadow-xl hover:shadow-blue-950/20 hover:-translate-y-0.5"
                >
                  <!-- Thumbnail Banner Placeholder -->
                  <div class="h-36 bg-gradient-to-br from-slate-800 to-slate-900 border-b border-slate-800/80 p-4 flex flex-col justify-between relative overflow-hidden">
                    <div class="absolute -right-8 -top-8 w-28 h-28 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition"></div>

                    <div class="flex items-center justify-between z-10">
                      <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700">
                        {{ board.isPublic ? 'Public' : 'Workspace' }}
                      </span>

                      <!-- Delete board button (for Owner / creator) -->
                      @if (currentRole() === 'owner') {
                        <button
                          type="button"
                          (click)="$event.stopPropagation(); onDeleteBoard(board.id)"
                          title="Delete Board"
                          class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 transition"
                        >
                          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      }
                    </div>

                    <!-- Diagram Icon Accent -->
                    <div class="flex items-center justify-center my-auto text-slate-600 group-hover:text-blue-400 transition duration-200">
                      <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                        <polyline points="2 17 12 22 22 17"></polyline>
                        <polyline points="2 12 12 17 22 12"></polyline>
                      </svg>
                    </div>
                  </div>

                  <!-- Details -->
                  <div class="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 class="font-semibold text-white text-base truncate group-hover:text-blue-300 transition">
                        {{ board.name }}
                      </h4>
                      <p class="text-xs text-slate-400 line-clamp-2 mt-1 min-h-[32px]">
                        {{ board.description || 'No description provided' }}
                      </p>
                    </div>

                    <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                      <span>Updated {{ formatDate(board.updatedAt) }}</span>
                      <div class="flex items-center gap-1 text-blue-400 font-medium group-hover:translate-x-1 transition duration-150">
                        <span>Open</span>
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        }
      </main>

      <!-- Create Board Modal -->
      @if (isCreateBoardModalOpen()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-white">Create New Board</h3>
              <button
                (click)="isCreateBoardModalOpen.set(false)"
                class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form (ngSubmit)="onCreateBoard()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Board Title</label>
                <input
                  type="text"
                  [(ngModel)]="newBoardName"
                  name="newBoardName"
                  required
                  placeholder="System Architecture 2026"
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Description (optional)</label>
                <textarea
                  [(ngModel)]="newBoardDescription"
                  name="newBoardDescription"
                  rows="3"
                  placeholder="Brief description of this visual workspace..."
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  (click)="isCreateBoardModalOpen.set(false)"
                  class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!newBoardName.trim() || isSubmitting()"
                  class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition disabled:opacity-50"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Create Workspace Modal -->
      @if (isCreateWorkspaceModalOpen()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-white">Create New Workspace</h3>
              <button
                (click)="isCreateWorkspaceModalOpen.set(false)"
                class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form (ngSubmit)="onCreateWorkspace()" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Workspace Name</label>
                <input
                  type="text"
                  [(ngModel)]="newWorkspaceName"
                  name="newWorkspaceName"
                  required
                  placeholder="Platform Engineering"
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Description (optional)</label>
                <textarea
                  [(ngModel)]="newWorkspaceDesc"
                  name="newWorkspaceDesc"
                  rows="3"
                  placeholder="Workspace for platform architecture diagrams..."
                  class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none"
                ></textarea>
              </div>

              <div class="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  (click)="isCreateWorkspaceModalOpen.set(false)"
                  class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  [disabled]="!newWorkspaceName.trim() || isSubmitting()"
                  class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg shadow-md transition disabled:opacity-50"
                >
                  Create Workspace
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
  private readonly auth = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly boardService = inject(BoardService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly currentUser = this.auth.currentUser;
  readonly workspaces = this.workspaceService.workspaces;
  readonly currentWorkspace = this.workspaceService.currentWorkspace;
  readonly boards = this.boardService.boards;

  readonly currentRole = computed(() => this.currentWorkspace()?.userRole || 'owner');

  isLoading = signal(false);
  isSubmitting = signal(false);
  isWorkspaceMenuOpen = signal(false);
  isUserMenuOpen = signal(false);
  isCreateBoardModalOpen = signal(false);
  isCreateWorkspaceModalOpen = signal(false);

  newBoardName = '';
  newBoardDescription = '';

  newWorkspaceName = '';
  newWorkspaceDesc = '';

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    try {
      const list = await this.workspaceService.loadWorkspaces();
      const workspaceIdParam = this.route.snapshot.paramMap.get('workspaceId');

      let targetWorkspace = list[0];
      if (workspaceIdParam) {
        targetWorkspace = list.find((w) => w.id === workspaceIdParam) || targetWorkspace;
      }

      if (targetWorkspace) {
        this.workspaceService.selectWorkspace(targetWorkspace);
        await this.boardService.loadWorkspaceBoards(targetWorkspace.id);
      }
    } catch (err) {
      console.error('Failed to load workspace data:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  getUserInitials(): string {
    const name = this.currentUser()?.displayName || 'User';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  async onSelectWorkspace(ws: Workspace): Promise<void> {
    this.isWorkspaceMenuOpen.set(false);
    this.workspaceService.selectWorkspace(ws);
    this.isLoading.set(true);
    try {
      await this.boardService.loadWorkspaceBoards(ws.id);
    } finally {
      this.isLoading.set(false);
    }
  }

  openNewWorkspaceModal(): void {
    this.isWorkspaceMenuOpen.set(false);
    this.newWorkspaceName = '';
    this.newWorkspaceDesc = '';
    this.isCreateWorkspaceModalOpen.set(true);
  }

  async onCreateWorkspace(): Promise<void> {
    if (!this.newWorkspaceName.trim()) return;
    this.isSubmitting.set(true);
    try {
      const ws = await this.workspaceService.createWorkspace({
        name: this.newWorkspaceName.trim(),
        description: this.newWorkspaceDesc.trim()
      });
      this.isCreateWorkspaceModalOpen.set(false);
      await this.boardService.loadWorkspaceBoards(ws.id);
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onCreateBoard(): Promise<void> {
    const ws = this.currentWorkspace();
    if (!ws || !this.newBoardName.trim()) return;

    this.isSubmitting.set(true);
    try {
      const board = await this.boardService.createBoard(ws.id, {
        name: this.newBoardName.trim(),
        description: this.newBoardDescription.trim()
      });
      this.isCreateBoardModalOpen.set(false);
      this.newBoardName = '';
      this.newBoardDescription = '';
      this.router.navigate(['/boards', board.id]);
    } catch (err: any) {
      alert(err.message || 'Failed to create board');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onDeleteBoard(boardId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this board? This action cannot be undone.')) return;

    try {
      await this.boardService.deleteBoard(boardId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete board');
    }
  }

  navigateToBoard(boardId: string): void {
    this.router.navigate(['/boards', boardId]);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  onLogout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
