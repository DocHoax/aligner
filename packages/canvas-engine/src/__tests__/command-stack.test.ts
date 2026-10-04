import { describe, it, expect } from 'vitest';
import { CommandStack } from '../history/command-stack';
import { ObjectStore } from '../objects/object-store';
import { ObjectFactory } from '../objects/object-factory';
import { CreateObjectCommand } from '../history/create-object.command';
import { DeleteObjectsCommand } from '../history/delete-objects.command';
import { TransformObjectsCommand } from '../history/transform-objects.command';

describe('Command Pattern Undo / Redo Stack', () => {
  it('executes and undoes create command', () => {
    const store = new ObjectStore();
    const history = new CommandStack();
    const obj = ObjectFactory.createRectangle({ id: 'r1', x: 10, y: 10 });

    const cmd = new CreateObjectCommand(store, [obj]);
    history.execute(cmd);

    expect(store.getAll().length).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.undo();
    expect(store.getAll().length).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(store.getAll().length).toBe(1);
  });

  it('undoes and redoes delete command', () => {
    const store = new ObjectStore();
    const history = new CommandStack();
    const obj = ObjectFactory.createRectangle({ id: 'r1' });
    store.add(obj);

    const cmd = new DeleteObjectsCommand(store, [obj]);
    history.execute(cmd);

    expect(store.getAll().length).toBe(0);

    history.undo();
    expect(store.getAll().length).toBe(1);
    expect(store.get('r1')).toBeDefined();

    history.redo();
    expect(store.getAll().length).toBe(0);
  });

  it('undoes and redoes object transformation', () => {
    const store = new ObjectStore();
    const history = new CommandStack();
    const obj = ObjectFactory.createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 50 });
    store.add(obj);

    const beforeState = { id: 'r1', x: 0, y: 0, width: 100, height: 50, rotation: 0 };
    const afterState = { id: 'r1', x: 50, y: 50, width: 200, height: 100, rotation: 45 };

    const cmd = new TransformObjectsCommand(store, 'Move & Resize', [beforeState], [afterState]);
    history.execute(cmd);

    const modified = store.get('r1')!;
    expect(modified.x).toBe(50);
    expect(modified.width).toBe(200);
    expect(modified.rotation).toBe(45);

    history.undo();
    const restored = store.get('r1')!;
    expect(restored.x).toBe(0);
    expect(restored.width).toBe(100);
    expect(restored.rotation).toBe(0);

    history.redo();
    const redone = store.get('r1')!;
    expect(redone.x).toBe(50);
    expect(redone.width).toBe(200);
  });

  it('supports transactions for grouping multiple commands', () => {
    const store = new ObjectStore();
    const history = new CommandStack();

    history.startTransaction('Multi-action');
    const obj1 = ObjectFactory.createRectangle({ id: 'o1' });
    const obj2 = ObjectFactory.createRectangle({ id: 'o2' });

    history.execute(new CreateObjectCommand(store, [obj1]));
    history.execute(new CreateObjectCommand(store, [obj2]));
    history.commitTransaction();

    expect(store.getAll().length).toBe(2);
    expect(history.undoCount).toBe(1);

    history.undo();
    expect(store.getAll().length).toBe(0);

    history.redo();
    expect(store.getAll().length).toBe(2);
  });
});
