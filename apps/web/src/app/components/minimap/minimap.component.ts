import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { CanvasObject, Bounds } from '@alignify/shared-types';

@Component({
  selector: 'app-minimap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl shadow-2xl overflow-hidden select-none transition-all duration-200"
      [class.w-48]="!isCollapsed()"
      [class.w-auto]="isCollapsed()"
    >
      <!-- Header / Toggle -->
      <div class="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
        <span class="font-semibold uppercase tracking-wider text-[10px] text-slate-300">Minimap</span>
        <button
          (click)="isCollapsed.set(!isCollapsed())"
          class="p-0.5 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
          [title]="isCollapsed() ? 'Expand Minimap' : 'Collapse Minimap'"
        >
          <svg
            class="w-3.5 h-3.5 transition-transform"
            [class.rotate-180]="isCollapsed()"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <!-- Minimap Canvas Container -->
      @if (!isCollapsed()) {
        <div class="p-2 relative flex items-center justify-center bg-slate-950/60">
          <canvas
            #minimapCanvas
            width="176"
            height="110"
            (mousedown)="onMouseDown($event)"
            class="w-[176px] h-[110px] rounded border border-slate-800 cursor-crosshair bg-slate-900"
          ></canvas>
        </div>
      }
    </div>
  `
})
export class MinimapComponent implements AfterViewInit, OnDestroy {
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly isCollapsed = signal(false);

  @ViewChild('minimapCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private animFrameId: number | null = null;
  private isDragging = false;

  constructor() {
    effect(() => {
      // Trigger redraw on object changes or camera changes
      this.bridge.allObjects();
      this.bridge.cameraState();
      this.drawMinimap();
    });
  }

  ngAfterViewInit(): void {
    this.drawMinimap();
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  drawMinimap(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    const objects = this.bridge.allObjects();
    const camera = this.bridge.cameraState();

    // Calculate canvas bounding box
    let minX = -1000;
    let minY = -800;
    let maxX = 1000;
    let maxY = 800;

    for (const obj of objects) {
      const b = (obj as any).bounds || { x: obj.x || 0, y: obj.y || 0, width: obj.width || 100, height: obj.height || 100 };
      minX = Math.min(minX, b.x - 200);
      minY = Math.min(minY, b.y - 200);
      maxX = Math.max(maxX, b.x + b.width + 200);
      maxY = Math.max(maxY, b.y + b.height + 200);
    }

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;

    const scale = Math.min(w / worldW, h / worldH);
    const offsetX = (w - worldW * scale) / 2;
    const offsetY = (h - worldH * scale) / 2;

    const toMiniX = (wx: number) => offsetX + (wx - minX) * scale;
    const toMiniY = (wy: number) => offsetY + (wy - minY) * scale;

    // Draw grid bounds
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(toMiniX(-500), toMiniY(-400), 1000 * scale, 800 * scale);

    // Draw objects
    for (const obj of objects) {
      const ox = (obj as any).x || 0;
      const oy = (obj as any).y || 0;
      const ow = (obj as any).width || 40;
      const oh = (obj as any).height || 40;

      const mx = toMiniX(ox);
      const my = toMiniY(oy);
      const mw = Math.max(2, ow * scale);
      const mh = Math.max(2, oh * scale);

      ctx.fillStyle = (obj as any).fill || '#6366f1';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, my, mw, mh);
    }
    ctx.globalAlpha = 1.0;

    // Draw Viewport Rectangle
    const vpWorldW = 1200 / (camera.zoom || 1);
    const vpWorldH = 800 / (camera.zoom || 1);
    const vpWorldX = -camera.x - vpWorldW / 2;
    const vpWorldY = -camera.y - vpWorldH / 2;

    const vmx = toMiniX(vpWorldX);
    const vmy = toMiniY(vpWorldY);
    const vmw = Math.max(10, vpWorldW * scale);
    const vmh = Math.max(8, vpWorldH * scale);

    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.fillRect(vmx, vmy, vmw, vmh);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vmx, vmy, vmw, vmh);
  }

  onMouseDown(e: MouseEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Pan camera towards clicked relative position
    const relX = (clickX / canvas.width - 0.5) * 2000;
    const relY = (clickY / canvas.height - 0.5) * 1600;

    const engine = this.bridge.getEngine();
    if (engine) {
      engine.getCamera().setTarget(-relX, -relY);
    }
  }
}
