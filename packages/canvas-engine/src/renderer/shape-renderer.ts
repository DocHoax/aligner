/**
 * Shape Renderer
 * Canvas 2D render routines for all canvas object types.
 */
import {
  ArrowHeadType,
  ArrowObject,
  CanvasObject,
  EllipseObject,
  LineObject,
  RectangleObject,
  STICKY_COLOR_MAP,
  StickyNoteObject,
  StrokeStyle,
  TextObject
} from '@alignify/shared-types';

export class ShapeRenderer {
  static render(ctx: CanvasRenderingContext2D, obj: CanvasObject): void {
    ctx.save();

    // Global opacity
    ctx.globalAlpha = Math.max(0, Math.min(1, obj.opacity ?? 1));

    switch (obj.type) {
      case 'rectangle':
        this.renderRectangle(ctx, obj);
        break;
      case 'ellipse':
        this.renderEllipse(ctx, obj);
        break;
      case 'text':
        this.renderText(ctx, obj);
        break;
      case 'sticky':
        this.renderStickyNote(ctx, obj);
        break;
      case 'line':
        this.renderLine(ctx, obj);
        break;
      case 'arrow':
        this.renderArrow(ctx, obj);
        break;
    }

    ctx.restore();
  }

  private static applyStrokeStyle(
    ctx: CanvasRenderingContext2D,
    style: StrokeStyle,
    width: number
  ): void {
    if (style === 'dashed') {
      ctx.setLineDash([width * 3, width * 2]);
    } else if (style === 'dotted') {
      ctx.setLineDash([width, width * 1.5]);
    } else {
      ctx.setLineDash([]);
    }
  }

  private static renderRectangle(ctx: CanvasRenderingContext2D, obj: RectangleObject): void {
    const { x, y, width, height, rotation, cornerRadius, fillColor, strokeColor, strokeWidth, strokeStyle } = obj;

    ctx.save();
    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.beginPath();
    const r = Math.min(cornerRadius, Math.min(width, height) / 2);
    if (r > 0) {
      ctx.roundRect(x, y, width, height, r);
    } else {
      ctx.rect(x, y, width, height);
    }

    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (strokeWidth > 0 && strokeColor && strokeColor !== 'transparent') {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      this.applyStrokeStyle(ctx, strokeStyle, strokeWidth);
      ctx.stroke();
    }

    ctx.restore();
  }

  private static renderEllipse(ctx: CanvasRenderingContext2D, obj: EllipseObject): void {
    const { x, y, width, height, rotation, fillColor, strokeColor, strokeWidth, strokeStyle } = obj;
    const rx = Math.max(0.1, width / 2);
    const ry = Math.max(0.1, height / 2);
    const cx = x + rx;
    const cy = y + ry;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, (rotation * Math.PI) / 180, 0, Math.PI * 2);

    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (strokeWidth > 0 && strokeColor && strokeColor !== 'transparent') {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      this.applyStrokeStyle(ctx, strokeStyle, strokeWidth);
      ctx.stroke();
    }

    ctx.restore();
  }

  private static renderText(ctx: CanvasRenderingContext2D, obj: TextObject): void {
    const { x, y, width, height, rotation, text, fontFamily, fontSize, fontWeight, textAlign, textColor } = obj;

    ctx.save();
    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", -apple-system, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = textAlign;

    let textX = x;
    if (textAlign === 'center') {
      textX = x + width / 2;
    } else if (textAlign === 'right') {
      textX = x + width;
    }

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.35;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, textX, y + i * lineHeight);
    }

    ctx.restore();
  }

  private static renderStickyNote(ctx: CanvasRenderingContext2D, obj: StickyNoteObject): void {
    const { x, y, width, height, rotation, text, stickyColor, fontFamily, fontSize, textAlign, textColor } = obj;
    const palette = STICKY_COLOR_MAP[stickyColor] ?? STICKY_COLOR_MAP.yellow;

    ctx.save();
    if (rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Sticky note body with slight rounded corners
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.fillStyle = palette.bg;
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top subtle header strip / adhesive tape look
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(x, y, width, Math.min(20, height * 0.15));

    // Text content inside note
    ctx.font = `500 ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = textColor || palette.text;
    ctx.textBaseline = 'top';
    ctx.textAlign = textAlign;

    const padding = 14;
    const innerWidth = width - padding * 2;
    let textX = x + padding;
    if (textAlign === 'center') {
      textX = x + width / 2;
    } else if (textAlign === 'right') {
      textX = x + width - padding;
    }

    const topOffset = y + padding + 10;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const paragraph of text.split('\n')) {
      const paraWords = paragraph.split(' ');
      let line = '';
      for (const word of paraWords) {
        const testLine = line ? `${line} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > innerWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      lines.push(line);
    }

    const lineHeight = fontSize * 1.35;
    const maxVisibleLines = Math.floor((height - padding * 2 - 10) / lineHeight);

    for (let i = 0; i < Math.min(lines.length, maxVisibleLines); i++) {
      ctx.fillText(lines[i]!, textX, topOffset + i * lineHeight);
    }

    ctx.restore();
  }

  private static renderLine(ctx: CanvasRenderingContext2D, obj: LineObject): void {
    const { x, y, x2, y2, strokeColor, strokeWidth, strokeStyle, startHead, endHead } = obj;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    this.applyStrokeStyle(ctx, strokeStyle, strokeWidth);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (startHead && startHead !== 'none') {
      this.renderHead(ctx, x2, y2, x, y, startHead, strokeWidth, strokeColor);
    }
    if (endHead && endHead !== 'none') {
      this.renderHead(ctx, x, y, x2, y2, endHead, strokeWidth, strokeColor);
    }

    ctx.restore();
  }

  private static renderArrow(ctx: CanvasRenderingContext2D, obj: ArrowObject): void {
    const { x, y, x2, y2, strokeColor, strokeWidth, strokeStyle, startHead, endHead } = obj;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    this.applyStrokeStyle(ctx, strokeStyle, strokeWidth);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (startHead && startHead !== 'none') {
      this.renderHead(ctx, x2, y2, x, y, startHead, strokeWidth, strokeColor);
    }
    if (endHead && endHead !== 'none') {
      this.renderHead(ctx, x, y, x2, y2, endHead, strokeWidth, strokeColor);
    }

    ctx.restore();
  }

  private static renderHead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    headType: ArrowHeadType,
    strokeWidth: number,
    color: string
  ): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = Math.max(10, strokeWidth * 4);

    ctx.save();
    ctx.translate(toX, toY);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.setLineDash([]);

    if (headType === 'arrow' || headType === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-headLen, -headLen / 2.2);
      ctx.lineTo(-headLen * 0.7, 0);
      ctx.lineTo(-headLen, headLen / 2.2);
      ctx.closePath();
      ctx.fill();
    } else if (headType === 'circle') {
      ctx.beginPath();
      ctx.arc(-headLen / 2, 0, headLen / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (headType === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-headLen / 2, -headLen / 3);
      ctx.lineTo(-headLen, 0);
      ctx.lineTo(-headLen / 2, headLen / 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
