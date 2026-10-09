import { Component, ElementRef, ViewChild, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { AuthService } from '../../services/auth.service';
import { BoardService } from '../../services/board.service';
import { CommentService } from '../../services/comment.service';

const AVAILABLE_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#e11d48'  // Rose
];

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="h-12 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 flex items-center justify-between z-30 select-none">
      <!-- Left: Navigation, Brand, Board Rename & File Menu -->
      <div class="flex items-center gap-3">
        <!-- Back to Workspace Link -->
        <a
          routerLink="/workspaces"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Back to Dashboard"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          <span class="hidden md:inline">Dashboard</span>
        </a>

        <div class="h-4 w-px bg-slate-800"></div>

        <!-- Brand / Logo -->
        <div class="flex items-center gap-2 pr-2 border-r border-slate-800">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <span class="font-bold text-sm tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Alignify
          </span>
          <!-- Role Badge -->
          <span
            class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border"
            [ngClass]="{
              'bg-purple-950/60 text-purple-400 border-purple-800/40': boardService.currentBoardRole() === 'owner',
              'bg-blue-950/60 text-blue-400 border-blue-800/40': boardService.currentBoardRole() === 'editor',
              'bg-slate-800 text-slate-400 border-slate-700': boardService.currentBoardRole() === 'viewer'
            }"
          >
            {{ boardService.currentBoardRole() }}
          </span>
        </div>

        <!-- Document Name Inline Editor -->
        <div class="relative flex items-center">
          @if (!isEditingTitle()) {
            <button
              (click)="startEditTitle()"
              class="px-2 py-1 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5 max-w-[200px] truncate"
              title="Click to rename board"
            >
              <span class="truncate">{{ boardService.currentBoard()?.name || bridge.documentMeta().name }}</span>
              @if (boardService.currentBoardRole() !== 'viewer') {
                <svg class="w-3 h-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              }
            </button>
          } @else {
            <input
              #titleInput
              type="text"
              [ngModel]="titleValue()"
              (ngModelChange)="titleValue.set($event)"
              (blur)="commitEditTitle()"
              (keydown.enter)="commitEditTitle()"
              (keydown.escape)="cancelEditTitle()"
              class="px-2 py-0.5 rounded text-xs bg-slate-950 border border-indigo-500 text-white focus:outline-none w-[180px]"
            />
          }
        </div>

        <!-- Read Only Warning for Viewers -->
        @if (boardService.currentBoardRole() === 'viewer') {
          <div class="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span>View Only</span>
          </div>
        }

        <!-- Document File Actions -->
        @if (boardService.currentBoardRole() !== 'viewer') {
          <div class="hidden xl:flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              (click)="bridge.newDocument()"
              class="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            >
              New
            </button>

            <button
              (click)="fileInput.click()"
              class="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            >
              Open JSON
            </button>
            <input
              #fileInput
              type="file"
              accept=".json"
              (change)="onFileSelected($event)"
              class="hidden"
            />

            <button
              (click)="bridge.saveDocument()"
              class="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition flex items-center gap-1"
            >
              <span>Save</span>
            </button>
          </div>
        }
      </div>

      <!-- Center: Undo/Redo & Quick Tools / Command Palette -->
      <div class="flex items-center gap-2">
        <!-- Undo / Redo controls -->
        @if (boardService.currentBoardRole() !== 'viewer') {
          <div class="flex items-center gap-0.5 bg-slate-950/60 border border-slate-800 rounded-lg p-0.5 shadow-sm">
            <button
              (click)="bridge.undo()"
              [disabled]="!bridge.canUndo()"
              class="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition"
              title="Undo (Ctrl+Z)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>

            <button
              (click)="bridge.redo()"
              [disabled]="!bridge.canRedo()"
              class="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition"
              title="Redo (Ctrl+Y)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
          </div>
        }

        <!-- Command Palette Trigger Button -->
        <button
          (click)="toggleCommandPalette.emit()"
          class="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition text-xs shadow-sm"
          title="Search actions and commands (Ctrl+K)"
        >
          <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span class="text-[11px]">Command Palette</span>
          <kbd class="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[10px] font-mono border border-slate-700">Ctrl+K</kbd>
        </button>

        <!-- AI Architecture Assistant Button -->
        <button
          (click)="toggleAiAssistant.emit()"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-600/90 via-purple-600/90 to-pink-600/90 hover:from-indigo-500 hover:to-purple-500 text-white transition text-xs font-semibold shadow-md shadow-indigo-500/20 border border-indigo-400/30"
          title="Open AI Architecture Assistant (Ctrl+Shift+A)"
        >
          <svg class="w-3.5 h-3.5 text-pink-200 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          </svg>
          <span class="text-[11px] tracking-tight">AI Assistant</span>
          <span class="hidden lg:inline-block px-1 py-0.2 rounded text-[9px] font-mono bg-white/20 text-white font-bold">⌘A</span>
        </button>

        <!-- Room Indicator -->
        <div class="relative hidden md:flex items-center bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 gap-1.5">
          <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span class="font-mono text-[11px] text-slate-200">#{{ bridge.collaboration.roomId() }}</span>
        </div>
      </div>

      <!-- Right: Drawers (Layers, Comments, Activity, History), Collaborators, Share, Export, Profile -->
      <div class="flex items-center gap-2">
        <!-- Feature Drawer Toggles Group -->
        <div class="flex items-center bg-slate-950/60 border border-slate-800 rounded-lg p-0.5 gap-0.5">
          <!-- Layers Toggle -->
          <button
            (click)="toggleLayers.emit()"
            class="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Layers & Hierarchy"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>

          <!-- Comments Toggle -->
          <button
            (click)="toggleComments.emit()"
            class="relative p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Comments & Discussion"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            @if (commentService.comments().length > 0) {
              <span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                {{ commentService.comments().length }}
              </span>
            }
          </button>

          <!-- Activity Feed Toggle -->
          <button
            (click)="toggleActivity.emit()"
            class="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Activity Audit Log"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <!-- Version History Toggle -->
          <button
            (click)="toggleVersionHistory.emit()"
            class="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Version History Snapshots"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <!-- Collaborators Avatar Stack -->
        <div class="hidden sm:flex items-center -space-x-1.5 overflow-hidden pl-1">
          @for (user of bridge.collaboration.collaborators().slice(0, 4); track user.userId) {
            <div
              class="w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition hover:scale-110 hover:z-10 cursor-pointer"
              [style.backgroundColor]="user.userColor"
              [title]="user.userName + ' (Online)'"
            >
              {{ getInitials(user.userName) }}
            </div>
          }

          @if (bridge.collaboration.collaborators().length > 4) {
            <div
              class="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-200"
              [title]="bridge.collaboration.collaborators().length - 4 + ' more collaborators'"
            >
              +{{ bridge.collaboration.collaborators().length - 4 }}
            </div>
          }
        </div>

        <!-- Share Button -->
        <button
          (click)="toggleShare.emit()"
          class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          title="Share Board & Manage Collaborators"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span class="hidden md:inline">Share</span>
        </button>

        <!-- Shortcuts Modal Trigger -->
        <button
          (click)="toggleShortcuts.emit()"
          class="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Keyboard Shortcuts (?)"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        <!-- Export Dropdown -->
        <div class="relative">
          <button
            (click)="toggleExportMenu()"
            class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="hidden lg:inline">Export</span>
            <svg class="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <!-- Export Popover Menu -->
          @if (isExportMenuOpen()) {
            <div
              (click)="$event.stopPropagation()"
              class="absolute right-0 mt-1 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                (click)="exportPNG()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between"
              >
                <span>Export PNG (HiDPI)</span>
                <span class="text-[10px] text-slate-500 font-mono">.png</span>
              </button>
              <button
                (click)="exportSVG()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between"
              >
                <span>Export Vector SVG</span>
                <span class="text-[10px] text-slate-500 font-mono">.svg</span>
              </button>
              <button
                (click)="exportJSON()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between border-t border-slate-800 mt-1 pt-1.5"
              >
                <span>Export Project JSON</span>
                <span class="text-[10px] text-slate-500 font-mono">.json</span>
              </button>
            </div>
          }
        </div>

        <!-- Local User Profile Button & Popover -->
        <div class="relative">
          <button
            (click)="toggleProfilePopover()"
            class="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-800 border border-slate-800 transition"
            title="User Profile & Settings"
          >
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-inner"
              [style.backgroundColor]="bridge.collaboration.currentUser().userColor"
            >
              {{ getInitials(bridge.collaboration.currentUser().userName) }}
            </div>
          </button>

          <!-- Profile Editor Popover -->
          @if (isProfileOpen()) {
            <div
              (click)="$event.stopPropagation()"
              class="absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs"
            >
              <div class="font-semibold text-slate-200 mb-2">Collaborator Profile</div>

              <label class="block text-[11px] text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                [ngModel]="userNameInput()"
                (ngModelChange)="userNameInput.set($event)"
                (blur)="saveUserName()"
                (keydown.enter)="saveUserName()"
                class="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 mb-3"
              />

              <label class="block text-[11px] text-slate-400 mb-1.5">Avatar & Cursor Color</label>
              <div class="grid grid-cols-5 gap-1.5 mb-3">
                @for (color of availableColors; track color) {
                  <button
                    (click)="pickColor(color)"
                    class="w-7 h-7 rounded-md border-2 transition flex items-center justify-center"
                    [style.backgroundColor]="color"
                    [class.border-white]="bridge.collaboration.currentUser().userColor === color"
                    [class.border-transparent]="bridge.collaboration.currentUser().userColor !== color"
                  >
                    @if (bridge.collaboration.currentUser().userColor === color) {
                      <svg class="w-3.5 h-3.5 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    }
                  </button>
                }
              </div>

              <div class="border-t border-slate-800 pt-2 flex justify-between items-center">
                <a
                  routerLink="/workspaces"
                  class="text-[11px] text-slate-400 hover:text-white"
                >
                  Workspaces
                </a>
                <button
                  (click)="logout()"
                  class="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                >
                  Sign Out
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </header>
  `
})
export class TopBarComponent {
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly authService = inject(AuthService);
  readonly boardService = inject(BoardService);
  readonly commentService = inject(CommentService);
  readonly availableColors = AVAILABLE_COLORS;

  readonly toggleLayers = output<void>();
  readonly toggleComments = output<void>();
  readonly toggleActivity = output<void>();
  readonly toggleVersionHistory = output<void>();
  readonly toggleShare = output<void>();
  readonly toggleShortcuts = output<void>();
  readonly toggleCommandPalette = output<void>();
  readonly toggleAiAssistant = output<void>();

  readonly isEditingTitle = signal(false);
  readonly titleValue = signal('');
  readonly isExportMenuOpen = signal(false);
  readonly isProfileOpen = signal(false);
  readonly userNameInput = signal(this.bridge.collaboration.currentUser().userName);

  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  startEditTitle(): void {
    if (this.boardService.currentBoardRole() === 'viewer') return;
    const currentName = this.boardService.currentBoard()?.name || this.bridge.documentMeta().name;
    this.titleValue.set(currentName);
    this.isEditingTitle.set(true);
    setTimeout(() => {
      this.titleInput?.nativeElement.focus();
      this.titleInput?.nativeElement.select();
    }, 50);
  }

  commitEditTitle(): void {
    const val = this.titleValue().trim();
    if (val) {
      this.bridge.setDocumentName(val);
      const board = this.boardService.currentBoard();
      if (board) {
        this.boardService.updateBoard(board.id, { name: val }).subscribe();
      }
    }
    this.isEditingTitle.set(false);
  }

  cancelEditTitle(): void {
    this.isEditingTitle.set(false);
  }

  toggleExportMenu(): void {
    this.isExportMenuOpen.update((v) => !v);
    this.isProfileOpen.set(false);
  }

  toggleProfilePopover(): void {
    this.userNameInput.set(this.bridge.collaboration.currentUser().userName);
    this.isProfileOpen.update((v) => !v);
    this.isExportMenuOpen.set(false);
  }

  saveUserName(): void {
    const name = this.userNameInput().trim();
    if (name) {
      this.bridge.collaboration.setUserName(name);
    }
  }

  pickColor(color: string): void {
    this.bridge.collaboration.setUserColor(color);
  }

  logout(): void {
    this.authService.logout();
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  exportPNG(): void {
    this.bridge.exportPNG();
    this.isExportMenuOpen.set(false);
  }

  exportSVG(): void {
    this.bridge.exportSVG();
    this.isExportMenuOpen.set(false);
  }

  exportJSON(): void {
    this.bridge.exportJSON();
    this.isExportMenuOpen.set(false);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      await this.bridge.loadFromJSON(text);
    } catch (err) {
      console.error('Failed to parse board document JSON:', err);
    } finally {
      input.value = '';
    }
  }
}
