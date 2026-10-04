/**
 * Select Tool
 * Master tool for object selection, moving, 8-way resizing, rotation, endpoint dragging, and marquee selection.
 */
import {
  ArrowObject,
  CanvasObject,
  HandleType,
  LineObject,
  Point,
  Rect,
  ToolType
} from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { TransformObjectsCommand, ObjectTransformState } from '../history/transform-objects.command';
import { CommandStack } from '../history/command-stack';
import { Bounds } from '../math/bounds';
import { HitTest } from '../math/hit-test';
import { Snap } from '../math/snap';
import { Vec2 } from '../math/vec2';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';
import { ITool, PointerEventInfo } from './tool';

type SelectMode =
  | 'idle'
  | 'dragging_objects'
  | 'resizing'
  | 'rotating'
  | 'dragging_endpoint'
  | 'marquee_selecting';

export type EditRequestCallback = (object: CanvasObject) => void;

export class SelectTool implements ITool {
  readonly type: ToolType = 'select';
  readonly cursor = 'default';

  private mode: SelectMode = 'idle';
  private startPointerWorld: Point = { x: 0, y: 0 };
  private activeHandle: HandleType | null = null;
  private marqueeBox: Rect | null = null;
  private currentCursor = 'default';

  // Initial transform snapshots before interaction for undo/redo
  private initialTransformStates = new Map<string, ObjectTransformState>();

  constructor(
    private readonly store: ObjectStore,
    private readonly selection: SelectionManager,
    private readonly camera: Camera,
    private readonly history: CommandStack,
    private readonly onEditRequest?: EditRequestCallback
  ) {}

  getMarqueeBox(): Rect | null {
    return this.marqueeBox;
  }

  onPointerDown(event: PointerEventInfo): void {
    if (event.button !== 0) return;

    this.startPointerWorld = { ...event.worldPoint };
    const zoom = this.camera.zoom;

    // 1. Check if user clicked an active handle
    const handleHit = this.selection.testHandles(event.worldPoint, zoom);
    if (handleHit) {
      this.activeHandle = handleHit;
      this.selection.activeHandle = handleHit;
      this.recordInitialStates();

      if (handleHit === 'rotation') {
        this.mode = 'rotating';
      } else if (handleHit === 'line-start' || handleHit === 'line-end') {
        this.mode = 'dragging_endpoint';
      } else {
        this.mode = 'resizing';
      }
      return;
    }

    // 2. Hit test objects in reverse z-index order (topmost first)
    const allObjects = this.store.getAll().reverse();
    let hitObject: CanvasObject | null = null;

    for (const obj of allObjects) {
      if (HitTest.testObject(event.worldPoint, obj, zoom)) {
        hitObject = obj;
        break;
      }
    }

    if (hitObject) {
      if (event.shiftKey) {
        // Toggle selection
        this.selection.toggle(hitObject.id);
      } else {
        // If clicked object is already selected in multi-select, keep selection so group drag works
        if (!this.selection.isSelected(hitObject.id)) {
          this.selection.select(hitObject.id);
        }
      }

      this.mode = 'dragging_objects';
      this.recordInitialStates();
    } else {
      // Clicked on empty canvas
      if (!event.shiftKey) {
        this.selection.clear();
      }
      this.mode = 'marquee_selecting';
      this.marqueeBox = {
        x: event.worldPoint.x,
        y: event.worldPoint.y,
        width: 0,
        height: 0
      };
    }
  }

  onPointerMove(event: PointerEventInfo): void {
    const world = event.worldPoint;
    const zoom = this.camera.zoom;

    if (this.mode === 'idle') {
      this.updateHoverAndCursor(world, zoom);
      return;
    }

    if (this.mode === 'dragging_objects') {
      this.handleDragObjects(world, event.shiftKey);
    } else if (this.mode === 'resizing') {
      this.handleResize(world, event.shiftKey, event.altKey);
    } else if (this.mode === 'rotating') {
      this.handleRotate(world, event.shiftKey);
    } else if (this.mode === 'dragging_endpoint') {
      this.handleDragEndpoint(world, event.shiftKey);
    } else if (this.mode === 'marquee_selecting') {
      this.handleMarquee(world);
    }
  }

