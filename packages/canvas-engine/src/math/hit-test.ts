/**
 * Hit Testing for Canvas Objects & Transform Handles
 */
import { CanvasObject, HandleType, Point, ResizeHandleInfo } from '@alignify/shared-types';
import { Vec2 } from './vec2';
import { Bounds } from './bounds';

export class HitTest {
  /**
   * Minimum hit distance for thin elements (lines/arrows) in world units
   */
  static readonly LINE_HIT_THRESHOLD = 8;
  static readonly HANDLE_HIT_RADIUS = 7;
  static readonly ROTATION_HANDLE_DISTANCE = 24;

  /**
   * Tests if a world point hits a canvas object
   */
  static testObject(point: Point, obj: CanvasObject, zoom = 1): boolean {
    if (obj.locked) return false;

    switch (obj.type) {
      case 'rectangle':
      case 'text':
      case 'sticky':
        return this.testRotatedRect(point, obj.x, obj.y, obj.width, obj.height, obj.rotation);

      case 'ellipse':
        return this.testRotatedEllipse(point, obj.x, obj.y, obj.width, obj.height, obj.rotation);

      case 'line':
      case 'arrow':
        return this.testLineSegment(point, new Vec2(obj.x, obj.y), new Vec2(obj.x2, obj.y2), Math.max(obj.strokeWidth / 2, this.LINE_HIT_THRESHOLD / zoom));

      default:
        return false;
    }
  }

  /**
   * Tests if a point is inside a rotated rectangle
   */
  static testRotatedRect(
    p: Point,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg = 0
  ): boolean {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const center = new Vec2(cx, cy);

    // Transform test point into unrotated local coordinate space
    const rad = (-rotationDeg * Math.PI) / 180;
    const local = new Vec2(p.x, p.y).rotate(rad, center);

    return (
      local.x >= x &&
      local.x <= x + width &&
      local.y >= y &&
      local.y <= y + height
    );
  }

  /**
   * Tests if a point is inside a rotated ellipse
   */
  static testRotatedEllipse(
    p: Point,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg = 0
  ): boolean {
    const rx = width / 2;
    const ry = height / 2;
    if (rx <= 0 || ry <= 0) return false;

    const cx = x + rx;
    const cy = y + ry;
    const center = new Vec2(cx, cy);

    // Rotate point to local axes
    const rad = (-rotationDeg * Math.PI) / 180;
    const local = new Vec2(p.x, p.y).rotate(rad, center);

    const dx = local.x - cx;
    const dy = local.y - cy;

    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  /**
   * Distance from point to line segment
   */
  static testLineSegment(p: Point, start: Vec2, end: Vec2, threshold: number): boolean {
    const lineVec = end.sub(start);
    const lenSq = lineVec.lengthSq();

    if (lenSq === 0) {
      return start.distanceTo(p) <= threshold;
    }

    const ptVec = new Vec2(p.x, p.y).sub(start);
    // Projection factor t
    const t = Math.max(0, Math.min(1, ptVec.dot(lineVec) / lenSq));
    const projection = start.add(lineVec.scale(t));

    return projection.distanceTo(p) <= threshold;
  }

  /**
   * Computes handle positions in world coordinates
   */
  static getHandles(
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg = 0,
    zoom = 1
  ): ResizeHandleInfo[] {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const center = new Vec2(cx, cy);
    const rad = (rotationDeg * Math.PI) / 180;

    const rotatePt = (pt: Vec2) => pt.rotate(rad, center);

    const nw = rotatePt(new Vec2(x, y));
    const n = rotatePt(new Vec2(cx, y));
    const ne = rotatePt(new Vec2(x + width, y));
    const e = rotatePt(new Vec2(x + width, cy));
    const se = rotatePt(new Vec2(x + width, y + height));
    const s = rotatePt(new Vec2(cx, y + height));
    const sw = rotatePt(new Vec2(x, y + height));
    const w = rotatePt(new Vec2(x, cy));

    // Rotation handle is positioned above top-center by ROTATION_HANDLE_DISTANCE / zoom
    const rotDist = this.ROTATION_HANDLE_DISTANCE / zoom;
    const rotPos = rotatePt(new Vec2(cx, y - rotDist));

    const handles: { type: HandleType; pos: Vec2; baseAngle: number }[] = [
      { type: 'nw', pos: nw, baseAngle: -135 },
      { type: 'n', pos: n, baseAngle: -90 },
      { type: 'ne', pos: ne, baseAngle: -45 },
      { type: 'e', pos: e, baseAngle: 0 },
      { type: 'se', pos: se, baseAngle: 45 },
      { type: 's', pos: s, baseAngle: 90 },
      { type: 'sw', pos: sw, baseAngle: 135 },
      { type: 'w', pos: w, baseAngle: 180 },
      { type: 'rotation', pos: rotPos, baseAngle: 0 }
    ];

    return handles.map((h) => {
      let cursor = 'crosshair';
      if (h.type === 'rotation') {
        cursor = 'grab';
      } else {
        // Compute rotation-adapted resize cursor
        const effectiveAngle = (h.baseAngle + rotationDeg) % 360;
        cursor = this.getResizeCursor(effectiveAngle);
      }

      return {
        type: h.type,
        worldPosition: h.pos,
        screenPosition: h.pos, // Updated by caller with screen transform if needed
        cursor
      };
    });
  }

  /**
   * Tests which handle is clicked at worldPoint
   */
  static testHandles(
    worldPoint: Point,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDeg = 0,
    zoom = 1
  ): HandleType | null {
    const handles = this.getHandles(x, y, width, height, rotationDeg, zoom);
    const hitRadius = this.HANDLE_HIT_RADIUS / zoom;

    // Prioritize rotation handle first
    const rotHandle = handles.find((h) => h.type === 'rotation');
    if (rotHandle && new Vec2(worldPoint.x, worldPoint.y).distanceTo(rotHandle.worldPosition) <= hitRadius * 1.5) {
      return 'rotation';
    }

    for (const h of handles) {
      if (h.type === 'rotation') continue;
      if (new Vec2(worldPoint.x, worldPoint.y).distanceTo(h.worldPosition) <= hitRadius) {
        return h.type;
      }
    }

    return null;
  }

  private static getResizeCursor(angle: number): string {
    const normalized = (angle + 360) % 360;
    if ((normalized >= 337.5 || normalized < 22.5) || (normalized >= 157.5 && normalized < 202.5)) {
      return 'ew-resize';
    }
    if ((normalized >= 22.5 && normalized < 67.5) || (normalized >= 202.5 && normalized < 247.5)) {
      return 'nwse-resize';
    }
    if ((normalized >= 67.5 && normalized < 112.5) || (normalized >= 247.5 && normalized < 292.5)) {
      return 'ns-resize';
    }
    return 'nesw-resize';
  }
}
