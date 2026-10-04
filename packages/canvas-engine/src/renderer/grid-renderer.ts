/**
 * Grid Renderer
 * Renders an infinite adaptive dot or line grid that scales smoothly with camera zoom.
 */
import { CameraState, Size } from '@alignify/shared-types';

export interface GridOptions {
  enabled: boolean;
  type: 'dots' | 'lines';
  size: number; // base grid size in world units (default: 20)
  dotColor: string;
  lineColor: string;
}

export class GridRenderer {
  private static readonly DEFAULT_OPTIONS: GridOptions = {
    enabled: true,
    type: 'dots',
    size: 24,
    dotColor: '#334155',
    lineColor: '#1e293b'
  };

  static render(
    ctx: CanvasRenderingContext2D,
    camera: CameraState,
    viewportSize: Size,
    options: Partial<GridOptions> = {}
  ): void {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    if (!opts.enabled) return;

    const zoom = camera.zoom;
    let step = opts.size;

    // Dynamically adjust step size to avoid visual density noise when zoomed out
    while (step * zoom < 14) {
      step *= 2;
    }
    while (step * zoom > 48) {
      step /= 2;
    }

    const halfW = viewportSize.width / 2;
    const halfH = viewportSize.height / 2;

    const startWorldX = (0 - halfW) / zoom + camera.x;
    const endWorldX = (viewportSize.width - halfW) / zoom + camera.x;
    const startWorldY = (0 - halfH) / zoom + camera.y;
    const endWorldY = (viewportSize.height - halfH) / zoom + camera.y;

    const firstGridX = Math.floor(startWorldX / step) * step;
    const lastGridX = Math.ceil(endWorldX / step) * step;
    const firstGridY = Math.floor(startWorldY / step) * step;
    const lastGridY = Math.ceil(endWorldY / step) * step;

    ctx.save();

    if (opts.type === 'dots') {
      ctx.fillStyle = opts.dotColor;
      const dotRadius = Math.max(1, Math.min(2, 1.25 * zoom));

      for (let wx = firstGridX; wx <= lastGridX; wx += step) {
        const sx = (wx - camera.x) * zoom + halfW;
        for (let wy = firstGridY; wy <= lastGridY; wy += step) {
          const sy = (wy - camera.y) * zoom + halfH;
          ctx.beginPath();
          ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.strokeStyle = opts.lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let wx = firstGridX; wx <= lastGridX; wx += step) {
        const sx = Math.round((wx - camera.x) * zoom + halfW) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, viewportSize.height);
      }

      for (let wy = firstGridY; wy <= lastGridY; wy += step) {
        const sy = Math.round((wy - camera.y) * zoom + halfH) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(viewportSize.width, sy);
      }

      ctx.stroke();
    }

    ctx.restore();
  }
}