  onPointerUp(_event: PointerEventInfo): void {
    if (this.mode === 'dragging_objects' || this.mode === 'resizing' || this.mode === 'rotating' || this.mode === 'dragging_endpoint') {
      this.commitTransformHistory();
    }

    this.mode = 'idle';
    this.activeHandle = null;
    this.selection.activeHandle = null;
    this.marqueeBox = null;
    this.initialTransformStates.clear();
  }

  onDoubleClick(event: PointerEventInfo): void {
    const all = this.store.getAll().reverse();
    for (const obj of all) {
      if (HitTest.testObject(event.worldPoint, obj, this.camera.zoom)) {
        if (obj.type === 'text' || obj.type === 'sticky') {
          if (this.onEditRequest) {
            this.onEditRequest(obj);
          }
        }
        break;
      }
    }
  }

  getCursor(): string {
    return this.currentCursor;
  }

  private updateHoverAndCursor(worldPoint: Point, zoom: number): void {
    // 1. Check handle cursor
    const handle = this.selection.testHandles(worldPoint, zoom);
    if (handle) {
      const handles = this.selection.getHandles(zoom);
      const matched = handles.find((h) => h.type === handle);
      this.currentCursor = matched?.cursor ?? 'default';
      return;
    }

    // 2. Check object hover
    const all = this.store.getAll().reverse();
    for (const obj of all) {
      if (HitTest.testObject(worldPoint, obj, zoom)) {
        this.selection.hoveredId = obj.id;
        this.currentCursor = 'move';
        return;
      }
    }

    this.selection.hoveredId = null;
    this.currentCursor = 'default';
  }

  private recordInitialStates(): void {
    this.initialTransformStates.clear();
    const selected = this.selection.getSelectedObjects();
    for (const obj of selected) {
      const state: ObjectTransformState = {
        id: obj.id,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation
      };
      if (obj.type === 'line' || obj.type === 'arrow') {
        state.x2 = obj.x2;
        state.y2 = obj.y2;
      }
      this.initialTransformStates.set(obj.id, state);
    }
  }

  private handleDragObjects(world: Point, shiftKey: boolean): void {
    let dx = world.x - this.startPointerWorld.x;
    let dy = world.y - this.startPointerWorld.y;

    if (shiftKey) {
      // Constrain drag axis to horizontal or vertical
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
      } else {
        dx = 0;
      }
    }

