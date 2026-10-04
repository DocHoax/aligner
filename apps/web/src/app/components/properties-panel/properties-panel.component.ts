import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CanvasObject, TextObject, StickyNoteObject } from '@alignify/shared-types';
import { COLOR_PALETTE, STROKE_WIDTH_PRESETS, FONT_SIZE_PRESETS } from '@alignify/ui';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (bridge.selectedCount() > 0) {
      <aside class="fixed top-16 right-4 z-20 w-72 max-h-[calc(100vh-5rem)] overflow-y-auto bg-canvas-panel/95 backdrop-blur-lg border border-canvas-borderHighlight rounded-2xl p-4 shadow-2xl shadow-black/60 flex flex-col gap-4 text-xs select-none animate-in fade-in slide-in-from-right-4 duration-150">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-canvas-border pb-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span class="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">
              @if (bridge.selectedCount() === 1) {
                {{ singleObject()?.type }} Properties
              } @else {
                {{ bridge.selectedCount() }} Objects Selected
              }
            </span>
          </div>

          <!-- Quick Actions: Duplicate & Delete -->
          <div class="flex items-center gap-1">
            <button
              (click)="bridge.reorderSelected('bringToFront')"
              class="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-canvas-hover transition"
              title="Bring to Front"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
              </svg>
            </button>
            <button
              (click)="bridge.reorderSelected('sendToBack')"
              class="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-canvas-hover transition"
              title="Send to Back"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 12 17 2 12"></polyline>
                <polygon points="12 22 22 17 12 12 2 17 12 22"></polygon>
              </svg>
            </button>
            <button
              (click)="bridge.deleteSelected()"
              class="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-950/40 transition ml-1"
              title="Delete Selected (Del)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Geometry (Single item) -->
        @if (singleObject(); as obj) {
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center bg-canvas-elevated rounded-lg px-2 py-1.5 border border-canvas-border">
              <span class="text-slate-500 font-mono text-[10px] w-4">X</span>
              <input
                type="number"
                [ngModel]="Math.round(obj.x)"
                (ngModelChange)="updateProp('x', +$event)"
                class="bg-transparent text-slate-200 text-xs w-full focus:outline-none text-right font-mono"
              />
            </div>
            <div class="flex items-center bg-canvas-elevated rounded-lg px-2 py-1.5 border border-canvas-border">
              <span class="text-slate-500 font-mono text-[10px] w-4">Y</span>
              <input
                type="number"
                [ngModel]="Math.round(obj.y)"
                (ngModelChange)="updateProp('y', +$event)"
                class="bg-transparent text-slate-200 text-xs w-full focus:outline-none text-right font-mono"
              />
            </div>
            <div class="flex items-center bg-canvas-elevated rounded-lg px-2 py-1.5 border border-canvas-border">
              <span class="text-slate-500 font-mono text-[10px] w-4">W</span>
              <input
                type="number"
                [ngModel]="Math.round(obj.width)"
                (ngModelChange)="updateProp('width', Math.max(10, +$event))"
                class="bg-transparent text-slate-200 text-xs w-full focus:outline-none text-right font-mono"
              />
            </div>
            <div class="flex items-center bg-canvas-elevated rounded-lg px-2 py-1.5 border border-canvas-border">
              <span class="text-slate-500 font-mono text-[10px] w-4">H</span>
              <input
                type="number"
                [ngModel]="Math.round(obj.height)"
                (ngModelChange)="updateProp('height', Math.max(10, +$event))"
                class="bg-transparent text-slate-200 text-xs w-full focus:outline-none text-right font-mono"
              />
            </div>
          </div>
        }

        <!-- Fill Color Section -->
        @if (showFillSection()) {
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-slate-400 font-medium">
              <span>Fill Color</span>
              <button
                (click)="updateFill('transparent')"
                class="text-[10px] text-blue-400 hover:underline"
              >
                None
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5 items-center">
              @for (color of colorPalette; track color) {
                <button
                  (click)="updateFill(color)"
                  [style.backgroundColor]="color"
                  [class.ring-2]="currentFill() === color"
                  [class.ring-blue-500]="currentFill() === color"
                  [class.ring-offset-1]="currentFill() === color"
                  [class.ring-offset-slate-900]="currentFill() === color"
                  class="w-5 h-5 rounded-md border border-slate-700 hover:scale-110 transition shadow-sm"
                  [title]="color"
                ></button>
              }
              <input
                type="color"
                [ngModel]="currentFill() !== 'transparent' ? currentFill() : '#3b82f6'"
                (ngModelChange)="updateFill($event)"
                class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Custom Color"
              />
            </div>
          </div>
        }

        <!-- Stroke Color & Width Section -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-slate-400 font-medium">
            <span>Stroke Color</span>
            <button
              (click)="updateStroke('transparent')"
              class="text-[10px] text-blue-400 hover:underline"
            >
              None
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5 items-center">
            @for (color of colorPalette; track color) {
              <button
                (click)="updateStroke(color)"
                [style.backgroundColor]="color"
                [class.ring-2]="currentStroke() === color"
                [class.ring-blue-500]="currentStroke() === color"
                [class.ring-offset-1]="currentStroke() === color"
                [class.ring-offset-slate-900]="currentStroke() === color"
                class="w-5 h-5 rounded-md border border-slate-700 hover:scale-110 transition shadow-sm"
                [title]="color"
              ></button>
            }
            <input
              type="color"
              [ngModel]="currentStroke() !== 'transparent' ? currentStroke() : '#ffffff'"
              (ngModelChange)="updateStroke($event)"
              class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
              title="Custom Stroke Color"
            />
          </div>

          <!-- Stroke Width Presets -->
          <div class="flex items-center gap-1 mt-2">
            <span class="text-slate-400 mr-2 text-[11px]">Width:</span>
            @for (w of strokeWidthPresets; track w) {
              <button
                (click)="updateStrokeWidth(w)"
                [class.bg-blue-600]="currentStrokeWidth() === w"
                [class.text-white]="currentStrokeWidth() === w"
                [class.bg-canvas-elevated]="currentStrokeWidth() !== w"
                [class.text-slate-300]="currentStrokeWidth() !== w"
                class="px-2.5 py-1 rounded-md text-[11px] font-mono border border-canvas-border hover:bg-canvas-hover transition"
              >
                {{ w }}px
              </button>
            }
          </div>

          <!-- Stroke Style Presets -->
          <div class="flex items-center gap-1 mt-1.5">
            <span class="text-slate-400 mr-2 text-[11px]">Style:</span>
            <button
              (click)="updateStrokeStyle('solid')"
              [class.bg-blue-600]="currentStrokeStyle() === 'solid'"
              [class.text-white]="currentStrokeStyle() === 'solid'"
              [class.bg-canvas-elevated]="currentStrokeStyle() !== 'solid'"
              [class.text-slate-300]="currentStrokeStyle() !== 'solid'"
              class="px-2 py-1 rounded-md text-[10px] font-medium border border-canvas-border hover:bg-canvas-hover transition flex-1"
            >
              Solid
            </button>
            <button
              (click)="updateStrokeStyle('dashed')"
              [class.bg-blue-600]="currentStrokeStyle() === 'dashed'"
              [class.text-white]="currentStrokeStyle() === 'dashed'"
              [class.bg-canvas-elevated]="currentStrokeStyle() !== 'dashed'"
              [class.text-slate-300]="currentStrokeStyle() !== 'dashed'"
              class="px-2 py-1 rounded-md text-[10px] font-medium border border-canvas-border hover:bg-canvas-hover transition flex-1"
            >
              Dashed
            </button>
            <button
              (click)="updateStrokeStyle('dotted')"
              [class.bg-blue-600]="currentStrokeStyle() === 'dotted'"
              [class.text-white]="currentStrokeStyle() === 'dotted'"
              [class.bg-canvas-elevated]="currentStrokeStyle() !== 'dotted'"
              [class.text-slate-300]="currentStrokeStyle() !== 'dotted'"
              class="px-2 py-1 rounded-md text-[10px] font-medium border border-canvas-border hover:bg-canvas-hover transition flex-1"
            >
              Dotted
            </button>
          </div>
        </div>

        <!-- Opacity Slider -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-slate-400">
            <span>Opacity</span>
            <span class="font-mono text-slate-200">{{ Math.round(currentOpacity() * 100) }}%</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            [ngModel]="currentOpacity()"
            (ngModelChange)="updateOpacity(+$event)"
            class="w-full accent-blue-500 bg-canvas-elevated h-1.5 rounded-lg cursor-pointer"
          />
        </div>

        <!-- Text / Sticky Specific Options -->
        @if (isTextType()) {
          <div class="flex flex-col gap-2 border-t border-canvas-border pt-3">
            <span class="text-slate-400 font-medium">Typography</span>
            <div class="flex items-center gap-1.5 flex-wrap">
              @for (size of fontSizePresets; track size) {
                <button
                  (click)="updateFontSize(size)"
                  [class.bg-blue-600]="currentFontSize() === size"
                  [class.text-white]="currentFontSize() === size"
                  [class.bg-canvas-elevated]="currentFontSize() !== size"
                  [class.text-slate-300]="currentFontSize() !== size"
                  class="px-2 py-0.5 rounded text-[10px] font-mono border border-canvas-border hover:bg-canvas-hover transition"
                >
                  {{ size }}
                </button>
              }
            </div>

            <!-- Alignment -->
            <div class="flex items-center gap-1 mt-1">
              <button
                (click)="updateAlign('left')"
                [class.bg-blue-600]="currentAlign() === 'left'"
                [class.text-white]="currentAlign() === 'left'"
                [class.bg-canvas-elevated]="currentAlign() !== 'left'"
                class="flex-1 py-1 rounded border border-canvas-border flex items-center justify-center hover:bg-canvas-hover"
                title="Align Left"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="17" y1="10" x2="3" y2="10"></line>
                  <line x1="21" y1="6" x2="3" y2="6"></line>
                  <line x1="21" y1="14" x2="3" y2="14"></line>
                  <line x1="17" y1="18" x2="3" y2="18"></line>
                </svg>
              </button>
              <button
                (click)="updateAlign('center')"
                [class.bg-blue-600]="currentAlign() === 'center'"
                [class.text-white]="currentAlign() === 'center'"
                [class.bg-canvas-elevated]="currentAlign() !== 'center'"
                class="flex-1 py-1 rounded border border-canvas-border flex items-center justify-center hover:bg-canvas-hover"
                title="Align Center"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="10" x2="6" y2="10"></line>
                  <line x1="21" y1="6" x2="3" y2="6"></line>
                  <line x1="21" y1="14" x2="3" y2="14"></line>
                  <line x1="18" y1="18" x2="6" y2="18"></line>
                </svg>
              </button>
              <button
                (click)="updateAlign('right')"
                [class.bg-blue-600]="currentAlign() === 'right'"
                [class.text-white]="currentAlign() === 'right'"
                [class.bg-canvas-elevated]="currentAlign() !== 'right'"
                class="flex-1 py-1 rounded border border-canvas-border flex items-center justify-center hover:bg-canvas-hover"
                title="Align Right"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="21" y1="10" x2="7" y2="10"></line>
                  <line x1="21" y1="6" x2="3" y2="6"></line>
                  <line x1="21" y1="14" x2="3" y2="14"></line>
                  <line x1="21" y1="18" x2="7" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        }

        <!-- Layering Section -->
        <div class="flex flex-col gap-1.5 border-t border-canvas-border pt-3">
          <span class="text-slate-400 font-medium">Layer Order</span>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              (click)="bridge.reorderSelected('bringForward')"
              class="px-2 py-1.5 rounded-lg bg-canvas-elevated hover:bg-canvas-hover border border-canvas-border text-slate-300 hover:text-white transition text-left flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
              <span>Bring Forward</span>
            </button>
            <button
              (click)="bridge.reorderSelected('sendBackward')"
              class="px-2 py-1.5 rounded-lg bg-canvas-elevated hover:bg-canvas-hover border border-canvas-border text-slate-300 hover:text-white transition text-left flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Send Backward</span>
            </button>
          </div>
        </div>
      </aside>
    }
  `,
  styles: []
})
export class PropertiesPanelComponent {
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly Math = Math;

  readonly colorPalette = COLOR_PALETTE;
  readonly strokeWidthPresets = STROKE_WIDTH_PRESETS;
  readonly fontSizePresets = FONT_SIZE_PRESETS;

  readonly singleObject = computed(() => this.bridge.singleSelectedObject());

  readonly showFillSection = computed(() => {
    const obj = this.singleObject();
    if (!obj) return true;
    return obj.type !== 'line' && obj.type !== 'arrow';
  });

  readonly isTextType = computed(() => {
    const obj = this.singleObject();
    return obj?.type === 'text' || obj?.type === 'sticky';
  });

  readonly currentFill = computed(() => {
    const obj = this.singleObject();
    return obj && 'fillColor' in obj ? obj.fillColor : '#3b82f6';
  });

  readonly currentStroke = computed(() => {
    const obj = this.singleObject();
    return obj && 'strokeColor' in obj ? obj.strokeColor : '#ffffff';
  });

  readonly currentStrokeWidth = computed(() => {
    const obj = this.singleObject();
    return obj && 'strokeWidth' in obj ? obj.strokeWidth : 2;
  });

  readonly currentStrokeStyle = computed(() => {
    const obj = this.singleObject();
    return obj && 'strokeStyle' in obj ? obj.strokeStyle : 'solid';
  });

  readonly currentOpacity = computed(() => {
    const obj = this.singleObject();
    return obj ? obj.opacity : 1;
  });

  readonly currentFontSize = computed(() => {
    const obj = this.singleObject() as TextObject | StickyNoteObject | null;
    return obj && 'fontSize' in obj ? obj.fontSize : 16;
  });

  readonly currentAlign = computed(() => {
    const obj = this.singleObject() as TextObject | StickyNoteObject | null;
    return obj && 'align' in obj ? obj.align : 'center';
  });

  updateProp(key: keyof CanvasObject, value: unknown): void {
    this.bridge.updateSelectedProperties({ [key]: value });
  }

  updateFill(fill: string): void {
    this.bridge.updateSelectedStyle({ fillColor: fill });
  }

  updateStroke(stroke: string): void {
    this.bridge.updateSelectedStyle({ strokeColor: stroke });
  }

  updateStrokeWidth(strokeWidth: number): void {
    this.bridge.updateSelectedStyle({ strokeWidth });
  }

  updateStrokeStyle(strokeStyle: 'solid' | 'dashed' | 'dotted'): void {
    this.bridge.updateSelectedStyle({ strokeStyle });
  }

  updateOpacity(opacity: number): void {
    this.bridge.updateSelectedProperties({ opacity });
  }

  updateFontSize(fontSize: number): void {
    this.bridge.updateSelectedProperties({ fontSize } as Partial<CanvasObject>);
  }

  updateAlign(align: 'left' | 'center' | 'right'): void {
    this.bridge.updateSelectedProperties({ align } as Partial<CanvasObject>);
  }
}
