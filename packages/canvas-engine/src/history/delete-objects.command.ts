/**
 * Delete Objects Command
 */
import { CanvasObject } from '@alignify/shared-types';
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

export class DeleteObjectsCommand implements ICommand {
  readonly id: string;
  readonly description: string;
  private readonly deletedObjects: CanvasObject[];

  constructor(
    private readonly store: ObjectStore,
    objects: CanvasObject[]
  ) {
    this.id = 'delete_' + Math.random().toString(36).substring(2, 9);
    // Deep clone state for safe restoration
    this.deletedObjects = objects.map((obj) => JSON.parse(JSON.stringify(obj)));
    this.description =
      objects.length === 1
        ? `Delete ${objects[0]!.type}`
        : `Delete ${objects.length} objects`;
  }

  execute(): void {
    this.store.removeMany(this.deletedObjects.map((o) => o.id));
  }

  undo(): void {
    this.store.addMany(this.deletedObjects);
  }

  redo(): void {
    this.execute();
  }
}
