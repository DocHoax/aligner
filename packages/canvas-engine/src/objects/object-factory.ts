/**
 * Canvas Object Factory
 * Creates strongly-typed canvas objects with sensible defaults.
 */
import {
  ArrowObject,
  CanvasObject,
  CanvasObjectType,
  DEFAULT_OBJECT_COLORS,
  EllipseObject,
  FrameObject,
  GroupObject,
  LineObject,
  RectangleObject,
  StickyColor,
  StickyNoteObject,
  TextObject
} from '@alignify/shared-types';

export class ObjectFactory {
  private static generateId(): string {
    return 'obj_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  static createRectangle(props: Partial<RectangleObject> = {}): RectangleObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'rectangle',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 160,
      height: props.height ?? 100,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      fillColor: props.fillColor ?? DEFAULT_OBJECT_COLORS.fill,
      strokeColor: props.strokeColor ?? DEFAULT_OBJECT_COLORS.stroke,
      strokeWidth: props.strokeWidth ?? 2,
      strokeStyle: props.strokeStyle ?? 'solid',
      cornerRadius: props.cornerRadius ?? 8,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createEllipse(props: Partial<EllipseObject> = {}): EllipseObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'ellipse',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 140,
      height: props.height ?? 140,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      fillColor: props.fillColor ?? DEFAULT_OBJECT_COLORS.fill,
      strokeColor: props.strokeColor ?? DEFAULT_OBJECT_COLORS.stroke,
      strokeWidth: props.strokeWidth ?? 2,
      strokeStyle: props.strokeStyle ?? 'solid',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createText(props: Partial<TextObject> = {}): TextObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'text',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 160,
      height: props.height ?? 40,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      text: props.text ?? 'Heading',
      fontFamily: props.fontFamily ?? 'Inter',
      fontSize: props.fontSize ?? 20,
      fontWeight: props.fontWeight ?? 600,
      textAlign: props.textAlign ?? 'left',
      textColor: props.textColor ?? DEFAULT_OBJECT_COLORS.text,
      autoSize: props.autoSize ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createStickyNote(props: Partial<StickyNoteObject> = {}): StickyNoteObject {
    const now = Date.now();
    const color: StickyColor = props.stickyColor ?? 'yellow';
    return {
      id: props.id ?? this.generateId(),
      type: 'sticky',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 180,
      height: props.height ?? 180,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      text: props.text ?? 'Note...',
      stickyColor: color,
      fontFamily: props.fontFamily ?? 'Inter',
      fontSize: props.fontSize ?? 16,
      textAlign: props.textAlign ?? 'left',
      textColor: props.textColor ?? '#1e293b',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createLine(props: Partial<LineObject> = {}): LineObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'line',
      x: props.x ?? 0,
      y: props.y ?? 0,
      x2: props.x2 ?? (props.x ?? 0) + 160,
      y2: props.y2 ?? (props.y ?? 0),
      width: Math.abs((props.x2 ?? 160) - (props.x ?? 0)),
      height: Math.abs((props.y2 ?? 0) - (props.y ?? 0)),
      rotation: 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      strokeColor: props.strokeColor ?? DEFAULT_OBJECT_COLORS.stroke,
      strokeWidth: props.strokeWidth ?? 2,
      strokeStyle: props.strokeStyle ?? 'solid',
      startHead: props.startHead ?? 'none',
      endHead: props.endHead ?? 'none',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createArrow(props: Partial<ArrowObject> = {}): ArrowObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'arrow',
      x: props.x ?? 0,
      y: props.y ?? 0,
      x2: props.x2 ?? (props.x ?? 0) + 160,
      y2: props.y2 ?? (props.y ?? 0),
      width: Math.abs((props.x2 ?? 160) - (props.x ?? 0)),
      height: Math.abs((props.y2 ?? 0) - (props.y ?? 0)),
      rotation: 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      strokeColor: props.strokeColor ?? '#3b82f6',
      strokeWidth: props.strokeWidth ?? 2,
      strokeStyle: props.strokeStyle ?? 'solid',
      startHead: props.startHead ?? 'none',
      endHead: props.endHead ?? 'arrow',
      curved: props.curved ?? false,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createFrame(props: Partial<FrameObject> = {}): FrameObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'frame',
      name: props.name ?? 'Frame',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 400,
      height: props.height ?? 300,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      fillColor: props.fillColor ?? '#ffffff',
      strokeColor: props.strokeColor ?? '#94a3b8',
      strokeWidth: props.strokeWidth ?? 1,
      strokeStyle: props.strokeStyle ?? 'solid',
      cornerRadius: props.cornerRadius ?? 0,
      clipContent: props.clipContent ?? false,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static createGroup(props: Partial<GroupObject> = {}): GroupObject {
    const now = Date.now();
    return {
      id: props.id ?? this.generateId(),
      type: 'group',
      name: props.name ?? 'Group',
      x: props.x ?? 0,
      y: props.y ?? 0,
      width: props.width ?? 100,
      height: props.height ?? 100,
      rotation: props.rotation ?? 0,
      zIndex: props.zIndex ?? 0,
      locked: props.locked ?? false,
      opacity: props.opacity ?? 1,
      childIds: props.childIds ?? [],
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      metadata: props.metadata
    };
  }

  static create(type: CanvasObjectType, props: Partial<CanvasObject> = {}): CanvasObject {
    switch (type) {
      case 'rectangle':
        return this.createRectangle(props as Partial<RectangleObject>);
      case 'ellipse':
        return this.createEllipse(props as Partial<EllipseObject>);
      case 'text':
        return this.createText(props as Partial<TextObject>);
      case 'sticky':
        return this.createStickyNote(props as Partial<StickyNoteObject>);
      case 'line':
        return this.createLine(props as Partial<LineObject>);
      case 'arrow':
        return this.createArrow(props as Partial<ArrowObject>);
      case 'frame':
        return this.createFrame(props as Partial<FrameObject>);
      case 'group':
        return this.createGroup(props as Partial<GroupObject>);
      default:
        return this.createRectangle(props as Partial<RectangleObject>);
    }
  }
}
