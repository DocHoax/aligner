import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TopBarComponent } from '../../components/top-bar/top-bar.component';
import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { CanvasViewportComponent } from '../../components/canvas-viewport/canvas-viewport.component';
import { PropertiesPanelComponent } from '../../components/properties-panel/properties-panel.component';
import { TextEditorOverlayComponent } from '../../components/text-editor-overlay/text-editor-overlay.component';
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
    TextEditorOverlayComponent
  ],
  template: `
    <div class="relative w-screen h-screen overflow-hidden flex flex-col bg-canvas-bg select-none font-sans text-slate-100">
      <!-- Top Navigation & Actions Bar -->
      <app-top-bar class="shrink-0"></app-top-bar>

      <!-- Main Canvas Workspace Area -->
      <main class="relative flex-1 w-full h-full overflow-hidden">
        <!-- Floating Tools Toolbar -->
        <app-toolbar></app-toolbar>

        <!-- Interactive 2D Canvas Viewport -->
        <app-canvas-viewport></app-canvas-viewport>

        <!-- Right Floating Inspector & Properties Panel -->
        <app-properties-panel></app-properties-panel>

        <!-- Floating Text / Sticky Note Inline Editor -->
        <app-text-editor-overlay></app-text-editor-overlay>
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
  private route = inject(ActivatedRoute);
  private bridge = inject(CanvasEngineBridgeService);
  private boardService = inject(BoardService);

  ngOnInit(): void {
    const boardId = this.route.snapshot.params['boardId'];
    if (boardId) {
      this.boardService.getBoard(boardId).subscribe({
        next: (board) => {
          this.bridge.setDocumentName(board.name);
          this.bridge.collaboration.connect(board.id);
        },
        error: () => {
          // If board fetch fails, fallback to direct room connect
          this.bridge.collaboration.connect(boardId);
        }
      });
    } else {
      this.bridge.collaboration.connect('board_default');
    }
  }

  ngOnDestroy(): void {
    this.bridge.collaboration.disconnect();
  }
}
