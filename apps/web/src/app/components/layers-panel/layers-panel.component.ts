import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { CanvasObject, ToolType } from '@alignify/shared-types';

@Component({
  selector: 'app-layers-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-72 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-100 select-none shadow-xl">
      <!-- Header -->
      <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span class="text-xs font-semibold tracking-wide uppercase text-slate-200">Layers ({{ layers().length }})</span>
        </div>
        <button
          (click)="close.emit()"
          class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          title="Close Layers Panel"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Quick Actions Toolbar -->
      <div class="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40 text-slate-400 text-xs">
        <div class="flex items-center gap-1">
          <button
            (click)="bridge.reorderSelected('bringToFront')"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Bring to Front (])"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 11l7-7 7 7M5 19l7-7 7 7" />
            </svg>
          </button>
          <button
            (click)="bridge.reorderSelected('bringForward')"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Bring Forward"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            (click)="bridge.reorderSelected('sendBackward')"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send Backward"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            (click)="bridge.reorderSelected('sendToBack')"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send to Back ([)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <div class="flex items-center gap-1">
          <button
            (click)="bridge.toggleSelectedLock()"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Toggle Lock (Ctrl+L)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
          <button
            (click)="bridge.deleteSelected()"
            [disabled]="selectedCount() === 0"
            class="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Delete Selected (Del)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Layer Items List (Topmost layer at top of list) -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        @if (layers().length === 0) {
          <div class="p-6 text-center text-slate-500 text-xs">
            No objects on canvas.<br />Draw a shape to create layers.
          </div>
        } @else {
          @for (obj of layers(); track obj.id) {
            <div
              (click)="onSelectLayer(obj, $event)"
              class="w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-colors group"
              [class.bg-indigo-600]="isSelected(obj.id)"
              [class.text-white]="isSelected(obj.id)"
              [class.text-slate-300]="!isSelected(obj.id)"
              [class.hover:bg-slate-800]="!isSelected(obj.id)"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                <!-- Shape Icon -->
                <span
                  class="p-1 rounded shrink-0"
                  [class.bg-indigo-700]="isSelected(obj.id)"
                  [class.bg-slate-800]="!isSelected(obj.id)"
                  [class.text-indigo-200]="isSelected(obj.id)"
                  [class.text-slate-400]="!isSelected(obj.id)"
                >
                  <ng-container [ngSwitch]="obj.type">
                    <svg *ngSwitchCase="'rectangle'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    <svg *ngSwitchCase="'ellipse'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
                    <svg *ngSwitchCase="'text'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                    <svg *ngSwitchCase="'sticky'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <svg *ngSwitchCase="'line'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
                    <svg *ngSwitchCase="'arrow'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    <svg *ngSwitchCase="'frame'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                    <svg *ngSwitchDefault class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </ng-container>
                </span>

                <!-- Layer Name -->
                <span class="truncate font-medium text-xs">{{ getLayerLabel(obj) }}</span>
              </div>

              <!-- Lock State / Hover Actions -->
              <div class="flex items-center gap-1 shrink-0">
                @if (obj.locked) {
                  <span class="text-amber-400 p-0.5" title="Locked">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class LayersPanelComponent {
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly close = output<void>();

  readonly layers = computed(() => {
    // Reverse array so topmost objects (highest z-index) appear at top of list
    return [...this.bridge.allObjects()].reverse();
  });

  readonly selectedCount = computed(() => this.bridge.selectedObjects().length);

  isSelected(id: string): boolean {
    return this.bridge.selectedObjects().some((o) => o.id === id);
  }

  onSelectLayer(obj: CanvasObject, event: MouseEvent): void {
    const isAdditive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.bridge.selectObject(obj.id, isAdditive);
  }

  getLayerLabel(obj: CanvasObject): string {
    const record = obj as Record<string, any>;
    if (record['name']) return record['name'];
    if (record['text']) {
      const textPreview = String(record['text']).trim();
      return textPreview ? (textPreview.length > 18 ? textPreview.slice(0, 18) + '...' : textPreview) : obj.type;
    }
    return `${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)} #${obj.id.slice(-4)}`;
  }
}
