/**
 * Selection Renderer
 * Renders selection outlines, transform handles, rotation stems, and marquee boxes.
 */
import {
  DEFAULT_OBJECT_COLORS,
  Rect,
  Size
} from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { HitTest } from '../math/hit-test';
import { SelectionManager } from '../selection/selection-manager';

export interface SelectionRenderOptions {
  selectionColor?: string;
  selectionFillColor?: string;
  handleSize?: number;
}

export class SelectionRenderer {
  static render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    selection: SelectionManager,
    marqueeBox: Rect | null,
    options: SelectionRenderOptions = {}
  ): void {
    const selected = selection.getSelectedObjects();
    const selectionColor = options.selectionColor ?? DEFAULT_OBJECT_COLORS.selection;
    const handleSize = options.handleSize ?? 8;

    // 1. Render rubberband / marquee selection box if active (marqueeBox in world coords)
    if (marqueeBox) {
      this.renderMarquee(ctx, camera, viewportSize, marqueeBox, selectionColor);
    }

    if (selected.length === 0) return;

    ctx.save();

    // 2. Render Single Selected Object
    if (selected.length === 1) {
      const obj = selected[0]!;

      if (obj.type === 'line' || obj.type === 'arrow') {
        this.renderLineSelection(ctx, camera, viewportSize, obj.x, obj.y, obj.x2, obj.y2, selectionColor, handleSize);
      } else {
        this.renderObjectSelection(
          ctx,
          camera,
          viewportSize,
          obj.x,
          obj.y,
          obj.width,
          obj.height,
          obj.rotation,
          selectionColor,
          handleSize
        );
      }
    } else {
      // 3. Render Multi-Selection (axis-aligned bounding box around all selected objects)
      const bounds = selection.getSelectionBounds();
      if (bounds) {
        this.renderObjectSelection(
          ctx,
          camera,
          viewportSize,
          bounds.minX,
          bounds.minY,
          bounds.width,
          bounds.height,
          0,
          selectionColor,
          handleSize
        );
      }
    }

    ctx.restore();
  }

  private static renderObjectSelection(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg: number,
    color: string,
    handleSize: number
  ): void {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const centerScreen = camera.worldToScreen({ x: cx, y: cy }, viewportSize);
    const zoom = camera.zoom;

    ctx.save();
    ctx.translate(centerScreen.x, centerScreen.y);
    ctx.rotate((rotationDeg * Math.PI) / 180);

    const sw = width * zoom;
    const sh = height * zoom;
    const halfW = sw / 2;
    const halfH = sh / 2;

    // Bounding box outline
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(-halfW, -halfH, sw, sh);

    // Rotation handle stem
    const rotDist = HitTest.ROTATION_HANDLE_DISTANCE;
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, -halfH - rotDist);
    ctx.stroke();

    // Rotation circular handle
    this.drawHandleCircle(ctx, 0, -halfH - rotDist, handleSize / 2, color);

    // 8 resize square handles
    this.drawHandleSquare(ctx, -halfW, -halfH, handleSize, color); // NW
    this.drawHandleSquare(ctx, 0, -halfH, handleSize, color);      // N
    this.drawHandleSquare(ctx, halfW, -halfH, handleSize, color);  // NE
    this.drawHandleSquare(ctx, halfW, 0, handleSize, color);       // E
    this.drawHandleSquare(ctx, halfW, halfH, handleSize, color);   // SE
    this.drawHandleSquare(ctx, 0, halfH, handleSize, color);       // S
    this.drawHandleSquare(ctx, -halfW, halfH, handleSize, color);  // SW
    this.drawHandleSquare(ctx, -halfW, 0, handleSize, color);      // W

    ctx.restore();
  }

  private static renderLineSelection(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    handleSize: number
  ): void {
    const p1 = camera.worldToScreen({ x: x1, y: y1 }, viewportSize);
    const p2 = camera.worldToScreen({ x: x2, y: y2 }, viewportSize);

    this.drawHandleCircle(ctx, p1.x, p1.y, handleSize / 2, color);
    this.drawHandleCircle(ctx, p2.x, p2.y, handleSize / 2, color);
  }

  private static renderMarquee(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    marqueeBox: Rect,
    color: string
  ): void {
    const p1 = camera.worldToScreen({ x: marqueeBox.x, y: marqueeBox.y }, viewportSize);
    const w = marqueeBox.width * camera.zoom;
    const h = marqueeBox.height * camera.zoom;

    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.fillRect(p1.x, p1.y, w, h);
    ctx.strokeRect(p1.x, p1.y, w, h);
    ctx.restore();
  }

  private static drawHandleSquare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    borderColor: string
  ): void {
    const half = size / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - half, y - half, size, size);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(x - half, y - half, size, size);
  }

  private static drawHandleCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    borderColor: string
  ): void {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.stroke();
  }
}
