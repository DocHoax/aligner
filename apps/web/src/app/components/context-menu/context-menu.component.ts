import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div
        class="fixed z-50 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1.5 w-56 text-slate-100 select-none animate-in fade-in duration-75 text-xs divide-y divide-slate-800/60"
        [style.left.px]="x()"
        [style.top.px]="y()"
        (click)="$event.stopPropagation()"
      >
        <!-- Selection Edit Group -->
        @if (selectedCount() > 0) {
          <div class="py-1">
            <button
              (click)="onReorder('bringToFront')"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Bring to Front</span>
              <kbd class="text-[10px] font-mono text-slate-400">]</kbd>
            </button>
            <button
              (click)="onReorder('bringForward')"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Bring Forward</span>
            </button>
            <button
              (click)="onReorder('sendBackward')"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Send Backward</span>
            </button>
            <button
              (click)="onReorder('sendToBack')"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Send to Back</span>
              <kbd class="text-[10px] font-mono text-slate-400">[</kbd>
            </button>
          </div>

          <!-- Alignment Group (multi-select) -->
          @if (selectedCount() > 1) {
            <div class="py-1">
              <div class="px-3 py-1 text-[10px] uppercase font-semibold text-slate-500">Align</div>
              <div class="grid grid-cols-3 gap-1 px-2 py-1">
                <button
                  (click)="onAlign('left')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Left
                </button>
                <button
                  (click)="onAlign('center')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Center
                </button>
                <button
                  (click)="onAlign('right')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Right
                </button>
                <button
                  (click)="onAlign('top')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Top
                </button>
                <button
                  (click)="onAlign('middle')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Middle
                </button>
                <button
                  (click)="onAlign('bottom')"
                  class="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-center text-[10px]"
                >
                  Bottom
                </button>
              </div>
            </div>
          }

          <!-- Lock & Delete -->
          <div class="py-1">
            <button
              (click)="onToggleLock()"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Toggle Lock</span>
              <kbd class="text-[10px] font-mono text-slate-400">Ctrl+L</kbd>
            </button>
            <button
              (click)="onDelete()"
              class="w-full px-3 py-1.5 flex items-center justify-between text-red-400 hover:bg-red-600 hover:text-white transition-colors"
            >
              <span>Delete Selected</span>
              <kbd class="text-[10px] font-mono">Del</kbd>
            </button>
          </div>
        } @else {
          <!-- Viewport Global Actions -->
          <div class="py-1">
            <button
              (click)="onSelectAll()"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Select All</span>
              <kbd class="text-[10px] font-mono text-slate-400">Ctrl+A</kbd>
            </button>
            <button
              (click)="onFitContent()"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Fit View to Content</span>
              <kbd class="text-[10px] font-mono text-slate-400">Shift+1</kbd>
            </button>
            <button
              (click)="onResetZoom()"
              class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Reset Zoom (100%)</span>
              <kbd class="text-[10px] font-mono text-slate-400">Ctrl+0</kbd>
            </button>
          </div>
        }
      </div>
    }
  `
})
export class ContextMenuComponent implements OnInit, OnDestroy {
  readonly bridge = inject(CanvasEngineBridgeService);

  readonly isOpen = signal(false);
  readonly x = signal(0);
  readonly y = signal(0);

  readonly selectedCount = computed(() => this.bridge.selectedObjects().length);

  private documentClickListener = () => {
    if (this.isOpen()) {
      this.close();
    }
  };

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('click', this.documentClickListener);
      window.addEventListener('contextmenu', this.documentClickListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', this.documentClickListener);
      window.removeEventListener('contextmenu', this.documentClickListener);
    }
  }

  open(clientX: number, clientY: number): void {
    // Keep context menu within viewport bounds
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

    this.x.set(Math.min(clientX, screenW - 240));
    this.y.set(Math.min(clientY, screenH - 300));
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  onReorder(action: 'bringToFront' | 'sendToBack' | 'bringForward' | 'sendBackward'): void {
    this.bridge.reorderSelected(action);
    this.close();
  }

  onAlign(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    this.bridge.alignSelected(alignment);
    this.close();
  }

  onToggleLock(): void {
    this.bridge.toggleSelectedLock();
    this.close();
  }

  onDelete(): void {
    this.bridge.deleteSelected();
    this.close();
  }

  onSelectAll(): void {
    this.bridge.selectAll();
    this.close();
  }

  onFitContent(): void {
    this.bridge.fitToContent();
    this.close();
  }

  onResetZoom(): void {
    this.bridge.resetZoom();
    this.close();
  }
}
