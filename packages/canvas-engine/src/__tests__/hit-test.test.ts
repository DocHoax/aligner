import { describe, it, expect } from 'vitest';
import { HitTest } from '../math/hit-test';
import { ObjectFactory } from '../objects/object-factory';

describe('Spatial Hit-Testing', () => {
  it('hit tests unrotated rectangle', () => {
    const rect = ObjectFactory.createRectangle({ x: 50, y: 50, width: 100, height: 80 });

    expect(HitTest.testObject({ x: 60, y: 60 }, rect)).toBe(true);
    expect(HitTest.testObject({ x: 140, y: 120 }, rect)).toBe(true);
    expect(HitTest.testObject({ x: 40, y: 60 }, rect)).toBe(false);
    expect(HitTest.testObject({ x: 160, y: 60 }, rect)).toBe(false);
  });

  it('hit tests rotated rectangle accurately', () => {
    const rect = ObjectFactory.createRectangle({
      x: 100,
      y: 100,
      width: 100,
      height: 40,
      rotation: 90
    });

    // Center is (150, 120)
    expect(HitTest.testObject({ x: 150, y: 120 }, rect)).toBe(true);
    expect(HitTest.testObject({ x: 150, y: 80 }, rect)).toBe(true); // extended along Y
    expect(HitTest.testObject({ x: 120, y: 120 }, rect)).toBe(false);
  });

  it('hit tests ellipse boundary and interior', () => {
    const ellipse = ObjectFactory.createEllipse({ x: 0, y: 0, width: 100, height: 100 });

    expect(HitTest.testObject({ x: 50, y: 50 }, ellipse)).toBe(true); // center
    expect(HitTest.testObject({ x: 50, y: 10 }, ellipse)).toBe(true); // top inside
    expect(HitTest.testObject({ x: 5, y: 5 }, ellipse)).toBe(false); // corner outside circle
  });

  it('hit tests line and arrow with proximity threshold', () => {
    const line = ObjectFactory.createLine({ x: 0, y: 0, x2: 100, y2: 0 });

    expect(HitTest.testObject({ x: 50, y: 2 }, line)).toBe(true);
    expect(HitTest.testObject({ x: 50, y: 6 }, line)).toBe(true); // within default threshold
    expect(HitTest.testObject({ x: 50, y: 20 }, line)).toBe(false);
  });

  it('returns 8 resize handles + 1 rotation handle for selected rectangle', () => {
    const handles = HitTest.getHandles(100, 100, 200, 150, 0, 1);
    expect(handles.length).toBe(9);

    const types = handles.map((h) => h.type);
    expect(types).toContain('nw');
    expect(types).toContain('n');
    expect(types).toContain('ne');
    expect(types).toContain('e');
    expect(types).toContain('se');
    expect(types).toContain('s');
    expect(types).toContain('sw');
    expect(types).toContain('w');
    expect(types).toContain('rotation');
  });
});
