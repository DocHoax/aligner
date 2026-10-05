import { describe, it, expect, vi } from 'vitest';
import { ObjectStore } from '../objects/object-store';
import { ObjectFactory } from '../objects/object-factory';
import { CanvasEngine } from '../core/canvas-engine';
import { DocumentOperation, UserPresence } from '@alignify/protocol';

describe('Real-Time Collaboration & Remote Operations', () => {
  it('emits local operations when local mutations occur', () => {
    const store = new ObjectStore();
    const emittedOps: DocumentOperation[] = [];
    const unsubscribe = store.onLocalOperation((op) => emittedOps.push(op));

    const obj1 = ObjectFactory.createRectangle({ id: 'rect1', x: 10, y: 20 });
    store.add(obj1);

    expect(emittedOps.length).toBe(1);
    expect(emittedOps[0]).toEqual({ op: 'create', object: obj1 });

    store.update('rect1', { x: 50 });
    expect(emittedOps.length).toBe(2);
    expect(emittedOps[1]).toEqual({ op: 'update', id: 'rect1', changes: { x: 50 } });

    store.remove('rect1');
    expect(emittedOps.length).toBe(3);
    expect(emittedOps[2]).toEqual({ op: 'delete', id: 'rect1' });

    unsubscribe();
    store.add(ObjectFactory.createEllipse({ id: 'el1' }));
    expect(emittedOps.length).toBe(3); // Unsubscribed
  });

  it('applies remote operations without echoing to local operation listeners', () => {
    const store = new ObjectStore();
    const emittedOps: DocumentOperation[] = [];
    store.onLocalOperation((op) => emittedOps.push(op));

    const remoteObj = ObjectFactory.createRectangle({ id: 'remote1', x: 100, y: 100, width: 80, height: 60 });

    // Remote create
    store.applyRemoteOperation({
      op: 'create',
      object: remoteObj
    });

    expect(store.has('remote1')).toBe(true);
    expect(store.get('remote1')?.x).toBe(100);
    expect(emittedOps.length).toBe(0); // MUST NOT emit local operation

    // Remote move
    store.applyRemoteOperation({
      op: 'move',
      id: 'remote1',
      x: 150,
      y: 200
    });
    expect(store.get('remote1')?.x).toBe(150);
    expect(store.get('remote1')?.y).toBe(200);
    expect(emittedOps.length).toBe(0);

    // Remote resize
    store.applyRemoteOperation({
      op: 'resize',
      id: 'remote1',
      x: 150,
      y: 200,
      width: 120,
      height: 90
    });
    expect(store.get('remote1')?.width).toBe(120);
    expect(store.get('remote1')?.height).toBe(90);
    expect(emittedOps.length).toBe(0);

    // Remote rotate
    store.applyRemoteOperation({
      op: 'rotate',
      id: 'remote1',
      rotation: 45
    });
    expect(store.get('remote1')?.rotation).toBe(45);
    expect(emittedOps.length).toBe(0);

    // Remote delete
    store.applyRemoteOperation({
      op: 'delete',
      id: 'remote1'
    });
    expect(store.has('remote1')).toBe(false);
    expect(emittedOps.length).toBe(0);
  });

  it('applies batch remote operations correctly', () => {
    const store = new ObjectStore();
    const objA = ObjectFactory.createRectangle({ id: 'a', x: 0, y: 0 });
    const objB = ObjectFactory.createRectangle({ id: 'b', x: 10, y: 10 });

    store.applyRemoteOperation({
      op: 'batch',
      operations: [
        { op: 'create', object: objA },
        { op: 'create', object: objB },
        { op: 'update', id: 'a', changes: { fillColor: '#ff0000' } }
      ]
    });

    expect(store.count).toBe(2);
    const updatedA = store.get('a');
    expect(updatedA?.type === 'rectangle' ? updatedA.fillColor : undefined).toBe('#ff0000');
    expect(store.get('b')?.x).toBe(10);
  });

  it('manages collaborator presence and emits events in CanvasEngine', () => {
    const engine = new CanvasEngine();
    const user1: UserPresence = {
      userId: 'u1',
      userName: 'Alice',
      userColor: '#ff4444',
      cursor: { x: 100, y: 200 },
      selectedIds: ['obj1'],
      lastActive: Date.now()
    };
    const user2: UserPresence = {
      userId: 'u2',
      userName: 'Bob',
      userColor: '#4444ff',
      cursor: { x: 300, y: 400 },
      selectedIds: [],
      lastActive: Date.now()
    };

    engine.setCollaborators([user1, user2]);
    expect(engine.getCollaborators().length).toBe(2);

    engine.updateCollaborator({
      ...user1,
      cursor: { x: 150, y: 250 }
    });
    const updatedUser1 = engine.getCollaborators().find((u) => u.userId === 'u1');
    expect(updatedUser1?.cursor?.x).toBe(150);

    engine.removeCollaborator('u2');
    expect(engine.getCollaborators().length).toBe(1);

    const localOpListener = vi.fn();
    engine.getEventBus().on('local_operation', localOpListener);

    engine.getStore().add(ObjectFactory.createRectangle({ id: 'test_engine_obj' }));
    expect(localOpListener).toHaveBeenCalledTimes(1);

    engine.destroy();
  });
});
