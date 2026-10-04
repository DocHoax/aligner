import { describe, it, expect } from 'vitest';
import { ObjectStore } from '../objects/object-store';
import { ObjectFactory } from '../objects/object-factory';
import { Bounds } from '../math/bounds';

describe('Object Store CRUD & Z-Ordering', () => {
  it('adds, gets, updates, and deletes objects', () => {
    const store = new ObjectStore();
    const obj1 = ObjectFactory.createRectangle({ x: 0, y: 0, width: 100, height: 100 });
    const obj2 = ObjectFactory.createEllipse({ x: 200, y: 200, width: 80, height: 80 });

    store.add(obj1);
    store.add(obj2);

    expect(store.getAll().length).toBe(2);
    expect(store.get(obj1.id)).toEqual(obj1);

    store.update(obj1.id, { x: 50 });
    expect(store.get(obj1.id)?.x).toBe(50);

    store.remove(obj1.id);
    expect(store.getAll().length).toBe(1);
    expect(store.get(obj1.id)).toBeUndefined();
  });

  it('handles spatial intersection queries', () => {
    const store = new ObjectStore();
    const obj1 = ObjectFactory.createRectangle({ x: 10, y: 10, width: 40, height: 40 });
    const obj2 = ObjectFactory.createRectangle({ x: 200, y: 200, width: 40, height: 40 });

    store.add(obj1);
    store.add(obj2);

    const hits = store.queryIntersecting(new Bounds(0, 0, 100, 100));
    expect(hits.length).toBe(1);
    expect(hits[0]?.id).toBe(obj1.id);
  });

  it('reorders z-index layers correctly', () => {
    const store = new ObjectStore();
    const a = ObjectFactory.createRectangle({ id: 'a', zIndex: 1 });
    const b = ObjectFactory.createRectangle({ id: 'b', zIndex: 2 });
    const c = ObjectFactory.createRectangle({ id: 'c', zIndex: 3 });

    store.add(a);
    store.add(b);
    store.add(c);

    // Send C to back
    store.sendToBack(['c']);
    const idsAfterBack = store.getAll().map((o) => o.id);
    expect(idsAfterBack[0]).toBe('c');

    // Bring A to front
    store.bringToFront(['a']);
    const idsAfterFront = store.getAll().map((o) => o.id);
    expect(idsAfterFront[idsAfterFront.length - 1]).toBe('a');
  });
});
