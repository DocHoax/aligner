import { describe, it, expect } from 'vitest';
import { Bounds } from '../math/bounds';
import { ObjectFactory } from '../objects/object-factory';

describe('Bounds Math', () => {
  it('computes bounding box and center', () => {
    const b = new Bounds(10, 20, 110, 80);
    expect(b.width).toBe(100);
    expect(b.height).toBe(60);
    expect(b.centerX).toBe(60);
    expect(b.centerY).toBe(50);
  });

  it('tests point containment and intersection', () => {
    const b1 = new Bounds(0, 0, 100, 100);
    const b2 = new Bounds(50, 50, 150, 150);
    const b3 = new Bounds(200, 200, 300, 300);

    expect(b1.containsPoint({ x: 50, y: 50 })).toBe(true);
    expect(b1.containsPoint({ x: 150, y: 50 })).toBe(false);
    expect(b1.intersects(b2)).toBe(true);
    expect(b1.intersects(b3)).toBe(false);
  });

  it('unions multiple bounds', () => {
    const b1 = new Bounds(0, 0, 50, 50);
    const b2 = new Bounds(20, 20, 100, 120);
    const union = b1.union(b2);

    expect(union.minX).toBe(0);
    expect(union.minY).toBe(0);
    expect(union.maxX).toBe(100);
    expect(union.maxY).toBe(120);
  });

  it('computes rotated bounds accurately', () => {
    const rect = ObjectFactory.createRectangle({
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      rotation: 90
    });

    const b = Bounds.fromObject(rect);
    expect(Math.round(b.width)).toBe(50);
    expect(Math.round(b.height)).toBe(100);
  });
});
