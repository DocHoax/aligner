import { describe, it, expect } from 'vitest';
import { SnappingEngine } from '../math/snapping';
import { ObjectFactory } from '../objects/object-factory';
import { Bounds } from '../math/bounds';

describe('SnappingEngine', () => {
  it('snaps moving bounds to nearby object edges and generates guides', () => {
    // Target rectangle at (100, 100, 100, 100) -> minX=100, maxX=200, minY=100, maxY=200
    const target = ObjectFactory.createRectangle({ id: 't1', x: 100, y: 100, width: 100, height: 100 });

    // Moving rectangle near left edge: x=103 (3px away), y=250 (far from y edges)
    const moving = ObjectFactory.createRectangle({ id: 'm1', x: 103, y: 250, width: 50, height: 50 });
    const movingBounds = Bounds.fromObject(moving);

    const result = SnappingEngine.snapMove(movingBounds, [target], {
      snapToObjects: true,
      snapThreshold: 6
    });

    // Expect dx = -3 (to snap 103 to 100)
    expect(result.dx).toBe(-3);
    expect(result.guides.length).toBeGreaterThan(0);
    expect(result.guides[0]?.type).toBe('vertical');
    expect(result.guides[0]?.position).toBe(100);
  });

  it('snaps to grid points when snapToGrid is enabled', () => {
    const point = { x: 17, y: 31 };
    const snapped = SnappingEngine.snapPoint(point, { snapToGrid: true, gridSize: 16 });

    expect(snapped.x).toBe(16);
    expect(snapped.y).toBe(32);
  });

  it('snaps moving object to grid when no nearby objects exist', () => {
    const moving = ObjectFactory.createRectangle({ id: 'm1', x: 18, y: 34, width: 50, height: 50 });
    const movingBounds = Bounds.fromObject(moving);

    const result = SnappingEngine.snapMove(movingBounds, [], {
      snapToGrid: true,
      gridSize: 16,
      snapThreshold: 6
    });

    // 18 is 2px from 16 -> dx = -2
    // 34 is 2px from 32 -> dy = -2
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(-2);
  });
});
