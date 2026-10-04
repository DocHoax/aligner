/**
 * Reorder Objects Command
 */
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

export type ReorderAction = 'bringToFront' | 'sendToBack' | 'bringForward' | 'sendBackward';

export class ReorderObjectsCommand implements ICommand {
  readonly id: string;

  constructor(
    private readonly store: ObjectStore,
    public readonly description: string,
    private readonly beforeZIndexes: { id: string; zIndex: number }[],
    private readonly afterZIndexes: { id: string; zIndex: number }[]
  ) {
    this.id = 'reorder_' + Math.random().toString(36).substring(2, 9);
  }

  static create(store: ObjectStore, ids: string[], action: ReorderAction): ReorderObjectsCommand {
    const before = store.getAll().map((o) => ({ id: o.id, zIndex: o.zIndex }));

    switch (action) {
      case 'bringToFront':
        store.bringToFront(ids);
        break;
      case 'sendToBack':
        store.sendToBack(ids);
        break;
      case 'bringForward':
        store.bringForward(ids);
        break;
      case 'sendBackward':
        store.sendBackward(ids);
        break;
    }

    const after = store.getAll().map((o) => ({ id: o.id, zIndex: o.zIndex }));
    return new ReorderObjectsCommand(store, `Reorder ${action}`, before, after);
  }

  execute(): void {
    for (const item of this.afterZIndexes) {
      this.store.update(item.id, { zIndex: item.zIndex });
    }
  }

  undo(): void {
    for (const item of this.beforeZIndexes) {
      this.store.update(item.id, { zIndex: item.zIndex });
    }
  }

  redo(): void {
    this.execute();
  }
}
