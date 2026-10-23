import { describe, it, expect } from 'vitest';
import { CanvasEngine } from '../core/canvas-engine';
import { ObjectFactory } from '../objects/object-factory';
import { DocumentOperation } from '@alignify/protocol';
import { RectangleObject } from '@alignify/shared-types';

function createNode(id: string, x: number): DocumentOperation {
  return {
    op: 'create',
    object: ObjectFactory.createRectangle({ id, x, y: 0, width: 160, height: 80 })
  };
}

describe('AI / Mermaid operation batches on the command stack', () => {
  it('records a generated diagram as one undoable command', () => {
    const engine = new CanvasEngine();
    const operations: DocumentOperation[] = [
      createNode('ai_gateway', 0),
      createNode('ai_service', 240),
      createNode('ai_db', 480)
    ];

    const applied = engine.applyOperations(operations, 'AI generate: e-commerce');

    expect(applied).toBe(3);
    expect(engine.getStore().count).toBe(3);
    expect(engine.getHistory().canUndo).toBe(true);
    expect(engine.getHistory().getState().lastCommandDescription).toBe(
      'AI generate: e-commerce'
    );
    // The whole diagram collapses into a single history entry.
    expect(engine.getHistory().undoCount).toBe(1);

    engine.getHistory().undo();
    expect(engine.getStore().count).toBe(0);
    expect(engine.getHistory().canRedo).toBe(true);

    engine.getHistory().redo();
    expect(engine.getStore().count).toBe(3);
    expect(engine.getStore().get('ai_service')?.x).toBe(240);

    engine.destroy();
  });

  it('broadcasts a batch as exactly one local operation', () => {
    const engine = new CanvasEngine();
    const emitted: DocumentOperation[] = [];
    engine.getEventBus().on('local_operation', (op) => {
      emitted.push(op as DocumentOperation);
    });

    engine.applyOperations([createNode('n1', 0), createNode('n2', 200)], 'AI generate');

    expect(emitted.length).toBe(1);
    expect(emitted[0]!.op).toBe('batch');
    if (emitted[0]!.op === 'batch') {
      expect(emitted[0]!.operations.length).toBe(2);
    }

    // Undo is a single combined operation too, so collaborators stay in sync.
    engine.getHistory().undo();
    expect(emitted.length).toBe(2);
    expect(emitted[1]!.op).toBe('batch');

    engine.destroy();
  });

  it('restores updated and deleted objects when an AI refinement is undone', () => {
    const engine = new CanvasEngine();
    const store = engine.getStore();

    store.add(ObjectFactory.createRectangle({ id: 'keep', x: 10, y: 20, width: 120, height: 60 }));
    store.add(ObjectFactory.createRectangle({ id: 'removed', x: 300, y: 20 }));

    const original = { ...(store.get('keep') as RectangleObject) };
    engine.getHistory().clear();

    engine.applyOperations(
      [
        { op: 'update', id: 'keep', changes: { x: 900, fillColor: '#123456' } },
        { op: 'delete', id: 'removed' },
        { op: 'create', object: ObjectFactory.createRectangle({ id: 'added', x: 500 }) }
      ],
      'AI refine'
    );

    expect(store.get('keep')?.x).toBe(900);
    expect(store.has('removed')).toBe(false);
    expect(store.has('added')).toBe(true);

    engine.getHistory().undo();
    const restored = store.get('keep') as RectangleObject;
    expect(restored.x).toBe(original.x);
    expect(restored.fillColor).toBe(original.fillColor);
    expect(store.has('removed')).toBe(true);
    expect(store.has('added')).toBe(false);

    engine.getHistory().redo();
    expect(store.get('keep')?.x).toBe(900);
    expect(store.has('removed')).toBe(false);
    expect(store.has('added')).toBe(true);

    engine.destroy();
  });

  it('ignores batches that resolve to no visible change', () => {
    const engine = new CanvasEngine();
    const emitted: DocumentOperation[] = [];
    engine.getEventBus().on('local_operation', (op) => {
      emitted.push(op as DocumentOperation);
    });

    const applied = engine.applyOperations(
      [{ op: 'update', id: 'does_not_exist', changes: { x: 10 } }],
      'AI refine'
    );

    expect(applied).toBe(1);
    expect(engine.getHistory().canUndo).toBe(false);
    expect(emitted.length).toBe(0);

    engine.destroy();
  });

  it('supports nested batch operations from the AI translator', () => {
    const engine = new CanvasEngine();
    const nested: DocumentOperation = {
      op: 'batch',
      operations: [
        createNode('inside_a', 0),
        createNode('inside_b', 220),
        { op: 'update', id: 'inside_a', changes: { x: 40 } }
      ]
    };

    engine.applyOperations([nested], 'AI generate');

    expect(engine.getStore().count).toBe(2);
    expect(engine.getStore().get('inside_a')?.x).toBe(40);
    expect(engine.getHistory().undoCount).toBe(1);

    engine.getHistory().undo();
    expect(engine.getStore().count).toBe(0);

    engine.destroy();
  });
});
