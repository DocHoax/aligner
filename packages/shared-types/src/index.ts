/**
 * @alignify/shared-types
 * Core domain types and interfaces for the Alignify collaborative canvas platform.
 */

// ==========================================
// 1. Math & Coordinates
// ==========================================

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

export interface IBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface TransformMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

// ==========================================
// 2. Styling Tokens & Properties
// ==========================================

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export type FontFamily = 'Inter' | 'JetBrains Mono' | 'Fira Code' | 'system-ui';

export type TextAlign = 'left' | 'center' | 'right';

export type VerticalAlign = 'top' | 'middle' | 'bottom';

export type ArrowHeadType = 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond';

export type StickyColor = 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'orange' | 'gray';

export interface ObjectStyle {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  opacity?: number;
  cornerRadius?: number;
  fontFamily?: FontFamily;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: TextAlign;
  textColor?: string;
  stickyColor?: StickyColor;
  startHead?: ArrowHeadType;
  endHead?: ArrowHeadType;
}

// ==========================================
// 3. Canvas Object Hierarchy
// ==========================================

export type CanvasObjectType =
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'sticky'
  | 'line'
  | 'arrow'
  | 'frame'
  | 'group';

export interface BaseCanvasObject {
  readonly id: string;
  readonly type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in degrees: [0, 360)
  zIndex: number;
  locked: boolean;
  opacity: number; // [0, 1]
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RectangleObject extends BaseCanvasObject {
  readonly type: 'rectangle';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  cornerRadius: number;
}

export interface EllipseObject extends BaseCanvasObject {
  readonly type: 'ellipse';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
}

export interface TextObject extends BaseCanvasObject {
  readonly type: 'text';
  text: string;
  fontFamily: FontFamily;
  fontSize: number;
  fontWeight: number | string;
  textAlign: TextAlign;
  textColor: string;
  autoSize: boolean;
}

export interface StickyNoteObject extends BaseCanvasObject {
  readonly type: 'sticky';
  text: string;
  stickyColor: StickyColor;
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
  textColor: string;
}

export interface LineObject extends BaseCanvasObject {
  readonly type: 'line';
  x2: number; // World end X (x is start X)
  y2: number; // World end Y (y is start Y)
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  startHead: ArrowHeadType;
  endHead: ArrowHeadType;
}

export interface ArrowObject extends BaseCanvasObject {
  readonly type: 'arrow';
  x2: number; // World end X
  y2: number; // World end Y
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  startHead: ArrowHeadType;
  endHead: ArrowHeadType;
  curved?: boolean;
}

export type CanvasObject =
  | RectangleObject
  | EllipseObject
  | TextObject
  | StickyNoteObject
  | LineObject
  | ArrowObject;

// ==========================================
// 4. Tools, Handles & Interactions
// ==========================================

export type ToolType =
  | 'select'
  | 'pan'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky';

export type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotation'
  | 'line-start'
  | 'line-end';

export interface ResizeHandleInfo {
  readonly type: HandleType;
  readonly worldPosition: Point;
  readonly screenPosition: Point;
  readonly cursor: string;
}

export interface SelectionState {
  readonly selectedIds: ReadonlySet<string>;
  readonly hoveredId: string | null;
  readonly activeHandle: HandleType | null;
  readonly bounds: IBoundingBox | null;
  readonly isMultiSelect: boolean;
}

// ==========================================
// 5. Camera & Viewport
// ==========================================

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

// ==========================================
// 6. Persistence & Document Schema
// ==========================================

export const CURRENT_DOCUMENT_VERSION = 1;

export interface BoardMetadata {
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  backgroundColor?: string;
  gridEnabled?: boolean;
  snapToGrid?: boolean;
  gridSize?: number;
}

export interface BoardDocument {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  camera: CameraState;
  objects: CanvasObject[];
  metadata: BoardMetadata;
}

export interface BoardSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  objectCount: number;
  thumbnail?: string;
}

// ==========================================
// 7. Export Types
// ==========================================

export type ExportFormat = 'png' | 'svg' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  scale?: number; // default: 2 (retina)
  includeBackground?: boolean;
  backgroundColor?: string;
  padding?: number; // padding in px around content bounds
  selectedOnly?: boolean;
}

// ==========================================
// 8. Command & History Types
// ==========================================

export interface Command {
  readonly id: string;
  readonly description: string;
  execute(): void;
  undo(): void;
  redo(): void;
}

// ==========================================
// 9. Color Presets & Defaults
// ==========================================

export const STICKY_COLOR_MAP: Record<StickyColor, { bg: string; text: string; border: string }> = {
  yellow: { bg: '#fef08a', text: '#854d0e', border: '#fde047' },
  green: { bg: '#bbf7d0', text: '#166534', border: '#86efac' },
  blue: { bg: '#bfdbfe', text: '#1e40af', border: '#93c5fd' },
  purple: { bg: '#e9d5ff', text: '#6b21a8', border: '#d8b4fe' },
  pink: { bg: '#fbcfe8', text: '#9d174d', border: '#f472b6' },
  orange: { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' },
  gray: { bg: '#e2e8f0', text: '#334155', border: '#cbd5e1' }
};

export const DEFAULT_OBJECT_COLORS = {
  fill: '#1e293b',
  stroke: '#64748b',
  text: '#f8fafc',
  selection: '#3b82f6',
  selectionFill: 'rgba(59, 130, 246, 0.12)',
  handleFill: '#ffffff',
  handleStroke: '#3b82f6',
  gridDots: '#334155',
  gridLines: '#1e293b',
  canvasBackground: '#0f172a'
};
