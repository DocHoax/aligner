/**
 * Vector2D Math Utilities
 */
import { Point } from '@alignify/shared-types';

export class Vec2 implements Point {
  constructor(public readonly x: number = 0, public readonly y: number = 0) {}

  static from(p: Point): Vec2 {
    return new Vec2(p.x, p.y);
  }

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  add(other: Point): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Point): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  scale(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  dot(other: Point): number {
    return this.x * other.x + this.y * other.y;
  }

  cross(other: Point): number {
    return this.x * other.y - this.y * other.x;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  distanceTo(other: Point): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceToSq(other: Point): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  normalize(): Vec2 {
    const len = this.length();
    return len === 0 ? Vec2.zero() : new Vec2(this.x / len, this.y / len);
  }

  rotate(angleRad: number, origin: Point = Vec2.zero()): Vec2 {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = this.x - origin.x;
    const dy = this.y - origin.y;
    return new Vec2(
      origin.x + (dx * cos - dy * sin),
      origin.y + (dx * sin + dy * cos)
    );
  }

  lerp(other: Point, t: number): Vec2 {
    return new Vec2(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }
}
