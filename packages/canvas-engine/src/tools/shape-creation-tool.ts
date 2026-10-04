/**
 * Shape Creation Tool
 * Handles interactive drawing of Rectangle, Ellipse, Line, Arrow, Text, and Sticky Note.
 */
import {
  CanvasObject,
  CanvasObjectType,
  Point,
  ToolType
} from '@alignify/shared-types';
import { CreateObjectCommand } from '../history/create-object.command';
import { CommandStack } from '../history/command-stack';
import { Snap } from '../math/snap';
import { ObjectFactory } from '../objects/object-factory';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';
import { ITool, PointerEventInfo } from './tool';

export type ToolCompletionCallback = (createdObject: CanvasObject) => void;

export class ShapeCreationTool implements ITool {
  readonly cursor = 'crosshair';
  private startPoint: Point | null = null;
  private previewObject: CanvasObject | null = null;
  private isDrawing = false;

  constructor(
    public readonly type: ToolType,
    private readonly store: ObjectStore,
    private readonly selection: SelectionManager,
    private readonly history: CommandStack,
    private readonly onComplete?: ToolCompletionCallback
  ) {}

  getPreviewObject(): CanvasObject | null {
    return this.previewObject;
  }

  onPointerDown(event: PointerEventInfo): void {
    if (event.button !== 0) return;
    this.isDrawing = true;
    this.startPoint = { ...event.worldPoint };
    this.previewObject = this.createInitialObject(this.startPoint);
  }

  onPointerMove(event: PointerEventInfo): void {
    if (!this.isDrawing || !this.startPoint || !this.previewObject) return;

    const current = event.worldPoint;
    const start = this.startPoint;

    if (this.type === 'line' || this.type === 'arrow') {
      let endX = current.x;
      let endY = current.y;

      if (event.shiftKey) {
        // Snap line to 0, 45, 90, 135, 180 degrees
        const dx = endX - start.x;
        const dy = endY - start.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const snappedAngle = Snap.snapAngle(angle, 45) * (Math.PI / 180);
        const dist = Math.hypot(dx, dy);
        endX = start.x + dist * Math.cos(snappedAngle);
        endY = start.y + dist * Math.sin(snappedAngle);
      }

      this.previewObject = {
        ...this.previewObject,
        x: start.x,
        y: start.y,
        x2: endX,
        y2: endY,
        width: Math.abs(endX - start.x),
        height: Math.abs(endY - start.y)
      } as CanvasObject;
    } else {
      let width = current.x - start.x;
      let height = current.y - start.y;

      if (event.shiftKey) {
        // Constrain aspect ratio (1:1)
        const side = Math.max(Math.abs(width), Math.abs(height));
        width = Math.sign(width) * side || side;
        height = Math.sign(height) * side || side;
      }

      const x = width < 0 ? start.x + width : start.x;
      const y = height < 0 ? start.y + height : start.y;

      this.previewObject = {
        ...this.previewObject,
        x,
        y,
        width: Math.max(1, Math.abs(width)),
        height: Math.max(1, Math.abs(height))
      } as CanvasObject;
    }
  }

  onPointerUp(event: PointerEventInfo): void {
    if (!this.isDrawing || !this.startPoint) {
      this.reset();
      return;
    }

    const current = event.worldPoint;
    const dragDistance = Math.hypot(
      current.x - this.startPoint.x,
      current.y - this.startPoint.y
    );

    let finalObject: CanvasObject;

    if (dragDistance < 6) {
      // User performed a single click: spawn default size object centered/origin at click
      finalObject = this.createDefaultObject(this.startPoint);
    } else if (this.previewObject) {
      finalObject = { ...this.previewObject, id: this.generateId() };
    } else {
      this.reset();
      return;
    }

    // Execute creation command on history stack
    const cmd = new CreateObjectCommand(this.store, [finalObject]);
    this.history.execute(cmd);

    // Select the newly created object
    this.selection.select(finalObject.id);

    this.reset();

    if (this.onComplete) {
      this.onComplete(finalObject);
    }
  }

  onDeactivate(): void {
    this.reset();
  }

  getCursor(): string {
    return this.cursor;
  }

  private reset(): void {
    this.isDrawing = false;
    this.startPoint = null;
    this.previewObject = null;
  }

  private generateId(): string {
    return 'obj_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  private createInitialObject(pos: Point): CanvasObject {
    return ObjectFactory.create(this.type as CanvasObjectType, {
      x: pos.x,
      y: pos.y,
      width: 1,
      height: 1
    });
  }

  private createDefaultObject(pos: Point): CanvasObject {
    switch (this.type) {
      case 'rectangle':
        return ObjectFactory.createRectangle({
          x: pos.x - 80,
          y: pos.y - 50,
          width: 160,
          height: 100
        });
      case 'ellipse':
        return ObjectFactory.createEllipse({
          x: pos.x - 70,
          y: pos.y - 70,
          width: 140,
          height: 140
        });
      case 'text':
        return ObjectFactory.createText({
          x: pos.x,
          y: pos.y - 20,
          width: 160,
          height: 40
        });
      case 'sticky':
        return ObjectFactory.createStickyNote({
          x: pos.x - 90,
          y: pos.y - 90,
          width: 180,
          height: 180
        });
      case 'line':
        return ObjectFactory.createLine({
          x: pos.x - 80,
          y: pos.y,
          x2: pos.x + 80,
          y2: pos.y
        });
      case 'arrow':
        return ObjectFactory.createArrow({
          x: pos.x - 80,
          y: pos.y,
          x2: pos.x + 80,
          y2: pos.y
        });
      default:
        return ObjectFactory.createRectangle({ x: pos.x, y: pos.y });
    }
  }
}
