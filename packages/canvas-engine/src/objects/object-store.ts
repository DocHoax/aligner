/**
 * Object Store / Scene Graph
 * In-memory collection of CanvasObjects with fast spatial queries,
 * z-index ordering, and fine-grained change subscriptions.
 */
import { CanvasObject, IBoundingBox } from '@alignify/shared-types';
import { DocumentOperation } from '@alignify/protocol';
import { Bounds } from '../math/bounds';

export type StoreChangeListener = (event: StoreChangeEvent) => void;
export type LocalOperationListener = (op: DocumentOperation) => void;

export interface StoreChangeEvent {
  type: 'add' | 'update' | 'remove' | 'reset' | 'reorder';
  objects: CanvasObject[];
  ids?: string[];
}

export class ObjectStore {
  private readonly objectsMap = new Map<string, CanvasObject>();
  private readonly listeners = new Set<StoreChangeListener>();
  private readonly operationListeners = new Set<LocalOperationListener>();
  private isApplyingRemote = false;
  private nextZIndex = 0;

  constructor(initialObjects: CanvasObject[] = []) {
    if (initialObjects.length > 0) {
      this.reset(initialObjects);
    }
  }

  get count(): number {
    return this.objectsMap.size;
  }

  get(id: string): CanvasObject | undefined {
    return this.objectsMap.get(id);
  }

  has(id: string): boolean {
    return this.objectsMap.has(id);
  }

