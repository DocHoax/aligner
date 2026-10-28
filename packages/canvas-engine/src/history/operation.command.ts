/**
 * Operation Command
 * Wraps a batch of document operations (AI-generated diagrams, Mermaid imports,
 * version restores, ...) into a single undoable unit. The affected objects are
 * snapshotted before and after execution so undo/redo restores their previous
 * geometry, styling and existence, independent of the operation mix
 * (create / update / delete / group / batch).
 */
import { CanvasObject } from '@alignify/shared-types';
import { DocumentOperation } from '@alignify/protocol';
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

/** Object state keyed by id. `null` means "object does not exist". */
export type ObjectSnapshot = Map<string, CanvasObject | null>;

/**
 * Resolves every object id that a batch of operations can read or mutate.
 * Ungroup operations are expanded against the current store contents.
 */
export function collectAffectedIds(
  store: ObjectStore,
  operations: DocumentOperation[]
): string[] {
  const ids = new Set<string>();

  const visit = (op: DocumentOperation): void => {
    switch (op.op) {
      case 'create':
        ids.add(op.object.id);
        break;
      case 'delete':
      case 'move':
      case 'resize':
      case 'rotate':
      case 'update':
        ids.add(op.id);
        break;
      case 'group':
        for (const childId of op.childIds) {
          ids.add(childId);
        }
        break;
      case 'ungroup':
        for (const object of store.getAll()) {
          if (object.metadata?.['groupId'] === op.groupId) {
            ids.add(object.id);
          }
        }
        break;
      case 'batch':
        for (const subOp of op.operations) {
          visit(subOp);
        }
        break;
    }
  };

  for (const op of operations) {
    visit(op);
  }

  return Array.from(ids);
}

export function snapshotObjects(
  store: ObjectStore,
  ids: Iterable<string>
): ObjectSnapshot {
  const snapshot: ObjectSnapshot = new Map();
  for (const id of ids) {
    const object = store.get(id);
    snapshot.set(id, object ? { ...object } : null);
  }
  return snapshot;
}

export function snapshotsEqual(a: ObjectSnapshot, b: ObjectSnapshot): boolean {
  if (a.size !== b.size) return false;
  for (const [id, object] of a) {
    if (!b.has(id)) return false;
    if (JSON.stringify(object) !== JSON.stringify(b.get(id))) return false;
  }
  return true;
}

export class OperationCommand implements ICommand {
  readonly id: string;

  /**
   * Monotonic generation counter of the store. Used to detect whether the
   * underlying document has changed through other operations (e.g. remote
   * collaborator changes or user-driven edits) since this command was recorded.
   * Updated after successful undo/redo to allow chaining.
   */
  private baseGeneration: number;

  constructor(
    public readonly description: string,
    private readonly store: ObjectStore,
    private readonly before: ObjectSnapshot,
    private readonly after: ObjectSnapshot
  ) {
    this.id = 'ops_' + Math.random().toString(36).substring(2, 9);
    this.baseGeneration = store.generation;
  }

  execute(): void {
    this.restore(this.after);
  }

  undo(): void {
    if (this.store.generation !== this.baseGeneration) {
      return;
    }
    this.restore(this.before);
    this.baseGeneration = this.store.generation;
  }

  redo(): void {
    if (this.store.generation !== this.baseGeneration) {
      return;
    }
    this.restore(this.after);
    this.baseGeneration = this.store.generation;
  }

  /**
   * Restores the store to a snapshot. Mutations go through the regular store
   * API so undo/redo changes are still broadcast to collaborators.
   */
  private restore(snapshot: ObjectSnapshot): void {
    const toRemove: string[] = [];
    const toUpdate: { id: string; changes: Partial<CanvasObject> }[] = [];
    const toAdd: CanvasObject[] = [];

    for (const [id, object] of snapshot) {
      if (object === null) {
        if (this.store.has(id)) {
          toRemove.push(id);
        }
        continue;
      }

      if (this.store.has(id)) {
        toUpdate.push({ id, changes: { ...object } });
      } else {
        toAdd.push({ ...object });
      }
    }

    if (toRemove.length > 0) {
      this.store.removeMany(toRemove);
    }
    if (toUpdate.length > 0) {
      this.store.updateMany(toUpdate);
    }
    if (toAdd.length > 0) {
      this.store.addMany(toAdd);
    }
  }
}
