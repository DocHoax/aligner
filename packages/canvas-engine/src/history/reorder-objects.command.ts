/**
 * Reorder Objects Command
 */
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

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
