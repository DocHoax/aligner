import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToolType } from '@alignify/shared-types';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

interface ToolItem {
  type: ToolType;
  label: string;
  hotkey: string;
  icon: string;
}

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="fixed top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-canvas-panel/95 backdrop-blur-lg border border-canvas-borderHighlight/80 rounded-xl p-1.5 shadow-2xl shadow-black/60 select-none">
      @for (tool of tools; track tool.type) {
        <button
          type="button"
          (click)="selectTool(tool.type)"
          [class.bg-blue-600]="bridge.tool() === tool.type"
          [class.text-white]="bridge.tool() === tool.type"
          [class.shadow-md]="bridge.tool() === tool.type"
          [class.text-slate-400]="bridge.tool() !== tool.type"
          class="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 group hover:text-slate-100 hover:bg-canvas-hover"
          [attr.data-tooltip]="tool.label + ' [' + tool.hotkey + ']'"
        >
          <span class="text-xs font-semibold">{{ tool.hotkey }}</span>
          <span class="absolute bottom-0.5 right-1 text-[8px] font-mono leading-none opacity-40 group-hover:opacity-80">
            {{ tool.hotkey }}
          </span>
        </button>
      }
    </nav>
  `,
  styles: []
})
export class ToolbarComponent {
  readonly bridge = inject(CanvasEngineBridgeService);

  readonly tools: ToolItem[] = [
    { type: 'select', label: 'Select & Transform', hotkey: 'V', icon: 'cursor' },
    { type: 'pan', label: 'Pan Canvas', hotkey: 'H', icon: 'hand' },
    { type: 'rectangle', label: 'Rectangle', hotkey: 'R', icon: 'rect' },
    { type: 'ellipse', label: 'Ellipse', hotkey: 'O', icon: 'circle' },
    { type: 'text', label: 'Text Block', hotkey: 'T', icon: 'type' },
    { type: 'sticky', label: 'Sticky Note', hotkey: 'S', icon: 'sticky' },
    { type: 'line', label: 'Line', hotkey: 'L', icon: 'line' },
    { type: 'arrow', label: 'Arrow Connection', hotkey: 'A', icon: 'arrow' }
  ];

  selectTool(type: ToolType): void {
    this.bridge.setTool(type);
  }
}
