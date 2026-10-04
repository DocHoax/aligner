/**
 * Selection Renderer
 * Renders selection outlines, transform handles, rotation stems, and marquee boxes.
 */
import {
  CameraState,
  DEFAULT_OBJECT_COLORS,
  HandleType,
  IBoundingBox,
  Point,
  Rect,
  Size
} from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { Bounds } from '../math/bounds';
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
    const zoom = camera.zoom;

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

    // Rotation handle circle
    ctx.beginPath();
    ctx.arc(0, -halfH - rotDist, handleSize / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 8 Resize handle squares
    const hs = handleSize;
    const halfHs = hs / 2;

    const handlePositions = [
      { x: -halfW, y: -halfH }, // nw
      { x: 0, y: -halfH },      // n
      { x: halfW, y: -halfH },  // ne
      { x: halfW, y: 0 },       // e
      { x: halfW, y: halfH },   // se
      { x: 0, y: halfH },       // s
      { x: -halfW, y: halfH },  // sw
      { x: -halfW, y: 0 }       // w
    ];

    for (const pos of handlePositions) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pos.x - halfHs, pos.y - halfHs, hs, hs);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x - halfHs, pos.y - halfHs, hs, hs);
    }

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
    const p1Screen = camera.worldToScreen({ x: x1, y: y1 }, viewportSize);
    const p2Screen = camera.worldToScreen({ x: x2, y: y2 }, viewportSize);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(p1Screen.x, p1Screen.y);
    ctx.lineTo(p2Screen.x, p2Screen.y);
    ctx.stroke();

    // Start & End handle circles
    const hs = handleSize / 2 + 1;

    for (const p of [p1Screen, p2Screen]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, hs, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
    }

    ctx.restore();
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
    ctx.fillStyle = DEFAULT_OBJECT_COLORS.selectionFill;
    ctx.fillRect(p1.x, p1.y, w, h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p1.x, p1.y, w, h);

    ctx.restore();
  }
}
