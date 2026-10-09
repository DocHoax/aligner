import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TopBarComponent } from '../../components/top-bar/top-bar.component';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { CanvasViewportComponent } from '../../components/canvas-viewport/canvas-viewport.component';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { TextEditorOverlayComponent } from '../../components/text-editor-overlay/text-editor-overlay.component';
import { LayersPanelComponent } from '../../components/layers-panel/layers-panel.component';
import { CommentsDrawerComponent } from '../../components/comments-drawer/comments-drawer.component';
import { ActivityDrawerComponent } from '../../components/activity-drawer/activity-drawer.component';
import { VersionHistoryDrawerComponent } from '../../components/version-history-drawer/version-history-drawer.component';
import { ShareDialogComponent } from '../../components/share-dialog/share-dialog.component';
import { MinimapComponent } from '../../components/minimap/minimap.component';
import { ContextMenuComponent } from '../../components/context-menu/context-menu.component';
import { CommandPaletteComponent } from '../../components/command-palette/command-palette.component';
import { ShortcutsDialogComponent } from '../../components/shortcuts-dialog/shortcuts-dialog.component';
import { AiAssistantDialogComponent } from '../../components/ai-assistant-dialog/ai-assistant-dialog.component';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { BoardService } from '../../services/board.service';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    ToolbarComponent,
    CanvasViewportComponent,
    PropertiesPanelComponent,
    TextEditorOverlayComponent,
    LayersPanelComponent,
    CommentsDrawerComponent,
    ActivityDrawerComponent,
    VersionHistoryDrawerComponent,
    ShareDialogComponent,
    MinimapComponent,
    ContextMenuComponent,
    CommandPaletteComponent,
    ShortcutsDialogComponent,
    AiAssistantDialogComponent
  ],
  template: `
    <div
      class="relative w-screen h-screen overflow-hidden flex flex-col bg-canvas-bg select-none font-sans text-slate-100"
      (contextmenu)="onContextMenu($event)"
    >
      <!-- Top Navigation & Actions Bar -->
      <app-top-bar
        class="shrink-0"
        (toggleLayers)="toggleLayers()"
        (toggleComments)="toggleComments()"
        (toggleActivity)="toggleActivity()"
        (toggleVersionHistory)="toggleVersionHistory()"
        (toggleShare)="shareDialog?.open()"
        (toggleShortcuts)="shortcutsDialog?.open()"
        (toggleCommandPalette)="commandPalette?.open()"
        (toggleAiAssistant)="aiAssistantDialog?.open()"
      ></app-top-bar>

      <!-- Main Canvas Workspace Area -->
      <main class="relative flex-1 w-full h-full overflow-hidden">
        <!-- Floating Tools Toolbar -->
        <app-toolbar></app-toolbar>

        <!-- Interactive 2D Canvas Viewport -->
        <app-canvas-viewport></app-canvas-viewport>

        <!-- Right Floating Inspector & Properties Panel (Shown when no full drawer is active or side-by-side) -->
        @if (!hasOpenDrawer()) {
          <app-properties-panel></app-properties-panel>
        }

        <!-- Floating Text / Sticky Note Inline Editor -->
        <app-text-editor-overlay></app-text-editor-overlay>

        <!-- Collapsible Minimap Overlay (Bottom Right) -->
        <div class="fixed bottom-4 right-4 z-20">
          <app-minimap></app-minimap>
        </div>

        <!-- Right Side Slide-out Drawers -->
        @if (showLayers()) {
          <div class="fixed top-12 right-0 z-40 h-[calc(100vh-3rem)] animate-in slide-in-from-right duration-200">
            <app-layers-panel (close)="showLayers.set(false)"></app-layers-panel>
          </div>
        }

        @if (showComments()) {
          <div class="fixed top-12 right-0 z-40 h-[calc(100vh-3rem)] animate-in slide-in-from-right duration-200">
            <app-comments-drawer
              [boardId]="currentBoardId()"
              (close)="showComments.set(false)"
              (panTo)="panToLocation($event)"
            ></app-comments-drawer>
          </div>
        }

        @if (showActivity()) {
          <div class="fixed top-12 right-0 z-40 h-[calc(100vh-3rem)] animate-in slide-in-from-right duration-200">
            <app-activity-drawer
              [boardId]="currentBoardId()"
              (close)="showActivity.set(false)"
            ></app-activity-drawer>
          </div>
        }

        @if (showVersionHistory()) {
          <div class="fixed top-12 right-0 z-40 h-[calc(100vh-3rem)] animate-in slide-in-from-right duration-200">
            <app-version-history-drawer
              [boardId]="currentBoardId()"
              (close)="showVersionHistory.set(false)"
              (restored)="onVersionRestored($event)"
            ></app-version-history-drawer>
          </div>
        }
      </main>

      <!-- Global Context Menu -->
      <app-context-menu #contextMenu></app-context-menu>

      <!-- Global Modals -->
      <app-share-dialog #shareDialog [workspaceId]="currentWorkspaceId()"></app-share-dialog>
      <app-shortcuts-dialog #shortcutsDialog></app-shortcuts-dialog>
      <app-command-palette #commandPalette (toggleAiAssistant)="aiAssistantDialog?.open()"></app-command-palette>
      <app-ai-assistant-dialog #aiAssistantDialog [boardId]="currentBoardId()"></app-ai-assistant-dialog>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
      }
    `
  ]
})
export class BoardCanvasComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly boardService = inject(BoardService);

  readonly showLayers = signal(false);
  readonly showComments = signal(false);
  readonly showActivity = signal(false);
  readonly showVersionHistory = signal(false);

  readonly hasOpenDrawer = computed(
    () => this.showLayers() || this.showComments() || this.showActivity() || this.showVersionHistory()
  );

  readonly currentBoardId = signal('');
  readonly currentWorkspaceId = computed(() => this.boardService.currentBoard()?.workspaceId || '');

  @ViewChild('contextMenu') contextMenu?: ContextMenuComponent;
  @ViewChild('shareDialog') shareDialog?: ShareDialogComponent;
  @ViewChild('shortcutsDialog') shortcutsDialog?: ShortcutsDialogComponent;
  @ViewChild('commandPalette') commandPalette?: CommandPaletteComponent;
  @ViewChild('aiAssistantDialog') aiAssistantDialog?: AiAssistantDialogComponent;

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // AI Assistant: Ctrl+Shift+A or Cmd+Shift+A
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.aiAssistantDialog?.open();
      return;
    }

    // Command palette: Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.commandPalette?.open();
      return;
    }

    // Keyboard shortcuts help dialog: ? (Shift+/)
    if (!isInput && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.shortcutsDialog?.open();
      return;
    }
  }

  ngOnInit(): void {
    const boardId = this.route.snapshot.params['boardId'];
    if (boardId) {
      this.currentBoardId.set(boardId);
      this.boardService.getBoard(boardId).subscribe({
        next: (board) => {
          this.bridge.setDocumentName(board.name);
          this.bridge.collaboration.connect(board.id);
        },
        error: () => {
          // Fallback to direct room connection if board record is inaccessible
          this.bridge.collaboration.connect(boardId);
        }
      });
    } else {
      this.currentBoardId.set('board_default');
      this.bridge.collaboration.connect('board_default');
    }
  }

  ngOnDestroy(): void {
    this.bridge.collaboration.disconnect();
  }

  toggleLayers(): void {
    const next = !this.showLayers();
    this.closeAllDrawers();
    this.showLayers.set(next);
  }

  toggleComments(): void {
    const next = !this.showComments();
    this.closeAllDrawers();
    this.showComments.set(next);
  }

  toggleActivity(): void {
    const next = !this.showActivity();
    this.closeAllDrawers();
    this.showActivity.set(next);
  }

  toggleVersionHistory(): void {
    const next = !this.showVersionHistory();
    this.closeAllDrawers();
    this.showVersionHistory.set(next);
  }

  closeAllDrawers(): void {
    this.showLayers.set(false);
    this.showComments.set(false);
    this.showActivity.set(false);
    this.showVersionHistory.set(false);
  }

  onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    // Allow default context menu on inputs
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    e.preventDefault();
    this.contextMenu?.open(e.clientX, e.clientY);
  }

  panToLocation(loc: { x: number; y: number }): void {
    const engine = this.bridge.getEngine();
    if (engine) {
      engine.getCamera().setState({ x: -loc.x, y: -loc.y });
    }
  }

  onVersionRestored(_restoredSeq: number): void {
    // Optionally reload board details or audit log
    const id = this.currentBoardId();
    if (id) {
      this.boardService.getBoard(id).subscribe();
    }
  }
}
