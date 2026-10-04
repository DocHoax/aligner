/**
 * Canvas Renderer 2D
 * Master rendering coordinator with HiDPI support, viewport culling, and multi-layer drawing.
 */
import { CanvasObject, Rect, Size } from '@alignify/shared-types';
import { UserPresence } from '@alignify/protocol';
import { Camera } from '../camera/camera';
import { Bounds } from '../math/bounds';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';
import { GridRenderer } from './grid-renderer';
import { SelectionRenderer } from './selection-renderer';
import { ShapeRenderer } from './shape-renderer';
import { PresenceRenderer } from './presence-renderer';

export interface RendererOptions {
  backgroundColor?: string;
  gridEnabled?: boolean;
  gridType?: 'dots' | 'lines';
  gridSize?: number;
}

export class CanvasRenderer2D {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private dpr = 1;
  private viewportSize: Size = { width: 800, height: 600 };

  private options: Required<RendererOptions> = {
    backgroundColor: '#090d16',
    gridEnabled: true,
    gridType: 'dots',
    gridSize: 24
  };

  constructor(options: Partial<RendererOptions> = {}) {
    this.options = { ...this.options, ...options };
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.updateSize();
  }

  detach(): void {
    this.canvas = null;
    this.ctx = null;
  }

  setOptions(newOpts: Partial<RendererOptions>): void {
    this.options = { ...this.options, ...newOpts };
  }

  getOptions(): Required<RendererOptions> {
    return { ...this.options };
  }

  getViewportSize(): Size {
    return { ...this.viewportSize };
  }

  updateSize(): boolean {
    if (!this.canvas || !this.ctx) return false;

    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || this.canvas.width));
    const height = Math.max(1, Math.floor(rect.height || this.canvas.height));

    this.dpr = window.devicePixelRatio || 1;
    this.viewportSize = { width, height };

    const physicalWidth = Math.floor(width * this.dpr);
    const physicalHeight = Math.floor(height * this.dpr);

    if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
      this.canvas.width = physicalWidth;
      this.canvas.height = physicalHeight;
      return true;
    }

    return false;
  }

  render(
    store: ObjectStore,
    camera: Camera,
    selection: SelectionManager,
    previewObject: CanvasObject | null = null,
    marqueeBox: Rect | null = null,
    collaborators?: Iterable<UserPresence>
  ): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const { width, height } = this.viewportSize;

    // Reset transform & clear canvas with backing DPR scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Draw Background
    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Grid
    if (this.options.gridEnabled) {
      GridRenderer.render(ctx, camera.getState(), this.viewportSize, {
        enabled: this.options.gridEnabled,
        type: this.options.gridType,
        size: this.options.gridSize
      });
    }

    // 3. Set Camera Transform for Scene Objects
    // Screen coords = (worldPt - camera) * zoom + centerScreen
    const halfW = width / 2;
    const halfH = height / 2;
    const zoom = camera.zoom;

    ctx.save();
    ctx.translate(halfW, halfH);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);

    // Viewport Frustum Culling
    const vb = camera.getVisibleWorldBounds(this.viewportSize);
    const visibleBox = new Bounds(vb.minX, vb.minY, vb.maxX, vb.maxY);
    const visibleObjects = store.getAll().filter((obj) => {
      const b = Bounds.fromObject(obj);
      return b.intersects(visibleBox);
    });

    // 4. Render Scene Objects (in zIndex order)
    for (const obj of visibleObjects) {
      ShapeRenderer.render(ctx, obj);
    }

    // 5. Render in-flight preview object (creation / preview)
    if (previewObject) {
      ShapeRenderer.render(ctx, previewObject);
    }

    ctx.restore();

    // 6. Render Selection Outlines, Handles, Marquee (in screen coordinate space)
    SelectionRenderer.render(ctx, camera, this.viewportSize, selection, marqueeBox);

    // 7. Render Collaborator Presence (Remote selections, cursors & badges in screen space)
    if (collaborators) {
      PresenceRenderer.render(ctx, camera, this.viewportSize, collaborators, store);
    }
  }
}
