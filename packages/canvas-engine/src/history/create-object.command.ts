/**
 * Create Object Command
 */
import { CanvasObject } from '@alignify/shared-types';
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

export class CreateObjectCommand implements ICommand {
  readonly id: string;
  readonly description: string;

  constructor(
    private readonly store: ObjectStore,
    private readonly objects: CanvasObject[]
  ) {
    this.id = 'create_' + Math.random().toString(36).substring(2, 9);
    this.description =
      objects.length === 1
        ? `Create ${objects[0]!.type}`
        : `Create ${objects.length} objects`;
  }

  execute(): void {
    this.store.addMany(this.objects);
  }

  undo(): void {
    this.store.removeMany(this.objects.map((o) => o.id));
  }

  redo(): void {
    this.execute();
  }
}