  getAll(): CanvasObject[] {
    return Array.from(this.objectsMap.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  getByIds(ids: Iterable<string>): CanvasObject[] {
    const results: CanvasObject[] = [];
    for (const id of ids) {
      const obj = this.objectsMap.get(id);
      if (obj) results.push(obj);
    }
    return results.sort((a, b) => a.zIndex - b.zIndex);
  }

  add(object: CanvasObject): void {
    if (object.zIndex === undefined || object.zIndex === 0) {
      object.zIndex = this.nextZIndex++;
    } else if (object.zIndex >= this.nextZIndex) {
      this.nextZIndex = object.zIndex + 1;
    }

    this.objectsMap.set(object.id, object);
    this.notify({ type: 'add', objects: [object] });

    if (!this.isApplyingRemote) {
      this.emitLocalOperation({ op: 'create', object });
    }
  }

  addMany(objects: CanvasObject[]): void {
    if (objects.length === 0) return;
    for (const obj of objects) {
      if (obj.zIndex === undefined || obj.zIndex === 0) {
        obj.zIndex = this.nextZIndex++;
      } else if (obj.zIndex >= this.nextZIndex) {
        this.nextZIndex = obj.zIndex + 1;
      }
      this.objectsMap.set(obj.id, obj);
    }
    this.notify({ type: 'add', objects });

    if (!this.isApplyingRemote) {
      if (objects.length === 1) {
        this.emitLocalOperation({ op: 'create', object: objects[0]! });
      } else {
        this.emitLocalOperation({
          op: 'batch',
          operations: objects.map((obj) => ({ op: 'create', object: obj }))
        });
      }
    }
  }

  update(id: string, updates: Partial<CanvasObject>): CanvasObject | undefined {
    const existing = this.objectsMap.get(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    } as CanvasObject;

    this.objectsMap.set(id, updated);
    this.notify({ type: 'update', objects: [updated] });

    if (!this.isApplyingRemote) {
      this.emitLocalOperation({ op: 'update', id, changes: updates });
    }
    return updated;
  }

  updateMany(updates: { id: string; changes: Partial<CanvasObject> }[]): CanvasObject[] {
    if (updates.length === 0) return [];
    const changed: CanvasObject[] = [];
    const now = Date.now();

    for (const { id, changes } of updates) {
      const existing = this.objectsMap.get(id);
      if (existing) {
        const updated = {
          ...existing,
          ...changes,
          updatedAt: now
        } as CanvasObject;
        this.objectsMap.set(id, updated);
        changed.push(updated);
      }
    }

    if (changed.length > 0) {
      this.notify({ type: 'update', objects: changed });

      if (!this.isApplyingRemote) {
        if (updates.length === 1) {
          this.emitLocalOperation({
            op: 'update',
            id: updates[0]!.id,
            changes: updates[0]!.changes
          });
        } else {
          this.emitLocalOperation({
            op: 'batch',
            operations: updates.map((u) => ({ op: 'update', id: u.id, changes: u.changes }))
          });
        }
      }
    }
    return changed;
  }

  remove(id: string): CanvasObject | undefined {
    const existing = this.objectsMap.get(id);
    if (!existing) return undefined;

    this.objectsMap.delete(id);
    this.notify({ type: 'remove', objects: [existing], ids: [id] });

    if (!this.isApplyingRemote) {
      this.emitLocalOperation({ op: 'delete', id });
    }
    return existing;
  }

  removeMany(ids: Iterable<string>): CanvasObject[] {
    const removed: CanvasObject[] = [];
    const removedIds: string[] = [];

    for (const id of ids) {
      const existing = this.objectsMap.get(id);
      if (existing) {
        this.objectsMap.delete(id);
        removed.push(existing);
        removedIds.push(id);
      }
    }

    if (removed.length > 0) {
      this.notify({ type: 'remove', objects: removed, ids: removedIds });

      if (!this.isApplyingRemote) {
        if (removedIds.length === 1) {
          this.emitLocalOperation({ op: 'delete', id: removedIds[0]! });
        } else {
          this.emitLocalOperation({
            op: 'batch',
            operations: removedIds.map((id) => ({ op: 'delete', id }))
          });
        }
      }
    }
    return removed;
  }

  reset(objects: CanvasObject[]): void {
    this.objectsMap.clear();
    this.nextZIndex = 0;

    for (const obj of objects) {
      this.objectsMap.set(obj.id, obj);
      if (obj.zIndex >= this.nextZIndex) {
        this.nextZIndex = obj.zIndex + 1;
      }
    }

    this.notify({ type: 'reset', objects: this.getAll() });
  }

  clear(): void {
    this.reset([]);
  }

  /**
   * Spatial query to find objects that intersect given world bounds.
   */
  queryIntersecting(bounds: IBoundingBox): CanvasObject[] {
    const all = this.getAll();
    const results: CanvasObject[] = [];

    for (const obj of all) {
      const objBounds = Bounds.fromObject(obj);
      if (objBounds.intersects(bounds)) {
        results.push(obj);
      }
    }

    return results;
  }

  // ==========================================
  // Layer Ordering Operations
  // ==========================================

  bringToFront(ids: string[]): void {
    if (ids.length === 0) return;
    const all = this.getAll();
    const idSet = new Set(ids);
    const unchanged = all.filter((o) => !idSet.has(o.id));
    const moving = all.filter((o) => idSet.has(o.id));

    let z = 0;
    for (const obj of unchanged) {
      obj.zIndex = z++;
    }
    for (const obj of moving) {
      obj.zIndex = z++;
    }
    this.nextZIndex = z;
    this.notify({ type: 'reorder', objects: all });
  }

  sendToBack(ids: string[]): void {
    if (ids.length === 0) return;
    const all = this.getAll();
    const idSet = new Set(ids);
    const moving = all.filter((o) => idSet.has(o.id));
    const unchanged = all.filter((o) => !idSet.has(o.id));

    let z = 0;
    for (const obj of moving) {
      obj.zIndex = z++;
    }
    for (const obj of unchanged) {
      obj.zIndex = z++;
    }
    this.nextZIndex = z;
    this.notify({ type: 'reorder', objects: all });
  }

  bringForward(ids: string[]): void {
    if (ids.length === 0) return;
    const all = this.getAll();
    const idSet = new Set(ids);

    for (let i = all.length - 2; i >= 0; i--) {
      const current = all[i]!;
      const next = all[i + 1]!;
      if (idSet.has(current.id) && !idSet.has(next.id)) {
        all[i] = next;
        all[i + 1] = current;
      }
    }

    for (let i = 0; i < all.length; i++) {
      all[i]!.zIndex = i;
    }
    this.nextZIndex = all.length;
    this.notify({ type: 'reorder', objects: all });
  }

  sendBackward(ids: string[]): void {
    if (ids.length === 0) return;
    const all = this.getAll();
    const idSet = new Set(ids);

    for (let i = 1; i < all.length; i++) {
      const current = all[i]!;
      const prev = all[i - 1]!;
      if (idSet.has(current.id) && !idSet.has(prev.id)) {
        all[i] = prev;
        all[i - 1] = current;
      }
    }

    for (let i = 0; i < all.length; i++) {
      all[i]!.zIndex = i;
    }
    this.nextZIndex = all.length;
    this.notify({ type: 'reorder', objects: all });
  }

  subscribe(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribes to local operations to broadcast them to collaborators.
   * Remote operations do not trigger this listener.
   */
  onLocalOperation(listener: LocalOperationListener): () => void {
    this.operationListeners.add(listener);
    return () => this.operationListeners.delete(listener);
  }

  /**
   * Applies an incoming remote operation directly to the object store
   * without affecting the local user's undo/redo history stack and
   * without re-broadcasting the operation.
   */
  applyRemoteOperation(op: DocumentOperation): void {
    if (!op) return;

    this.isApplyingRemote = true;
    try {
      this.executeOperation(op);
    } finally {
      this.isApplyingRemote = false;
    }
  }

  private executeOperation(op: DocumentOperation): void {
    switch (op.op) {
      case 'create': {
        if (this.objectsMap.has(op.object.id)) {
          this.update(op.object.id, op.object);
        } else {
          this.add(op.object);
        }
        break;
      }

      case 'delete': {
        this.remove(op.id);
        break;
      }

      case 'move': {
        this.update(op.id, { x: op.x, y: op.y });
        break;
      }

      case 'resize': {
        this.update(op.id, {
          x: op.x,
          y: op.y,
          width: op.width,
          height: op.height
        });
        break;
      }

      case 'rotate': {
        this.update(op.id, { rotation: op.rotation });
        break;
      }

      case 'update': {
        this.update(op.id, op.changes);
        break;
      }

      case 'group': {
        for (const childId of op.childIds) {
          const existing = this.get(childId);
          if (existing) {
            this.update(childId, {
              metadata: { ...existing.metadata, groupId: op.groupId }
            });
          }
        }
        break;
      }

      case 'ungroup': {
        for (const obj of this.getAll()) {
          if (
            obj.metadata &&
            (obj.metadata as Record<string, unknown>)['groupId'] === op.groupId
          ) {
            const metadata = { ...obj.metadata };
            delete (metadata as Record<string, unknown>)['groupId'];
            this.update(obj.id, { metadata });
          }
        }
        break;
      }

      case 'batch': {
        for (const subOp of op.operations) {
          this.executeOperation(subOp);
        }
        break;
      }
    }
  }

  private emitLocalOperation(op: DocumentOperation): void {
    if (this.isApplyingRemote) return;
    for (const listener of this.operationListeners) {
      listener(op);
    }
  }

  private notify(event: StoreChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
