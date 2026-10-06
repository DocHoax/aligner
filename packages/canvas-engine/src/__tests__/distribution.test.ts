import { describe, it, expect } from 'vitest';
import { DistributionEngine } from '../math/distribution';
import { ObjectFactory } from '../objects/object-factory';

describe('DistributionEngine', () => {
  it('distributes 3 rectangles horizontally with equal gaps', () => {
    // Total span: x=0 to x=300 (maxX = 350)
    // r1: x=0, w=50 (right=50)
    // r2: x=70, w=50 (right=120)
    // r3: x=300, w=50 (right=350)
    // Total space = 350 - 0 = 350
    // Total widths = 150
    // Remaining space = 200
    // Spacing = 200 / 2 = 100
    // Expected:
    // r1 at x=0
    // r2 at x=0 + 50 + 100 = 150
    // r3 at x=300
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 0, width: 50, height: 50 });
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 70, y: 0, width: 50, height: 50 });
    const r3 = ObjectFactory.createRectangle({ id: 'r3', x: 300, y: 0, width: 50, height: 50 });

    const changes = DistributionEngine.distribute([r1, r2, r3], 'horizontal');
    expect(changes.length).toBe(1); // Only r2 moves

    const r2Change = changes.find((c) => c.id === 'r2');
    expect(r2Change?.changes.x).toBeCloseTo(150);
  });

  it('distributes 3 rectangles vertically with equal gaps', () => {
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 0, width: 50, height: 100 });
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 0, y: 150, width: 50, height: 100 });
    const r3 = ObjectFactory.createRectangle({ id: 'r3', x: 0, y: 500, width: 50, height: 100 });
    // Total span: 0 to 600
    // Heights: 100 * 3 = 300
    // Spacing: (600 - 300) / 2 = 150
    // Target r2 y: 0 + 100 + 150 = 250

    const changes = DistributionEngine.distribute([r1, r2, r3], 'vertical');
    expect(changes.length).toBe(1);

    const r2Change = changes.find((c) => c.id === 'r2');
    expect(r2Change?.changes.y).toBeCloseTo(250);
  });

  it('returns empty array when fewer than 3 objects are provided', () => {
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 0, width: 50, height: 50 });
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 100, y: 0, width: 50, height: 50 });

    const changes = DistributionEngine.distribute([r1, r2], 'horizontal');
    expect(changes).toEqual([]);
  });
});
