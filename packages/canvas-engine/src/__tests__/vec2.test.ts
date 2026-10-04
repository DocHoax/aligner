import { describe, it, expect } from 'vitest';
import { Vec2 } from '../math/vec2';

describe('Vec2 Math', () => {
  it('performs basic vector operations', () => {
    const v1 = new Vec2(3, 4);
    const v2 = new Vec2(1, 2);

    expect(v1.x).toBe(3);
    expect(v1.y).toBe(4);
    expect(v1.length()).toBe(5);

    const sum = v1.add(v2);
    expect(sum.x).toBe(4);
    expect(sum.y).toBe(6);

    const diff = v1.sub(v2);
    expect(diff.x).toBe(2);
    expect(diff.y).toBe(2);

    const scaled = v1.scale(2);
    expect(scaled.x).toBe(6);
    expect(scaled.y).toBe(8);

    expect(v1.dot(v2)).toBe(3 * 1 + 4 * 2);
  });

  it('normalizes vector correctly', () => {
    const v = new Vec2(0, 10);
    const norm = v.normalize();
    expect(norm.x).toBe(0);
    expect(norm.y).toBe(1);
    expect(norm.length()).toBe(1);
  });

  it('rotates vector around origin and center', () => {
    const v = new Vec2(10, 0);
    const rotated = v.rotate(Math.PI / 2); // 90 deg counter-clockwise
    expect(Math.abs(rotated.x)).toBeLessThan(1e-10);
    expect(Math.round(rotated.y)).toBe(10);

    const center = new Vec2(5, 5);
    const pt = new Vec2(10, 5);
    const rotAroundCenter = pt.rotate(Math.PI, center); // 180 deg
    expect(Math.round(rotAroundCenter.x)).toBe(0);
    expect(Math.round(rotAroundCenter.y)).toBe(5);
  });
});
