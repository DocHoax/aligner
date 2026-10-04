import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-canvas-viewport',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full h-full overflow-hidden bg-canvas-bg select-none">
      <canvas
        #canvasElement
        class="w-full h-full block touch-none focus:outline-none"
        tabindex="0"
      ></canvas>

      <!-- Status HUD in bottom left -->
      <div
        class="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 rounded-md bg-canvas-panel/80 backdrop-blur-md border border-canvas-border text-[11px] text-slate-400 font-mono shadow-lg pointer-events-none"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>{{ bridge.statusMessage() }}</span>
        <span class="text-slate-600">|</span>
        <span>Zoom: {{ bridge.zoom() }}%</span>
        @if (bridge.selectedCount() > 0) {
          <span class="text-slate-600">|</span>
          <span class="text-blue-400">{{ bridge.selectedCount() }} selected</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
    `
  ]
})
export class CanvasViewportComponent implements AfterViewInit, OnDestroy {
  readonly bridge = inject(CanvasEngineBridgeService);

  @ViewChild('canvasElement')
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.bridge.attach(canvas);

    // Watch parent container size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.bridge.getEngine().getRenderer().updateSize();
    });

    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.bridge.detach();
  }
}
