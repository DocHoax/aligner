import { describe, it, expect } from 'vitest';
import { SelectionManager } from '../selection/selection-manager';
import { ObjectStore } from '../objects/object-store';
import { ObjectFactory } from '../objects/object-factory';

describe('Selection Manager', () => {
  it('selects, toggles, and clears selection', () => {
    const store = new ObjectStore();
    const obj1 = ObjectFactory.createRectangle({ id: '1' });
    const obj2 = ObjectFactory.createRectangle({ id: '2' });
    store.add(obj1);
    store.add(obj2);

    const sel = new SelectionManager(store);
    expect(sel.count).toBe(0);

    sel.select('1');
    expect(sel.count).toBe(1);
    expect(sel.isSelected('1')).toBe(true);

    sel.toggle('2');
    expect(sel.count).toBe(2);
    expect(sel.isSelected('2')).toBe(true);

    sel.toggle('1');
    expect(sel.count).toBe(1);
    expect(sel.isSelected('1')).toBe(false);

    sel.clear();
    expect(sel.count).toBe(0);
  });

  it('computes aggregated bounding box for multi-selection', () => {
    const store = new ObjectStore();
    const obj1 = ObjectFactory.createRectangle({ id: '1', x: 0, y: 0, width: 50, height: 50 });
    const obj2 = ObjectFactory.createRectangle({ id: '2', x: 100, y: 100, width: 50, height: 50 });
    store.add(obj1);
    store.add(obj2);

    const sel = new SelectionManager(store);
    sel.setSelection(['1', '2']);

    const bounds = sel.getBoundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(0);
    expect(bounds!.minY).toBe(0);
    expect(bounds!.maxX).toBe(150);
    expect(bounds!.maxY).toBe(150);
    expect(bounds!.width).toBe(150);
    expect(bounds!.height).toBe(150);
  });
});
