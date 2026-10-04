/**
 * Axis-Aligned and Rotated Bounding Box Utilities
 */
import { CanvasObject, IBoundingBox, Point, Rect } from '@alignify/shared-types';
import { Vec2 } from './vec2';

export class Bounds implements IBoundingBox {
  constructor(
    public readonly minX: number,
    public readonly minY: number,
    public readonly maxX: number,
    public readonly maxY: number
  ) {}

  get width(): number {
    return Math.max(0, this.maxX - this.minX);
  }

  get height(): number {
    return Math.max(0, this.maxY - this.minY);
  }

  get centerX(): number {
    return (this.minX + this.maxX) / 2;
  }

  get centerY(): number {
    return (this.minY + this.maxY) / 2;
  }

  get x(): number {
    return this.minX;
  }

  get y(): number {
    return this.minY;
  }

  static empty(): Bounds {
    return new Bounds(Infinity, Infinity, -Infinity, -Infinity);
  }

  static fromRect(x: number, y: number, width: number, height: number): Bounds {
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);
    return new Bounds(minX, minY, maxX, maxY);
  }

  static fromPoints(points: Point[]): Bounds {
    if (points.length === 0) return Bounds.empty();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    return new Bounds(minX, minY, maxX, maxY);
  }

  static fromObject(obj: CanvasObject): Bounds {
    if (obj.type === 'line' || obj.type === 'arrow') {
      const minX = Math.min(obj.x, obj.x2);
      const maxX = Math.max(obj.x, obj.x2);
      const minY = Math.min(obj.y, obj.y2);
      const maxY = Math.max(obj.y, obj.y2);
      return new Bounds(minX, minY, maxX, maxY).expand(Math.max(obj.strokeWidth / 2, 4));
    }

    if (!obj.rotation || obj.rotation === 0) {
      return Bounds.fromRect(obj.x, obj.y, obj.width, obj.height);
    }

    // Rotated object corners
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const rad = (obj.rotation * Math.PI) / 180;
    const center = new Vec2(cx, cy);

    const p1 = new Vec2(obj.x, obj.y).rotate(rad, center);
    const p2 = new Vec2(obj.x + obj.width, obj.y).rotate(rad, center);
    const p3 = new Vec2(obj.x + obj.width, obj.y + obj.height).rotate(rad, center);
    const p4 = new Vec2(obj.x, obj.y + obj.height).rotate(rad, center);

    return Bounds.fromPoints([p1, p2, p3, p4]);
  }

  static fromObjects(objects: CanvasObject[]): Bounds | null {
    if (objects.length === 0) return null;
    let bounds = Bounds.fromObject(objects[0]!);
    for (let i = 1; i < objects.length; i++) {
      bounds = bounds.union(Bounds.fromObject(objects[i]!));
    }
    return bounds;
  }

  containsPoint(p: Point): boolean {
    return p.x >= this.minX && p.x <= this.maxX && p.y >= this.minY && p.y <= this.maxY;
  }

  intersects(other: IBoundingBox): boolean {
    return !(
      this.maxX < other.minX ||
      this.minX > other.maxX ||
      this.maxY < other.minY ||
      this.minY > other.maxY
    );
  }

  union(other: IBoundingBox): Bounds {
    return new Bounds(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY)
    );
  }

  expand(amount: number): Bounds {
    return new Bounds(
      this.minX - amount,
      this.minY - amount,
      this.maxX + amount,
      this.maxY + amount
    );
  }

  toRect(): Rect {
    return {
      x: this.minX,
      y: this.minY,
      width: this.width,
      height: this.height
    };
  }

  getCorners(): [Vec2, Vec2, Vec2, Vec2] {
    return [
      new Vec2(this.minX, this.minY), // NW
      new Vec2(this.maxX, this.minY), // NE
      new Vec2(this.maxX, this.maxY), // SE
      new Vec2(this.minX, this.maxY)  // SW
    ];
  }
}
