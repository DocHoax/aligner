/**
 * Presence Renderer
 * Renders live collaborator cursors, name badges, and remote selection overlays.
 */
import { UserPresence } from '@alignify/protocol';
import { Size } from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { Bounds } from '../math/bounds';
import { ObjectStore } from '../objects/object-store';

export class PresenceRenderer {
  /**
   * Main entry point to render collaborator presence on the 2D canvas overlay.
   */
  static render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    collaborators: Iterable<UserPresence>,
    store: ObjectStore
  ): void {
    ctx.save();

    for (const user of collaborators) {
      if (!user) continue;

      // 1. Render remote collaborator selections
      if (user.selectedIds && user.selectedIds.length > 0) {
        this.renderRemoteSelection(ctx, camera, viewportSize, user, store);
      }

      // 2. Render remote collaborator live cursor & label
      if (user.cursor) {
        this.renderRemoteCursor(ctx, camera, viewportSize, user);
      }
    }

    ctx.restore();
  }

  private static renderRemoteSelection(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    user: UserPresence,
    store: ObjectStore
  ): void {
    const objects = store.getByIds(user.selectedIds);
    if (objects.length === 0) return;

    const userColor = user.userColor || '#3b82f6';

    if (objects.length === 1) {
      const obj = objects[0]!;
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;
      const centerScreen = camera.worldToScreen({ x: cx, y: cy }, viewportSize);
      const zoom = camera.zoom;

      ctx.save();
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate(((obj.rotation || 0) * Math.PI) / 180);

      const sw = obj.width * zoom;
      const sh = obj.height * zoom;
      const halfW = sw / 2;
      const halfH = sh / 2;

      // Selection bounding box
      ctx.strokeStyle = userColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-halfW, -halfH, sw, sh);

      // Subtle translucent fill
      ctx.fillStyle = this.hexToRgba(userColor, 0.08);
      ctx.fillRect(-halfW, -halfH, sw, sh);

      // Collaborator Name Tag Badge above selection box
      this.drawNameTag(ctx, -halfW, -halfH - 20, user.userName, userColor);

      ctx.restore();
    } else {
      // Multi-object selection bounds
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const obj of objects) {
        const b = Bounds.fromObject(obj);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
      }

      const p1 = camera.worldToScreen({ x: minX, y: minY }, viewportSize);
      const sw = (maxX - minX) * camera.zoom;
      const sh = (maxY - minY) * camera.zoom;

      ctx.save();
      ctx.strokeStyle = userColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(p1.x, p1.y, sw, sh);

      ctx.fillStyle = this.hexToRgba(userColor, 0.08);
      ctx.fillRect(p1.x, p1.y, sw, sh);

      this.drawNameTag(ctx, p1.x, p1.y - 20, user.userName, userColor);
      ctx.restore();
    }
  }

  private static renderRemoteCursor(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportSize: Size,
    user: UserPresence
  ): void {
    if (!user.cursor) return;
    const screenPos = camera.worldToScreen(user.cursor, viewportSize);

    // Skip if cursor is completely outside viewport with safety margin
    if (
      screenPos.x < -100 ||
      screenPos.x > viewportSize.width + 100 ||
      screenPos.y < -100 ||
      screenPos.y > viewportSize.height + 100
    ) {
      return;
    }

    const userColor = user.userColor || '#3b82f6';

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);

    // 1. Draw SVG-styled pointer cursor arrow
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 15);
    ctx.lineTo(4, 12);
    ctx.lineTo(7, 18);
    ctx.lineTo(9.5, 17);
    ctx.lineTo(6.5, 11);
    ctx.lineTo(12, 11);
    ctx.closePath();

    // Fill with collaborator color
    ctx.fillStyle = userColor;
    ctx.fill();

    // Sharp white border around cursor arrow
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 2. Draw Collaborator Name Tag Pill
    this.drawNameTag(ctx, 12, 14, user.userName, userColor);

    ctx.restore();
  }

  private static drawNameTag(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string,
    color: string
  ): void {
    const text = name || 'Collaborator';
    ctx.save();
    ctx.font = '600 11px Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const paddingX = 7;
    const height = 18;
    const width = textWidth + paddingX * 2;
    const radius = 4;

    // Draw Rounded Pill Background
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, x, y, width, height, radius);
    ctx.fill();

    // Draw Drop Shadow / Subtle outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw White Text
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + paddingX, y + height / 2);

    ctx.restore();
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  private static hexToRgba(hex: string, alpha: number): string {
    const cleanHex = hex.replace('#', '');
    let r = 59;
    let g = 130;
    let b = 246;

    if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16) || 0;
      g = parseInt(cleanHex.substring(2, 4), 16) || 0;
      b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    } else if (cleanHex.length === 3) {
      r = parseInt(cleanHex.charAt(0) + cleanHex.charAt(0), 16) || 0;
      g = parseInt(cleanHex.charAt(1) + cleanHex.charAt(1), 16) || 0;
      b = parseInt(cleanHex.charAt(2) + cleanHex.charAt(2), 16) || 0;
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
