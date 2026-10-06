import { describe, it, expect } from 'vitest';
import { AlignmentEngine } from '../math/alignment';
import { ObjectFactory } from '../objects/object-factory';

describe('AlignmentEngine', () => {
  it('aligns multiple objects to the left edge', () => {
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 100, y: 50, width: 100, height: 100 });
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 250, y: 150, width: 80, height: 60 });
    const r3 = ObjectFactory.createRectangle({ id: 'r3', x: 50, y: 300, width: 120, height: 80 });

    // Min X among all is 50 (from r3)
    const changes = AlignmentEngine.align([r1, r2, r3], 'left');

    expect(changes.length).toBe(2); // r1 and r2 need to move, r3 is already at 50
    const r1Change = changes.find((c) => c.id === 'r1');
    const r2Change = changes.find((c) => c.id === 'r2');

    expect(r1Change?.changes.x).toBe(50);
    expect(r2Change?.changes.x).toBe(50);
  });

  it('aligns multiple objects to the horizontal center', () => {
    // Total bounds: minX = 0, maxX = 300 -> centerX = 150
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 100 }); // cx = 50
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 200, y: 0, width: 100, height: 100 }); // cx = 250

    const changes = AlignmentEngine.align([r1, r2], 'center');
    expect(changes.length).toBe(2);

    const r1Change = changes.find((c) => c.id === 'r1');
    const r2Change = changes.find((c) => c.id === 'r2');

    // For r1: target cx = 150, w = 100 -> new x = 100 (dx = +100)
    expect(r1Change?.changes.x).toBe(100);
    // For r2: target cx = 150, w = 100 -> new x = 100 (dx = -100)
    expect(r2Change?.changes.x).toBe(100);
  });

  it('aligns objects to top, middle, and bottom', () => {
    // Total bounds: minY = 100, maxY = 500 -> centerY = 300
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 100, width: 50, height: 50 }); // maxY = 150
    const r2 = ObjectFactory.createRectangle({ id: 'r2', x: 0, y: 400, width: 50, height: 100 }); // maxY = 500

    const topChanges = AlignmentEngine.align([r1, r2], 'top');
    expect(topChanges.find((c) => c.id === 'r2')?.changes.y).toBe(100);

    const bottomChanges = AlignmentEngine.align([r1, r2], 'bottom');
    // For r1: target maxY = 500, height = 50 -> new y = 450
    expect(bottomChanges.find((c) => c.id === 'r1')?.changes.y).toBe(450);

    const middleChanges = AlignmentEngine.align([r1, r2], 'middle');
    // Total centerY = 300
    // r1: height 50, cy = 125 -> target y = 300 - 25 = 275
    expect(middleChanges.find((c) => c.id === 'r1')?.changes.y).toBe(275);
    // r2: height 100, cy = 450 -> target y = 300 - 50 = 250
    expect(middleChanges.find((c) => c.id === 'r2')?.changes.y).toBe(250);
  });

  it('correctly shifts lines and arrows during alignment', () => {
    const l1 = ObjectFactory.createLine({ id: 'l1', x: 10, y: 20, x2: 110, y2: 20, strokeWidth: 2 }); // minX = 10, maxX = 110
    const r1 = ObjectFactory.createRectangle({ id: 'r1', x: 200, y: 0, width: 100, height: 100 }); // maxX = 300

    const changes = AlignmentEngine.align([l1, r1], 'right');
    const l1Change = changes.find((c) => c.id === 'l1');
    expect(l1Change).toBeDefined();
    // Total maxX is 300. Line max X is ~111 with stroke expansion.
    expect((l1Change?.changes as Record<string, any>)?.['x2']).toBeGreaterThan(110);
  });
});
