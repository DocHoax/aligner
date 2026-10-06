/**
 * Tool Manager
 * Coordinates tool activation, transitions, temporary mode switching (e.g. Space-to-pan),
 * and dispatches pointer/keyboard events to the active tool.
 */
import { CanvasObject, Rect, ToolType } from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { CommandStack } from '../history/command-stack';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';
import { PanTool } from './pan-tool';
import { SelectTool, EditRequestCallback } from './select-tool';
import { ShapeCreationTool, ToolCompletionCallback } from './shape-creation-tool';
import { ITool, KeyEventInfo, PointerEventInfo } from './tool';

export type ToolChangeCallback = (toolType: ToolType) => void;

export class ToolManager {
  private tools = new Map<ToolType, ITool>();
  private activeToolType: ToolType = 'select';
  private activeTool: ITool;
  private previousToolType: ToolType | null = null;
  private isSpacePanning = false;

  private onToolChangeCallbacks: ToolChangeCallback[] = [];

  constructor(
    private readonly store: ObjectStore,
    private readonly selection: SelectionManager,
    private readonly camera: Camera,
    private readonly history: CommandStack,
    private readonly onEditRequest?: EditRequestCallback
  ) {
    this.initTools();
    this.activeTool = this.tools.get('select')!;
    if (this.activeTool.onActivate) {
      this.activeTool.onActivate();
    }
  }

  private initTools(): void {
    // 1. Select Tool
    const selectTool = new SelectTool(
      this.store,
      this.selection,
      this.camera,
      this.history,
      this.onEditRequest
    );
    this.tools.set('select', selectTool);

    // 2. Pan Tool
    const panTool = new PanTool(this.camera);
    this.tools.set('pan', panTool);

    // 3. Shape Creation Tools (auto switches back to select tool upon completion)
    const onShapeComplete: ToolCompletionCallback = (_created) => {
      this.setTool('select');
    };

    const shapeTypes: ToolType[] = ['rectangle', 'ellipse', 'line', 'arrow', 'text', 'sticky', 'frame'];
    for (const type of shapeTypes) {
      this.tools.set(
        type,
        new ShapeCreationTool(
          type,
          this.store,
          this.selection,
          this.history,
          onShapeComplete
        )
      );
    }
  }

  onToolChange(cb: ToolChangeCallback): () => void {
    this.onToolChangeCallbacks.push(cb);
    return () => {
      this.onToolChangeCallbacks = this.onToolChangeCallbacks.filter((c) => c !== cb);
    };
  }

  getTool(): ToolType {
    return this.activeToolType;
  }

  getActiveToolInstance(): ITool {
    return this.activeTool;
  }

  setTool(toolType: ToolType): void {
    if (this.activeToolType === toolType) return;

    if (this.activeTool.onDeactivate) {
      this.activeTool.onDeactivate();
    }

    const next = this.tools.get(toolType);
    if (!next) {
      console.warn(`[ToolManager] Unknown tool type: ${toolType}`);
      return;
    }

    this.activeToolType = toolType;
    this.activeTool = next;

    if (this.activeTool.onActivate) {
      this.activeTool.onActivate();
    }

    for (const cb of this.onToolChangeCallbacks) {
      cb(toolType);
    }
  }

  getPreviewObject(): CanvasObject | null {
    if (this.activeTool instanceof ShapeCreationTool) {
      return this.activeTool.getPreviewObject();
    }
    return null;
  }

  getMarqueeBox(): Rect | null {
    if (this.activeTool instanceof SelectTool) {
      return this.activeTool.getMarqueeBox();
    }
    return null;
  }

  getCursor(): string {
    return this.activeTool.getCursor();
  }

  // Pointer Event Dispatch
  onPointerDown(event: PointerEventInfo): void {
    // Middle click pan override
    if (event.button === 1) {
      const panTool = this.tools.get('pan');
      if (panTool) {
        panTool.onPointerDown(event);
        return;
      }
    }
    this.activeTool.onPointerDown(event);
  }

  onPointerMove(event: PointerEventInfo): void {
    if (event.button === 1 || (this.isSpacePanning && this.activeToolType === 'pan')) {
      const panTool = this.tools.get('pan');
      if (panTool) {
        panTool.onPointerMove(event);
        return;
      }
    }
    this.activeTool.onPointerMove(event);
  }

  onPointerUp(event: PointerEventInfo): void {
    if (event.button === 1) {
      const panTool = this.tools.get('pan');
      if (panTool) {
        panTool.onPointerUp(event);
        return;
      }
    }
    this.activeTool.onPointerUp(event);
  }

  onDoubleClick(event: PointerEventInfo): void {
    if (this.activeTool.onDoubleClick) {
      this.activeTool.onDoubleClick(event);
    }
  }

  // Keyboard Space Panning Handling
  handleKeyDown(event: KeyEventInfo): boolean {
    if (event.code === 'Space' && !this.isSpacePanning && this.activeToolType !== 'pan') {
      this.isSpacePanning = true;
      this.previousToolType = this.activeToolType;
      this.setTool('pan');
      return true;
    }

    if (this.activeTool.onKeyDown) {
      return this.activeTool.onKeyDown(event);
    }
    return false;
  }

  handleKeyUp(event: KeyEventInfo): boolean {
    if (event.code === 'Space' && this.isSpacePanning) {
      this.isSpacePanning = false;
      if (this.previousToolType) {
        this.setTool(this.previousToolType);
        this.previousToolType = null;
      }
      return true;
    }

    if (this.activeTool.onKeyUp) {
      return this.activeTool.onKeyUp(event);
    }
    return false;
  }
}
