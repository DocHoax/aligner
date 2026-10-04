import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopBarComponent } from './components/top-bar/top-bar.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { CanvasViewportComponent } from './components/canvas-viewport/canvas-viewport.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';
import { TextEditorOverlayComponent } from './components/text-editor-overlay/text-editor-overlay.component';

@Component({
  selector: 'app-root',
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
export class AppComponent {}
