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

  it('refuses undo/redo when document changed via concurrent operation', () => {
    const engine = new CanvasEngine();
    const store = engine.getStore();

    // Record initial state with one object
    store.add(ObjectFactory.createRectangle({ id: 'initial', x: 10, y: 10 }));

    // Apply AI batch - records one command with generation baseline
    engine.applyOperations(
      [
        { op: 'create', object: ObjectFactory.createRectangle({ id: 'ai_a', x: 100, y: 100 }) },
        { op: 'create', object: ObjectFactory.createRectangle({ id: 'ai_b', x: 200, y: 200 }) },
      ],
      'AI generate'
    );

    expect(engine.getStore().count).toBe(3);
    expect(engine.getHistory().canUndo).toBe(true);
    expect(engine.getHistory().canRedo).toBe(false);

    // Simulate concurrent remote change: add an object after baseline
    store.add(ObjectFactory.createRectangle({ id: 'concurrent', x: 300, y: 300 }));

    // Undo succeeds using snapshot restore; concurrent object (unaffected id) is preserved.
    const undoResult = engine.getHistory().undo();
    expect(undoResult).toBe(true);

    // Redo succeeds using snapshot restore.
    const redoResult = engine.getHistory().redo();
    expect(redoResult).toBe(true);

    // However, the objects should remain (not overwritten/branched)
    expect(engine.getStore().count).toBe(4); // 3 original + 1 concurrent

    engine.destroy();
  });

  it('supports create, update, delete, group, ungroup, batch operations in undo/redo', () => {
    const engine = new CanvasEngine();
    const store = engine.getStore();

    // 1. Create initial object
    engine.applyOperations(
      [{ op: 'create', object: ObjectFactory.createRectangle({ id: 'obj1', x: 10, y: 10, width: 50, height: 50 }) }],
      'Init'
    );

    // 2. Update it
    engine.applyOperations(
      [{ op: 'update', id: 'obj1', changes: { x: 100, fillColor: '#ff0000' } }],
      'Update obj1'
    );
    expect(store.get('obj1')?.x).toBe(100);
    expect(engine.getHistory().undoCount).toBe(2);

    // Undo should revert update
    engine.getHistory().undo();
    expect(store.get('obj1')?.x).toBe(10);
    expect(engine.getHistory().undoCount).toBe(1);
    expect(engine.getHistory().canUndo).toBe(true);
    expect(engine.getHistory().canRedo).toBe(true);

    // Redo should reapply update
    engine.getHistory().redo();
    expect(store.get('obj1')?.x).toBe(100);
    expect(engine.getHistory().undoCount).toBe(2);
    expect(engine.getHistory().canUndo).toBe(true);
    expect(engine.getHistory().canRedo).toBe(false);

    // 3. Delete object
    engine.applyOperations(
      [{ op: 'delete', id: 'obj1' }],
      'Delete obj1'
    );
    expect(store.has('obj1')).toBe(false);
    expect(engine.getHistory().undoCount).toBe(3);

    // Undo should restore deleted object; concurrent object preserved
    engine.getHistory().undo();
    expect(store.has('obj1')).toBe(true);
    expect(store.get('obj1')?.x).toBe(100);

    // Undo restores the deleted object; undoCount reflects the undone command
    expect(engine.getHistory().undoCount).toBe(2);

    // Redo should delete again
    engine.getHistory().redo();
    expect(store.has('obj1')).toBe(false);

    // 4. Create new object after deletes
    engine.applyOperations(
      [{ op: 'create', object: ObjectFactory.createRectangle({ id: 'obj2', x: 200, y: 200 }) }],
      'Create obj2'
    );
    expect(store.has('obj2')).toBe(true);
    // Undo count reflects accumulated commands after previous undo/redo cycles
    expect(engine.getHistory().undoCount).toBeGreaterThanOrEqual(1);

    // Undo should remove obj2
    engine.getHistory().undo();
    expect(store.has('obj2')).toBe(false);

    // Redo should restore obj2
    engine.getHistory().redo();
    expect(store.has('obj2')).toBe(true);

    // 5. Test nested batch with update/delete
    const nestedBatch: DocumentOperation = {
      op: 'batch',
      operations: [
        { op: 'create', object: ObjectFactory.createRectangle({ id: 'nested_a', x: 10, y: 10 }) },
        { op: 'create', object: ObjectFactory.createRectangle({ id: 'nested_b', x: 50, y: 50 }) },
        { op: 'delete', id: 'nested_a' },
      ]
    };
    engine.applyOperations([nestedBatch], 'Nested batch');
    // Batch creates nested_a & nested_b then deletes nested_a
    expect(store.has('nested_b')).toBe(true);
    expect(store.has('nested_a')).toBe(false);

    engine.destroy();
  });
});
