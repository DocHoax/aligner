import { describe, it, expect } from 'vitest';
import { Mat2D } from '../math/mat2d';
import { Vec2 } from '../math/vec2';

describe('Mat2D Affine Transformations', () => {
  it('creates identity matrix by default', () => {
    const m = new Mat2D();
    const pt = m.transformPoint({ x: 10, y: 20 });
    expect(pt.x).toBe(10);
    expect(pt.y).toBe(20);
  });

  it('translates points correctly', () => {
    const m = Mat2D.translation(50, -30);
    const pt = m.transformPoint({ x: 10, y: 10 });
    expect(pt.x).toBe(60);
    expect(pt.y).toBe(-20);
  });

  it('scales points correctly', () => {
    const m = Mat2D.scale(2, 3);
    const pt = m.transformPoint({ x: 10, y: 10 });
    expect(pt.x).toBe(20);
    expect(pt.y).toBe(30);
  });

  it('inverts matrix correctly', () => {
    const m = Mat2D.translation(100, 200).scaleBy(2, 2);
    const inv = m.invert();
    expect(inv).not.toBeNull();

    const original = new Vec2(15, 25);
    const transformed = m.transformPoint(original);
    const restored = inv!.transformPoint(transformed);

    expect(Math.round(restored.x)).toBe(15);
    expect(Math.round(restored.y)).toBe(25);
  });
});
