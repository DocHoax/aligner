import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TopBarComponent } from '../../components/top-bar/top-bar.component';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { CanvasViewportComponent } from '../../components/canvas-viewport/canvas-viewport.component';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { TextEditorOverlayComponent } from '../../components/text-editor-overlay/text-editor-overlay.component';
import { BoardService } from '../../services/board.service';
import { CollaborationService } from '../../services/collaboration.service';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-board-canvas',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    ToolbarComponent,
    CanvasViewportComponent,
    PropertiesPanelComponent,
    TextEditorOverlayComponent
  ],
  template: `
    <div class="relative w-screen h-screen overflow-hidden flex flex-col bg-canvas-bg select-none font-sans text-slate-100">
      <!-- Read-only banner for viewers -->
      @if (collaboration.isViewer()) {
        <div class="h-7 bg-amber-950/80 border-b border-amber-800/80 text-amber-200 text-xs px-4 flex items-center justify-between z-40">
          <div class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span class="font-medium">View-Only Mode: You have read-only access to this board and cannot make changes.</span>
          </div>
        </div>
      }

      <!-- Top Navigation & Actions Bar -->
      <app-top-bar class="shrink-0"></app-top-bar>

      <!-- Main Canvas Workspace Area -->
      <main class="relative flex-1 w-full h-full overflow-hidden">
        <!-- Floating Tools Toolbar (hidden in Viewer mode) -->
        @if (!collaboration.isViewer()) {
          <app-toolbar></app-toolbar>
        }

        <!-- Interactive 2D Canvas Viewport -->
        <app-canvas-viewport></app-canvas-viewport>

        <!-- Right Floating Inspector & Properties Panel (hidden in Viewer mode) -->
        @if (!collaboration.isViewer()) {
          <app-properties-panel></app-properties-panel>
        }

        <!-- Floating Text / Sticky Note Inline Editor -->
        @if (!collaboration.isViewer()) {
          <app-text-editor-overlay></app-text-editor-overlay>
        }
      </main>
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
  private readonly router = inject(Router);
  private readonly boardService = inject(BoardService);
  readonly collaboration = inject(CollaborationService);
  private readonly bridge = inject(CanvasEngineBridgeService);

  async ngOnInit(): Promise<void> {
    const boardId = this.route.snapshot.paramMap.get('boardId');
    if (!boardId) {
      this.router.navigate(['/workspaces']);
      return;
    }

    try {
      const board = await this.boardService.getBoard(boardId);
      this.bridge.setDocumentName(board.name);
      this.collaboration.setRoom(boardId, board.userRole || 'editor');
      this.collaboration.connect(undefined, board.userRole || 'editor');
    } catch (err) {
      console.warn('Could not load board metadata from API, continuing with board room connection:', err);
      this.collaboration.setRoom(boardId, 'editor');
      this.collaboration.connect(undefined, 'editor');
    }
  }

  ngOnDestroy(): void {
    this.collaboration.disconnect();
  }
}
