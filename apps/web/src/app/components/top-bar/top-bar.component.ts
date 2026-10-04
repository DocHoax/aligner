import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="h-12 bg-canvas-panel/90 backdrop-blur-md border-b border-canvas-border px-3 flex items-center justify-between z-30 select-none">
      <!-- Left: Logo & File Title & Menus -->
      <div class="flex items-center gap-3">
        <!-- Logo / Brand -->
        <div class="flex items-center gap-2 pr-2 border-r border-canvas-border">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <span class="font-bold text-sm tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Alignify
          </span>
          <span class="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40">
            v1.0
          </span>
        </div>

        <!-- Document Name Editor -->
        <div class="relative flex items-center">
          @if (!isEditingTitle()) {
            <button
              (click)="startEditTitle()"
              class="px-2 py-1 rounded text-xs font-medium text-slate-200 hover:bg-canvas-hover hover:text-white transition flex items-center gap-1.5 max-w-[220px] truncate"
              title="Click to rename document"
            >
              <span class="truncate">{{ bridge.documentMeta().name }}</span>
              <svg class="w-3 h-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
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
              class="px-2 py-0.5 rounded text-xs bg-canvas-elevated border border-blue-500 text-white focus:outline-none w-[200px]"
            />
          }
        </div>

        <!-- Menu Action Buttons -->
        <div class="hidden md:flex items-center gap-1 pl-2 border-l border-canvas-border">
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
      </div>

      <!-- Center: Undo/Redo & Quick History -->
      <div class="flex items-center gap-1 bg-canvas-panel border border-canvas-border rounded-lg p-0.5 shadow-sm">
        <button
          (click)="bridge.undo()"
          [disabled]="!bridge.canUndo()"
          class="p-1.5 rounded text-slate-300 hover:text-white hover:bg-canvas-hover disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition"
          data-tooltip="Undo (Ctrl+Z)"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>

      <!-- Right: Zoom Controls, Export Dropdown, Status & Presence -->
      <div class="flex items-center gap-2">
        <!-- Zoom controls -->
        <div class="flex items-center bg-canvas-panel border border-canvas-border rounded-lg p-0.5 text-xs font-medium">
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

        <!-- Export Action Buttons -->
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
  `,
  styles: []
})
export class TopBarComponent {
  readonly bridge = inject(CanvasEngineBridgeService);

  readonly isEditingTitle = signal(false);
  readonly titleValue = signal('');
  readonly isExportMenuOpen = signal(false);

  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;

  startEditTitle(): void {
    this.titleValue.set(this.bridge.documentMeta().name);
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
    }
    this.isEditingTitle.set(false);
  }

  cancelEditTitle(): void {
    this.isEditingTitle.set(false);
  }

  toggleExportMenu(): void {
    this.isExportMenuOpen.update((v) => !v);
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
