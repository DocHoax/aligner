/**
 * Export Manager
 * High-fidelity diagram export for PNG (with HiDPI multipliers), SVG vector format, and JSON schema.
 */
import { CanvasObject, ExportOptions, STICKY_COLOR_MAP } from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { Bounds } from '../math/bounds';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';
import { ShapeRenderer } from '../renderer/shape-renderer';
import { DocumentSerializer } from '../storage/document-serializer';

export class ExportManager {
  constructor(
    private readonly store: ObjectStore,
    private readonly selection: SelectionManager,
    private readonly camera: Camera
  ) {}

  /**
   * Export scene as high-resolution PNG
   */
  async exportPNG(options: ExportOptions = {}): Promise<string> {
    const pixelRatio = options.pixelRatio || options.scale || 2;
    const padding = options.padding !== undefined ? options.padding : 32;
    const includeBackground = options.includeBackground !== false;
    const backgroundColor = options.backgroundColor || '#090d16';

    const objects = this.getTargetObjects(options.selectedOnly);
    if (objects.length === 0) {
      throw new Error('No objects to export');
    }

    const bounds = Bounds.fromObjects(objects);
    if (!bounds) {
      throw new Error('Could not calculate export bounding box');
    }

    const exportW = Math.ceil(bounds.width + padding * 2);
    const exportH = Math.ceil(bounds.height + padding * 2);

    const canvas = document.createElement('canvas');
    canvas.width = exportW * pixelRatio;
    canvas.height = exportH * pixelRatio;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create offscreen 2D canvas context');

    ctx.scale(pixelRatio, pixelRatio);

    // 1. Background
    if (includeBackground) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, exportW, exportH);
    }

    // 2. Translate so objects align inside padded canvas
    ctx.save();
    ctx.translate(-bounds.minX + padding, -bounds.minY + padding);

    for (const obj of objects) {
      ShapeRenderer.render(ctx, obj);
    }

    ctx.restore();

    return canvas.toDataURL('image/png', options.quality || 0.95);
  }

  /**
   * Export scene as crisp, scalable SVG
   */
  exportSVG(options: ExportOptions = {}): string {
    const padding = options.padding !== undefined ? options.padding : 32;
    const includeBackground = options.includeBackground !== false;
    const backgroundColor = options.backgroundColor || '#090d16';

    const objects = this.getTargetObjects(options.selectedOnly);
    if (objects.length === 0) {
      throw new Error('No objects to export');
    }

    const bounds = Bounds.fromObjects(objects);
    if (!bounds) throw new Error('Could not calculate export bounding box');

    const width = Math.ceil(bounds.width + padding * 2);
    const height = Math.ceil(bounds.height + padding * 2);
    const offsetX = -bounds.minX + padding;
    const offsetY = -bounds.minY + padding;

    let svgElements = '';

    if (includeBackground) {
      svgElements += `  <rect width="${width}" height="${height}" fill="${backgroundColor}" />\n`;
    }

    for (const obj of objects) {
      svgElements += this.renderObjectToSVG(obj, offsetX, offsetY);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .diagram-text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  </style>
${svgElements}</svg>`;
  }

  /**
   * Export document as JSON string
   */
  exportJSON(docName = 'Diagram'): string {
    const objects = this.store.getAll();
    const doc = DocumentSerializer.serialize(
      {
        id: 'doc_' + Date.now().toString(36),
        name: docName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        objectCount: objects.length
      },
      objects,
      this.camera.getState()
    );
    return JSON.stringify(doc, null, 2);
  }

  /**
   * Helper to trigger native browser file download
   */
  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private getTargetObjects(selectedOnly?: boolean): CanvasObject[] {
    if (selectedOnly) {
      const selected = this.selection.getSelectedObjects();
      if (selected.length > 0) return selected;
    }
    return this.store.getAll();
  }

  private renderObjectToSVG(obj: CanvasObject, ox: number, oy: number): string {
    const opacity = obj.opacity ?? 1;
    const rot = obj.rotation;
    const cx = obj.x + obj.width / 2 + ox;
    const cy = obj.y + obj.height / 2 + oy;
    const transformAttr = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : '';

    switch (obj.type) {
      case 'rectangle': {
        const x = obj.x + ox;
        const y = obj.y + oy;
        const fill = obj.fillColor === 'transparent' ? 'none' : obj.fillColor;
        const strokeDash = obj.strokeStyle === 'dashed' ? ' stroke-dasharray="6,6"' : '';
        const rx = obj.cornerRadius || 0;
        return `  <rect x="${x}" y="${y}" width="${obj.width}" height="${obj.height}" rx="${rx}" fill="${fill}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth}" opacity="${opacity}"${strokeDash}${transformAttr} />\n`;
      }
      case 'ellipse': {
        const x = obj.x + ox;
        const y = obj.y + oy;
        const fill = obj.fillColor === 'transparent' ? 'none' : obj.fillColor;
        const strokeDash = obj.strokeStyle === 'dashed' ? ' stroke-dasharray="6,6"' : '';
        const rx = obj.width / 2;
        const ry = obj.height / 2;
        return `  <ellipse cx="${x + rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth}" opacity="${opacity}"${strokeDash}${transformAttr} />\n`;
      }
      case 'sticky': {
        const x = obj.x + ox;
        const y = obj.y + oy;
        const colors = STICKY_COLOR_MAP[obj.stickyColor] || STICKY_COLOR_MAP['yellow'];
        return `  <g${transformAttr}>
    <rect x="${x}" y="${y}" width="${obj.width}" height="${obj.height}" rx="8" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" opacity="${opacity}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />
    <text x="${x + 16}" y="${y + 32}" fill="${obj.textColor || colors.text}" font-size="${obj.fontSize || 16}" class="diagram-text">${this.escapeXml(obj.text || '')}</text>
  </g>\n`;
      }
      case 'text': {
        const x = obj.x + ox;
        const y = obj.y + oy + (obj.fontSize || 16);
        return `  <text x="${x}" y="${y}" fill="${obj.textColor}" font-size="${obj.fontSize || 16}" font-weight="${obj.fontWeight || 'normal'}" opacity="${opacity}" class="diagram-text"${transformAttr}>${this.escapeXml(obj.text || '')}</text>\n`;
      }
      case 'line': {
        const x1 = obj.x + ox;
        const y1 = obj.y + oy;
        const x2 = obj.x2 + ox;
        const y2 = obj.y2 + oy;
        const strokeDash = obj.strokeStyle === 'dashed' ? ' stroke-dasharray="6,6"' : '';
        return `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth}" opacity="${opacity}"${strokeDash} />\n`;
      }
      case 'arrow': {
        const x1 = obj.x + ox;
        const y1 = obj.y + oy;
        const x2 = obj.x2 + ox;
        const y2 = obj.y2 + oy;
        const strokeDash = obj.strokeStyle === 'dashed' ? ' stroke-dasharray="6,6"' : '';
        return `  <g opacity="${opacity}">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth}"${strokeDash} />
  </g>\n`;
      }
      default:
        return '';
    }
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case '\'':
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  }
}
