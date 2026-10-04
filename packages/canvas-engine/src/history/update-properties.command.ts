/**
 * Update Properties Command
 */
import { CanvasObject } from '@alignify/shared-types';
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

export class UpdatePropertiesCommand implements ICommand {
  readonly id: string;

  constructor(
    private readonly store: ObjectStore,
    public readonly description: string,
    private readonly updates: {
      id: string;
      before: Partial<CanvasObject>;
      after: Partial<CanvasObject>;
    }[]
  ) {
    this.id = 'prop_' + Math.random().toString(36).substring(2, 9);
  }

  execute(): void {
    for (const item of this.updates) {
      this.store.update(item.id, item.after);
    }
  }

  undo(): void {
    for (const item of this.updates) {
      this.store.update(item.id, item.before);
    }
  }

  redo(): void {
    this.execute();
  }
}
