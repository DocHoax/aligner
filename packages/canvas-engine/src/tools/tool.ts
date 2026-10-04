/**
 * Tool Base Interface
 */
import { Point, ToolType } from '@alignify/shared-types';

export interface PointerEventInfo {
  screenPoint: Point;
  worldPoint: Point;
  button: number; // 0 = left, 1 = middle, 2 = right
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  originalEvent: PointerEvent | MouseEvent;
}

export interface KeyEventInfo {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  originalEvent: KeyboardEvent;
}

export interface ITool {
  readonly type: ToolType;
  readonly cursor: string;

  onActivate?(): void;
  onDeactivate?(): void;

  onPointerDown(event: PointerEventInfo): void;
  onPointerMove(event: PointerEventInfo): void;
  onPointerUp(event: PointerEventInfo): void;
  onDoubleClick?(event: PointerEventInfo): void;

  onKeyDown?(event: KeyEventInfo): boolean; // returns true if handled
  onKeyUp?(event: KeyEventInfo): boolean;

  getCursor(event?: PointerEventInfo): string;
}
