import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { AuthService } from '../../services/auth.service';
import { BoardService } from '../../services/board.service';

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
    <header class="h-12 bg-canvas-panel/95 backdrop-blur-md border-b border-canvas-border px-3 flex items-center justify-between z-30 select-none">
      <!-- Left: Navigation, Logo, File Title & Menu Actions -->
      <div class="flex items-center gap-3">
        <!-- Back to Workspace Link -->
        <a
          routerLink="/workspaces"
          class="p-1.5 rounded-lg hover:bg-canvas-hover text-slate-400 hover:text-white transition flex items-center gap-1 text-xs font-medium"
          title="Back to Workspace Dashboard"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span class="hidden md:inline">Workspaces</span>
        </a>

        <!-- Divider -->
        <div class="h-4 w-px bg-canvas-border"></div>

        <!-- Brand / Logo -->
        <div class="flex items-center gap-2 pr-2 border-r border-canvas-border">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <span class="font-bold text-xs tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent hidden sm:inline">
            Alignify
          </span>
          <span
            class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border"
            [ngClass]="{
              'bg-blue-950/60': userRole() === 'owner',
              'border-blue-800/40': userRole() === 'owner',
              'bg-emerald-950/60': userRole() === 'editor',
              'border-emerald-800/40': userRole() === 'editor'
            }"
            [class.text-blue-400]="userRole() === 'owner'"
            [class.text-emerald-400]="userRole() === 'editor'"
            [class.bg-slate-800]="userRole() === 'viewer'"
            [class.text-slate-300]="userRole() === 'viewer'"
            [class.border-slate-700]="userRole() === 'viewer'"
          >
            {{ userRole() }}
          </span>
        </div>

        <!-- Document Name Inline Editor -->
        <div class="relative flex items-center">
          @if (!isEditingTitle()) {
            <button
              (click)="startEditTitle()"
              [disabled]="bridge.collaboration.isViewer()"
              class="px-2 py-1 rounded text-xs font-medium text-slate-200 hover:bg-canvas-hover hover:text-white transition flex items-center gap-1.5 max-w-[200px] truncate disabled:hover:bg-transparent"
              title="Click to rename diagram"
            >
              <span class="truncate">{{ bridge.documentMeta().name }}</span>
              @if (!bridge.collaboration.isViewer()) {
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
              class="px-2 py-0.5 rounded text-xs bg-canvas-elevated border border-blue-500 text-white focus:outline-none w-[180px]"
            />
          }
        </div>

        <!-- Document File Actions -->
        @if (!bridge.collaboration.isViewer()) {
          <div class="hidden lg:flex items-center gap-1 pl-2 border-l border-canvas-border">
            <button
              (click)="bridge.newDocument()"
              class="px-2.5 py-1 text-xs font-medium rounded text-slate-400 hover:text-slate-100 hover:bg-canvas-hover transition"
            >
              New
            </button>

            <button
              (click)="fileInput.click()"
              class="px-2.5 py-1 text-xs font-medium rounded text-slate-400 hover:text-slate-100 hover:bg-canvas-hover transition"
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
              class="px-2.5 py-1 text-xs font-medium rounded text-slate-400 hover:text-slate-100 hover:bg-canvas-hover transition flex items-center gap-1"
            >
              <span>Save</span>
            </button>
          </div>
        }
      </div>

      <!-- Center: Undo/Redo & Real-Time Room Pill -->
      <div class="flex items-center gap-2">
        <!-- Undo / Redo controls -->
        @if (!bridge.collaboration.isViewer()) {
          <div class="flex items-center gap-0.5 bg-canvas-panel border border-canvas-border rounded-lg p-0.5 shadow-sm">
            <button
              (click)="bridge.undo()"
              [disabled]="!bridge.canUndo()"
              class="p-1.5 rounded text-slate-300 hover:text-white hover:bg-canvas-hover disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition"
              data-tooltip="Undo (Ctrl+Z)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>

            <button
              (click)="bridge.redo()"
              [disabled]="!bridge.canRedo()"
              class="p-1.5 rounded text-slate-300 hover:text-white hover:bg-canvas-hover disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition"
              data-tooltip="Redo (Ctrl+Y)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
          </div>
        }

        <!-- Room Switcher & Share Link -->
        <div class="relative flex items-center bg-canvas-panel border border-canvas-border rounded-lg px-2 py-1 text-xs text-slate-300 gap-2">
          <div class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span class="font-mono text-[11px] text-slate-200 truncate max-w-[120px]">#{{ bridge.collaboration.roomId() }}</span>
          </div>

          <button
            (click)="copyShareLink()"
            class="px-1.5 py-0.5 rounded bg-canvas-elevated hover:bg-canvas-hover text-slate-300 hover:text-white border border-canvas-border transition flex items-center gap-1 text-[11px]"
            title="Copy board invite link"
          >
            @if (copiedInvite()) {
              <svg class="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span class="text-emerald-400">Copied!</span>
            } @else {
              <svg class="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Share</span>
            }
          </button>
        </div>
      </div>

      <!-- Right: Connection Status, Collaborator Stack, User Profile, Zoom & Export -->
      <div class="flex items-center gap-2.5">
        <!-- Live Connection Status Pill -->
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-medium"
          [ngClass]="{
            'bg-emerald-950/40 border-emerald-800/40 text-emerald-400': bridge.collaboration.connectionStatus() === 'CONNECTED',
            'bg-amber-950/40 border-amber-800/40 text-amber-400': bridge.collaboration.connectionStatus() === 'RECONNECTING' || bridge.collaboration.connectionStatus() === 'CONNECTING',
            'bg-rose-950/40 border-rose-800/40 text-rose-400': bridge.collaboration.connectionStatus() === 'DISCONNECTED' || bridge.collaboration.connectionStatus() === 'ERROR'
          }"
          [title]="'WebSocket Status: ' + bridge.collaboration.connectionStatus() + (bridge.collaboration.latencyMs() ? ' (' + bridge.collaboration.latencyMs() + 'ms)' : '')"
        >
          <span
            class="w-2 h-2 rounded-full"
            [ngClass]="{
              'bg-emerald-400 animate-pulse': bridge.collaboration.connectionStatus() === 'CONNECTED',
              'bg-amber-400 animate-ping': bridge.collaboration.connectionStatus() === 'RECONNECTING' || bridge.collaboration.connectionStatus() === 'CONNECTING',
              'bg-rose-400': bridge.collaboration.connectionStatus() === 'DISCONNECTED' || bridge.collaboration.connectionStatus() === 'ERROR'
            }"
          ></span>
          <span class="capitalize">{{ bridge.collaboration.connectionStatus().toLowerCase() }}</span>
          @if (bridge.collaboration.latencyMs() > 0 && bridge.collaboration.isConnected()) {
            <span class="text-[10px] opacity-75 font-mono">{{ bridge.collaboration.latencyMs() }}ms</span>
          }
        </div>

        <!-- Collaborators Avatar Stack -->
        <div class="flex items-center -space-x-1.5 overflow-hidden pl-1">
          @for (user of bridge.collaboration.collaborators().slice(0, 4); track user.userId) {
            <div
              class="w-6 h-6 rounded-full border-2 border-canvas-bg flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition hover:scale-110 hover:z-10 cursor-pointer"
              [style.backgroundColor]="user.userColor"
              [title]="user.userName + ' (Online)'"
            >
              {{ getInitials(user.userName) }}
            </div>
          }

          @if (bridge.collaboration.collaborators().length > 4) {
            <div
              class="w-6 h-6 rounded-full border-2 border-canvas-bg bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-200"
              [title]="bridge.collaboration.collaborators().length - 4 + ' more collaborators'"
            >
              +{{ bridge.collaboration.collaborators().length - 4 }}
            </div>
          }
        </div>

        <!-- Local User Profile Button & Popover -->
        <div class="relative">
          <button
            (click)="toggleProfilePopover()"
            class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-canvas-hover border border-canvas-border transition"
            title="User Profile Menu"
          >
            <div
              class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-inner"
              [style.backgroundColor]="bridge.collaboration.currentUser().userColor"
            >
              {{ getInitials(bridge.collaboration.currentUser().userName) }}
            </div>
            <span class="text-xs font-medium text-slate-200 max-w-[90px] truncate hidden sm:inline">
              {{ bridge.collaboration.currentUser().userName }}
            </span>
          </button>

          <!-- Profile Editor Popover -->
          @if (isProfileOpen()) {
            <div
              (click)="$event.stopPropagation()"
              class="absolute right-0 top-full mt-1.5 w-60 bg-canvas-panel border border-canvas-border rounded-lg shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs"
            >
              <div class="font-semibold text-slate-200 mb-2">Collaborator Profile</div>

              <label class="block text-[11px] text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                [ngModel]="userNameInput()"
                (ngModelChange)="userNameInput.set($event)"
                (blur)="saveUserName()"
                (keydown.enter)="saveUserName()"
                class="w-full px-2 py-1 rounded bg-canvas-elevated border border-canvas-border text-white text-xs focus:outline-none focus:border-blue-500 mb-3"
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

              <div class="border-t border-canvas-border pt-2 mt-2">
                <button
                  (click)="onSignOut()"
                  class="w-full text-left px-2 py-1 rounded hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 text-xs font-medium flex items-center gap-2 transition"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Zoom Controls -->
        <div class="hidden sm:flex items-center bg-canvas-panel border border-canvas-border rounded-lg p-0.5 text-xs font-medium">
          <button
            (click)="bridge.zoomOut()"
            class="p-1.5 rounded hover:bg-canvas-hover text-slate-400 hover:text-slate-100 transition"
            title="Zoom Out"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <button
            (click)="bridge.resetZoom()"
            class="px-2 py-0.5 text-slate-200 hover:text-white hover:bg-canvas-hover rounded transition tabular-nums w-12 text-center"
            title="Reset Zoom (100%)"
          >
            {{ bridge.zoom() }}%
          </button>

          <button
            (click)="bridge.zoomIn()"
            class="p-1.5 rounded hover:bg-canvas-hover text-slate-400 hover:text-slate-100 transition"
            title="Zoom In"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <button
            (click)="bridge.fitToContent()"
            class="p-1.5 ml-0.5 border-l border-canvas-border rounded hover:bg-canvas-hover text-slate-400 hover:text-slate-100 transition"
            title="Fit to Content (Overview)"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6"></path>
              <path d="M9 21H3v-6"></path>
              <path d="M21 3l-7 7"></path>
              <path d="M3 21l7-7"></path>
            </svg>
          </button>
        </div>

        <!-- Export Dropdown -->
        <div class="relative">
          <button
            (click)="toggleExportMenu()"
            class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export</span>
            <svg class="w-3 h-3 ml-0.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <!-- Export Popover Menu -->
          @if (isExportMenuOpen()) {
            <div
              (click)="$event.stopPropagation()"
              class="absolute right-0 mt-1 w-44 bg-canvas-panel border border-canvas-border rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                (click)="exportPNG()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-canvas-hover flex items-center justify-between"
              >
                <span>Export PNG (HiDPI)</span>
                <span class="text-[10px] text-slate-500 font-mono">.png</span>
              </button>
              <button
                (click)="exportSVG()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-canvas-hover flex items-center justify-between"
              >
                <span>Export Vector SVG</span>
                <span class="text-[10px] text-slate-500 font-mono">.svg</span>
              </button>
              <button
                (click)="exportJSON()"
                class="w-full px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-canvas-hover flex items-center justify-between border-t border-canvas-border mt-1 pt-1.5"
              >
                <span>Export Project JSON</span>
                <span class="text-[10px] text-slate-500 font-mono">.json</span>
              </button>
            </div>
          }
        </div>
      </div>
    </header>
  `
})
export class TopBarComponent {
  readonly bridge = inject(CanvasEngineBridgeService);
  private readonly auth = inject(AuthService);
  private readonly boardService = inject(BoardService);
  private readonly router = inject(Router);

  readonly availableColors = AVAILABLE_COLORS;
  readonly userRole = this.bridge.collaboration.userRole;

  readonly isEditingTitle = signal(false);
  readonly titleValue = signal('');
  readonly isExportMenuOpen = signal(false);
  readonly copiedInvite = signal(false);

  readonly isProfileOpen = signal(false);
  readonly userNameInput = signal(this.bridge.collaboration.currentUser().userName);

  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  startEditTitle(): void {
    if (this.bridge.collaboration.isViewer()) return;
    this.titleValue.set(this.bridge.documentMeta().name);
    this.isEditingTitle.set(true);
    setTimeout(() => {
      this.titleInput?.nativeElement.focus();
      this.titleInput?.nativeElement.select();
    }, 50);
  }

  async commitEditTitle(): Promise<void> {
    const val = this.titleValue().trim();
    if (val && val !== this.bridge.documentMeta().name) {
      this.bridge.setDocumentName(val);
      const boardId = this.bridge.collaboration.roomId();
      if (boardId) {
        try {
          await this.boardService.updateBoard(boardId, { name: val });
        } catch (e) {
          console.warn('Failed to update board name on backend:', e);
        }
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

  async copyShareLink(): Promise<void> {
    const link = this.bridge.collaboration.getShareableLink();
    try {
      await navigator.clipboard.writeText(link);
      this.copiedInvite.set(true);
      setTimeout(() => this.copiedInvite.set(false), 2500);
    } catch {
      // Fallback
    }
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

  onSignOut(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