    for (const [id, initial] of this.initialTransformStates.entries()) {
      const updates: Partial<CanvasObject> = {
        x: initial.x + dx,
        y: initial.y + dy
      };
      if (initial.x2 !== undefined && initial.y2 !== undefined) {
        (updates as Record<string, unknown>)['x2'] = initial.x2 + dx;
        (updates as Record<string, unknown>)['y2'] = initial.y2 + dy;
      }
      this.store.update(id, updates);
    }
  }

  private handleResize(world: Point, shiftKey: boolean, altKey: boolean): void {
    if (!this.activeHandle) return;
    const selected = this.selection.getSelectedObjects();
    if (selected.length !== 1) return; // Single object resize for crisp precision

    const obj = selected[0]!;
    const initial = this.initialTransformStates.get(obj.id);
    if (!initial) return;

    const handle = this.activeHandle;
    const rad = (-initial.rotation * Math.PI) / 180;
    const center = new Vec2(initial.x + initial.width / 2, initial.y + initial.height / 2);

    // Unrotate mouse delta into local coordinate frame
    const startLocal = new Vec2(this.startPointerWorld.x, this.startPointerWorld.y).rotate(rad, center);
    const currLocal = new Vec2(world.x, world.y).rotate(rad, center);
    let deltaX = currLocal.x - startLocal.x;
    let deltaY = currLocal.y - startLocal.y;

    let newX = initial.x;
    let newY = initial.y;
    let newWidth = initial.width;
    let newHeight = initial.height;

    // Apply handle delta
    if (handle.includes('e')) newWidth += deltaX;
    if (handle.includes('s')) newHeight += deltaY;
    if (handle.includes('w')) {
      newWidth -= deltaX;
      newX += deltaX;
    }
    if (handle.includes('n')) {
      newHeight -= deltaY;
      newY += deltaY;
    }

    // Shift key: Preserve aspect ratio
    if (shiftKey && initial.width > 0 && initial.height > 0) {
      const ratio = initial.width / initial.height;
      if (Math.abs(newWidth / ratio) > Math.abs(newHeight)) {
        newHeight = newWidth / ratio;
      } else {
        newWidth = newHeight * ratio;
      }
    }

    // Min dimensions
    const minSize = 10;
    if (newWidth < minSize) newWidth = minSize;
    if (newHeight < minSize) newHeight = minSize;

    this.store.update(obj.id, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    });
  }

  private handleRotate(world: Point, shiftKey: boolean): void {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return;

    const bounds = Bounds.fromObjects(selected);
    if (!bounds) return;

    const center = new Vec2(bounds.centerX, bounds.centerY);
    const mouseVec = new Vec2(world.x - center.x, world.y - center.y);

    // Angle in degrees (+90 because handle is at top/north)
    let angleDeg = (mouseVec.angle() * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    if (shiftKey) {
      angleDeg = Snap.snapAngle(angleDeg, 15);
    }

    for (const obj of selected) {
      this.store.update(obj.id, { rotation: Math.round(angleDeg) });
    }
  }

  private handleDragEndpoint(world: Point, shiftKey: boolean): void {
    if (!this.activeHandle) return;
    const selected = this.selection.getSelectedObjects();
    if (selected.length !== 1) return;

    const obj = selected[0]! as LineObject | ArrowObject;
    if (obj.type !== 'line' && obj.type !== 'arrow') return;

    let targetX = world.x;
    let targetY = world.y;

    if (this.activeHandle === 'line-start') {
      if (shiftKey) {
        const dx = targetX - obj.x2;
        const dy = targetY - obj.y2;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snapped = Snap.snapAngle(angle, 45) * (Math.PI / 180);
        const dist = Math.hypot(dx, dy);
        targetX = obj.x2 + dist * Math.cos(snapped);
        targetY = obj.y2 + dist * Math.sin(snapped);
      }
      this.store.update(obj.id, {
        x: targetX,
        y: targetY,
        width: Math.abs(obj.x2 - targetX),
        height: Math.abs(obj.y2 - targetY)
      } as Partial<CanvasObject>);
    } else if (this.activeHandle === 'line-end') {
      if (shiftKey) {
        const dx = targetX - obj.x;
        const dy = targetY - obj.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snapped = Snap.snapAngle(angle, 45) * (Math.PI / 180);
        const dist = Math.hypot(dx, dy);
        targetX = obj.x + dist * Math.cos(snapped);
        targetY = obj.y + dist * Math.sin(snapped);
      }
      this.store.update(obj.id, {
        x2: targetX,
        y2: targetY,
        width: Math.abs(targetX - obj.x),
        height: Math.abs(targetY - obj.y)
      } as Partial<CanvasObject>);
    }
  }

  private handleMarquee(world: Point): void {
    const minX = Math.min(this.startPointerWorld.x, world.x);
    const minY = Math.min(this.startPointerWorld.y, world.y);
    const maxX = Math.max(this.startPointerWorld.x, world.x);
    const maxY = Math.max(this.startPointerWorld.y, world.y);

    this.marqueeBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };

    const intersecting = this.store.queryIntersecting(new Bounds(minX, minY, maxX, maxY));
    this.selection.setSelection(intersecting.map((o) => o.id));
  }

  private commitTransformHistory(): void {
    const beforeStates: ObjectTransformState[] = [];
    const afterStates: ObjectTransformState[] = [];

    let hasChanges = false;
    for (const [id, before] of this.initialTransformStates.entries()) {
      const current = this.store.get(id);
      if (!current) continue;

      const after: ObjectTransformState = {
        id: current.id,
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height,
        rotation: current.rotation
      };
      if (current.type === 'line' || current.type === 'arrow') {
        after.x2 = current.x2;
        after.y2 = current.y2;
      }

      if (
        before.x !== after.x ||
        before.y !== after.y ||
        before.width !== after.width ||
        before.height !== after.height ||
        before.rotation !== after.rotation ||
        before.x2 !== after.x2 ||
        before.y2 !== after.y2
      ) {
        hasChanges = true;
      }

      beforeStates.push(before);
      afterStates.push(after);
    }

    if (hasChanges && beforeStates.length > 0) {
      const cmd = new TransformObjectsCommand(
        this.store,
        'Transform objects',
        beforeStates,
        afterStates
      );
      this.history.record(cmd);
    }
  }
}
