/**
 * Selection Manager
 * Manages selection state, active handles, bounding boxes and hit testing for handles.
 */
import {
  CanvasObject,
  HandleType,
  IBoundingBox,
  Point,
  ResizeHandleInfo,
  SelectionState
} from '@alignify/shared-types';
import { Bounds } from '../math/bounds';
import { HitTest } from '../math/hit-test';
import { ObjectStore } from '../objects/object-store';

export type SelectionChangeListener = (state: SelectionState) => void;

export class SelectionManager {
  private readonly selectedIdSet = new Set<string>();
  private _hoveredId: string | null = null;
  private _activeHandle: HandleType | null = null;
  private readonly listeners = new Set<SelectionChangeListener>();

  constructor(private readonly store: ObjectStore) {
    // Clean up selection when objects are removed
    this.store.subscribe((event) => {
      if (event.type === 'remove' && event.ids) {
        let changed = false;
        for (const id of event.ids) {
          if (this.selectedIdSet.delete(id)) {
            changed = true;
          }
        }
        if (changed) this.notify();
      } else if (event.type === 'reset') {
        this.selectedIdSet.clear();
        this.notify();
      }
    });
  }

  get selectedIds(): string[] {
    return Array.from(this.selectedIdSet);
  }

  get selectedCount(): number {
    return this.selectedIdSet.size;
  }

  get isMultiSelect(): boolean {
    return this.selectedIdSet.size > 1;
  }

  get hoveredId(): string | null {
    return this._hoveredId;
  }

  set hoveredId(id: string | null) {
    if (this._hoveredId !== id) {
      this._hoveredId = id;
      this.notify();
    }
  }

  get activeHandle(): HandleType | null {
    return this._activeHandle;
  }

  set activeHandle(handle: HandleType | null) {
    if (this._activeHandle !== handle) {
      this._activeHandle = handle;
      this.notify();
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIdSet.has(id);
  }

  getSelectedObjects(): CanvasObject[] {
    return this.store.getByIds(this.selectedIdSet);
  }

  getSelectionBounds(): IBoundingBox | null {
    const selected = this.getSelectedObjects();
    return Bounds.fromObjects(selected);
  }

  select(id: string): void {
    if (this.selectedIdSet.size === 1 && this.selectedIdSet.has(id)) {
      return;
    }
    this.selectedIdSet.clear();
    this.selectedIdSet.add(id);
    this.notify();
  }

  toggle(id: string): void {
    if (this.selectedIdSet.has(id)) {
      this.selectedIdSet.delete(id);
    } else {
      this.selectedIdSet.add(id);
    }
    this.notify();
  }

  setSelection(ids: string[]): void {
    this.selectedIdSet.clear();
    for (const id of ids) {
      if (this.store.has(id)) {
        this.selectedIdSet.add(id);
      }
    }
    this.notify();
  }

  selectAll(): void {
    this.selectedIdSet.clear();
    for (const obj of this.store.getAll()) {
      if (!obj.locked) {
        this.selectedIdSet.add(obj.id);
      }
    }
    this.notify();
  }

  clear(): void {
    if (this.selectedIdSet.size === 0) return;
    this.selectedIdSet.clear();
    this._activeHandle = null;
    this.notify();
  }

  /**
   * Computes resize & rotation handles for current selection in world coordinates.
   */
  getHandles(zoom = 1): ResizeHandleInfo[] {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return [];

    if (selected.length === 1) {
      const obj = selected[0]!;
      if (obj.type === 'line' || obj.type === 'arrow') {
        // Line/Arrow have endpoint handles
        return [
          {
            type: 'line-start',
            worldPosition: { x: obj.x, y: obj.y },
            screenPosition: { x: obj.x, y: obj.y },
            cursor: 'crosshair'
          },
          {
            type: 'line-end',
            worldPosition: { x: obj.x2, y: obj.y2 },
            screenPosition: { x: obj.x2, y: obj.y2 },
            cursor: 'crosshair'
          }
        ];
      }

      return HitTest.getHandles(obj.x, obj.y, obj.width, obj.height, obj.rotation, zoom);
    }

    // Multi-selection: handles around axis-aligned union bounds
    const bounds = Bounds.fromObjects(selected);
    if (!bounds) return [];

    return HitTest.getHandles(bounds.minX, bounds.minY, bounds.width, bounds.height, 0, zoom);
  }

  /**
   * Tests if a world point hits a handle of the selected object(s).
   */
  testHandles(worldPoint: Point, zoom = 1): HandleType | null {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return null;

    if (selected.length === 1) {
      const obj = selected[0]!;
      if (obj.type === 'line' || obj.type === 'arrow') {
        const hitRadius = HitTest.HANDLE_HIT_RADIUS / zoom;
        const p1 = { x: obj.x, y: obj.y };
        const p2 = { x: obj.x2, y: obj.y2 };

        const d1 = Math.hypot(worldPoint.x - p1.x, worldPoint.y - p1.y);
        if (d1 <= hitRadius) return 'line-start';

        const d2 = Math.hypot(worldPoint.x - p2.x, worldPoint.y - p2.y);
        if (d2 <= hitRadius) return 'line-end';

        return null;
      }

      return HitTest.testHandles(
        worldPoint,
        obj.x,
        obj.y,
        obj.width,
        obj.height,
        obj.rotation,
        zoom
      );
    }

    // Multi-select bounds
    const bounds = Bounds.fromObjects(selected);
    if (!bounds) return null;

    return HitTest.testHandles(
      worldPoint,
      bounds.minX,
      bounds.minY,
      bounds.width,
      bounds.height,
      0,
      zoom
    );
  }

  getState(): SelectionState {
    return {
      selectedIds: new Set(this.selectedIdSet),
      hoveredId: this._hoveredId,
      activeHandle: this._activeHandle,
      bounds: this.getSelectionBounds(),
      isMultiSelect: this.isMultiSelect
    };
  }

  subscribe(listener: SelectionChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
