/**
 * Canvas Engine Master Facade
 * High-performance, framework-agnostic core engine unifying Camera, Store, Selection,
 * Tools, History, Renderer, Clipboard, Storage, and Reactive Event Bus.
 */
import {
  CanvasObject,
  DocumentMeta,
  ObjectStyle,
  Point,
  ToolType
} from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { ClipboardManager } from '../clipboard/clipboard-manager';
import { ExportManager } from '../export/export-manager';
import { CommandStack } from '../history/command-stack';
import { DeleteObjectsCommand } from '../history/delete-objects.command';
import { ReorderObjectsCommand } from '../history/reorder-objects.command';
import { UpdatePropertiesCommand } from '../history/update-properties.command';
import { ObjectStore } from '../objects/object-store';
import { CanvasRenderer2D, RendererOptions } from '../renderer/canvas-renderer-2d';
import { SelectionManager } from '../selection/selection-manager';
import { IndexedDBStorage } from '../storage/indexeddb-storage';
import { DocumentSerializer } from '../storage/document-serializer';
import { ToolManager } from '../tools/tool-manager';
import { KeyEventInfo, PointerEventInfo } from '../tools/tool';
import { EventBus } from './event-bus';
import { RenderLoop } from './render-loop';

export interface CanvasEngineOptions {
  rendererOptions?: Partial<RendererOptions>;
  autosaveIntervalMs?: number;
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Subsystems
  private readonly store: ObjectStore;
  private readonly camera: Camera;
  private readonly selection: SelectionManager;
  private readonly history: CommandStack;
  private readonly tools: ToolManager;
  private readonly clipboard: ClipboardManager;
  private readonly storage: IndexedDBStorage;
  private readonly exportManager: ExportManager;
  private readonly renderer: CanvasRenderer2D;
  private readonly eventBus: EventBus;
  private readonly renderLoop: RenderLoop;

  // Active Document State
  private currentDocumentMeta: DocumentMeta = {
    id: 'doc_' + Date.now().toString(36),
    name: 'Untitled Architecture Diagram',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    objectCount: 0
  };

  private autosaveTimer: number | null = null;
  private isDestroyed = false;

  // Bound Event Handlers
  private boundPointerDown = this.handlePointerDown.bind(this);
  private boundPointerMove = this.handlePointerMove.bind(this);
  private boundPointerUp = this.handlePointerUp.bind(this);
  private boundDoubleClick = this.handleDoubleClick.bind(this);
  private boundWheel = this.handleWheel.bind(this);
  private boundKeyDown = this.handleKeyDown.bind(this);
  private boundKeyUp = this.handleKeyUp.bind(this);
  private boundContextMenu = (e: MouseEvent) => e.preventDefault();

  constructor(options: CanvasEngineOptions = {}) {
    this.store = new ObjectStore();
    this.camera = new Camera();
    this.selection = new SelectionManager(this.store);
    this.history = new CommandStack();
    this.eventBus = new EventBus();
    this.storage = new IndexedDBStorage();
    this.renderer = new CanvasRenderer2D(options.rendererOptions);

    this.tools = new ToolManager(
      this.store,
      this.selection,
      this.camera,
      this.history,
      (editObj) => {
        this.eventBus.emit('edit_request', editObj);
      }
    );

    this.clipboard = new ClipboardManager(this.store, this.selection, this.history);
    this.exportManager = new ExportManager(this.store, this.selection, this.camera);

    this.renderLoop = new RenderLoop(() => this.drawFrame());

    this.setupSubsystemListeners();
    this.setupAutosave(options.autosaveIntervalMs || 3000);
  }

  // --- Subsystem Getters ---
  getStore(): ObjectStore {
    return this.store;
  }
  getCamera(): Camera {
    return this.camera;
  }
  getSelection(): SelectionManager {
    return this.selection;
  }
  getHistory(): CommandStack {
    return this.history;
  }
  getTools(): ToolManager {
    return this.tools;
  }
  getClipboard(): ClipboardManager {
    return this.clipboard;
  }
  getStorage(): IndexedDBStorage {
    return this.storage;
  }
  getExport(): ExportManager {
    return this.exportManager;
  }
  getEventBus(): EventBus {
    return this.eventBus;
  }
  getRenderer(): CanvasRenderer2D {
    return this.renderer;
  }

  // --- DOM Attachment Lifecycle ---
  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas) {
      this.detach();
    }
    this.canvas = canvas;
    this.renderer.attach(canvas);

    // Event listeners on Canvas element
    canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    canvas.addEventListener('dblclick', this.boundDoubleClick);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.boundContextMenu);

    // Keyboard shortcuts (window level when active)
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    // Resize Observer for dynamic layout resize
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.renderer.updateSize()) {
          this.renderLoop.requestRender();
        }
      });
      this.resizeObserver.observe(canvas);
    }

    this.renderLoop.start();
    this.renderLoop.requestRender();
  }

  detach(): void {
    if (!this.canvas) return;

    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('dblclick', this.boundDoubleClick);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);

    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.renderLoop.stop();
    this.renderer.detach();
    this.canvas = null;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.detach();
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.eventBus.clear();
  }

  // --- Tool & Selection Public Methods ---
  setTool(toolType: ToolType): void {
    this.tools.setTool(toolType);
    this.renderLoop.requestRender();
  }

  getTool(): ToolType {
    return this.tools.getTool();
  }

  selectAll(): void {
    const allIds = this.store.getAll().map((o) => o.id);
    this.selection.setSelection(allIds);
    this.renderLoop.requestRender();
  }

  clearSelection(): void {
    this.selection.clear();
    this.renderLoop.requestRender();
  }

  deleteSelected(): void {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return;

    const cmd = new DeleteObjectsCommand(this.store, selected);
    this.history.execute(cmd);
    this.selection.clear();
    this.renderLoop.requestRender();
  }

  updateSelectedStyle(styleUpdates: Partial<ObjectStyle>): void {
    this.updateSelectedProperties(styleUpdates as Partial<CanvasObject>);
  }

  updateSelectedProperties(properties: Partial<CanvasObject>): void {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return;

    const updates = selected.map((obj) => {
      const before: Partial<CanvasObject> = {};
      const after: Partial<CanvasObject> = {};

      for (const key of Object.keys(properties) as Array<keyof CanvasObject>) {
        (before as Record<string, unknown>)[key] = obj[key];
        (after as Record<string, unknown>)[key] = properties[key];
      }

      return { id: obj.id, before, after };
    });

    const cmd = new UpdatePropertiesCommand(this.store, 'Update properties', updates);
    this.history.execute(cmd);
    this.renderLoop.requestRender();
  }

  reorderSelected(action: 'bringToFront' | 'sendToBack' | 'bringForward' | 'sendBackward'): void {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return;

    const ids = selected.map((o) => o.id);
    const cmd = ReorderObjectsCommand.create(this.store, ids, action);
    this.history.record(cmd);
    this.renderLoop.requestRender();
  }

  // --- Camera Operations ---
  setZoom(zoom: number): void {
    if (!this.canvas) return;
    const viewport = this.renderer.getViewportSize();
    const centerScreen: Point = { x: viewport.width / 2, y: viewport.height / 2 };
    this.camera.zoomAt(centerScreen, zoom / this.camera.zoom, viewport);
    this.renderLoop.requestRender();
  }

  zoomIn(): void {
    if (!this.canvas) return;
    const viewport = this.renderer.getViewportSize();
    this.camera.zoomAt(
      { x: viewport.width / 2, y: viewport.height / 2 },
      1.2,
      viewport
    );
    this.renderLoop.requestRender();
  }

  zoomOut(): void {
    if (!this.canvas) return;
    const viewport = this.renderer.getViewportSize();
    this.camera.zoomAt(
      { x: viewport.width / 2, y: viewport.height / 2 },
      1 / 1.2,
      viewport
    );
    this.renderLoop.requestRender();
  }

  resetZoom(): void {
    this.camera.setState({ zoom: 1 });
    this.renderLoop.requestRender();
  }

  fitToContent(padding = 64): void {
    const objects = this.store.getAll();
    const viewport = this.renderer.getViewportSize();
    this.camera.fitToObjects(objects, viewport, padding);
    this.renderLoop.requestRender();
  }

  // --- Document Lifecycle & Persistence ---
  newDocument(name = 'Untitled Diagram'): void {
    this.store.clear();
    this.selection.clear();
    this.history.clear();
    this.camera.setState({ x: 0, y: 0, zoom: 1 });

    this.currentDocumentMeta = {
      id: 'doc_' + Date.now().toString(36),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      objectCount: 0
    };

    this.eventBus.emit('document_changed', this.currentDocumentMeta);
    this.renderLoop.requestRender();
  }

  async saveDocument(): Promise<void> {
    const objects = this.store.getAll();
    this.currentDocumentMeta.updatedAt = Date.now();
    this.currentDocumentMeta.objectCount = objects.length;

    const doc = DocumentSerializer.serialize(
      this.currentDocumentMeta,
      objects,
      this.camera.getState()
    );

    await this.storage.saveDocument(doc);
    this.eventBus.emit('document_saved', this.currentDocumentMeta);
  }

  async loadDocument(id: string): Promise<boolean> {
    const doc = await this.storage.loadDocument(id);
    if (!doc) return false;

    const { meta, objects, camera } = DocumentSerializer.deserialize(doc as unknown as Record<string, unknown>);
    this.store.reset(objects);
    this.selection.clear();
    this.history.clear();

    this.camera.setState(camera);
    this.currentDocumentMeta = meta;

    this.eventBus.emit('document_loaded', this.currentDocumentMeta);
    this.renderLoop.requestRender();
    return true;
  }

  async loadFromJSON(jsonString: string): Promise<void> {
    const { meta, objects, camera } = DocumentSerializer.deserialize(jsonString);
    this.store.reset(objects);
    this.selection.clear();
    this.history.clear();

    this.camera.setState(camera);
    this.currentDocumentMeta = meta;

    this.eventBus.emit('document_loaded', this.currentDocumentMeta);
    this.renderLoop.requestRender();
  }

  getDocumentMeta(): DocumentMeta {
    return { ...this.currentDocumentMeta };
  }

  setDocumentName(name: string): void {
    this.currentDocumentMeta.name = name;
    this.currentDocumentMeta.updatedAt = Date.now();
    this.eventBus.emit('document_changed', this.currentDocumentMeta);
    this.saveDocument();
  }

  // --- Subsystem Event Coordination ---
  private setupSubsystemListeners(): void {
    this.store.subscribe(() => {
      this.currentDocumentMeta.objectCount = this.store.getAll().length;
      this.eventBus.emit('store_changed', this.store.getAll());
      this.renderLoop.requestRender();
    });

    this.selection.subscribe(() => {
      const selected = this.selection.getSelectedObjects();
      this.eventBus.emit('selection_changed', selected);
      this.renderLoop.requestRender();
    });

    this.camera.subscribe((state) => {
      this.eventBus.emit('camera_changed', state);
      this.renderLoop.requestRender();
    });

    this.history.subscribe((state) => {
      this.eventBus.emit('history_changed', state);
    });

    this.tools.onToolChange((tool) => {
      this.eventBus.emit('tool_changed', tool);
      this.updateCursor();
      this.renderLoop.requestRender();
    });
  }

  private setupAutosave(intervalMs: number): void {
    if (typeof window === 'undefined') return;
    this.autosaveTimer = window.setInterval(() => {
      if (!this.isDestroyed && this.store.getAll().length > 0) {
        this.saveDocument().catch((e) => console.warn('[CanvasEngine] Autosave error', e));
      }
    }, intervalMs);
  }

  private drawFrame(): void {
    this.renderer.render(
      this.store,
      this.camera,
      this.selection,
      this.tools.getPreviewObject(),
      this.tools.getMarqueeBox()
    );
  }

  private updateCursor(): void {
    if (!this.canvas) return;
    this.canvas.style.cursor = this.tools.getCursor();
  }

  // --- Input Event Dispatchers ---
  private createPointerInfo(e: PointerEvent | MouseEvent): PointerEventInfo | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const screenPoint: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    const viewport = this.renderer.getViewportSize();
    const worldPoint = this.camera.screenToWorld(screenPoint, viewport);

    return {
      screenPoint,
      worldPoint,
      button: e.button,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      originalEvent: e
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    const info = this.createPointerInfo(e);
    if (!info) return;
    this.tools.onPointerDown(info);
    this.updateCursor();
    this.renderLoop.requestRender();
  }

  private handlePointerMove(e: PointerEvent): void {
    const info = this.createPointerInfo(e);
    if (!info) return;
    this.tools.onPointerMove(info);
    this.updateCursor();
    this.renderLoop.requestRender();
  }

  private handlePointerUp(e: PointerEvent): void {
    const info = this.createPointerInfo(e);
    if (!info) return;
    this.tools.onPointerUp(info);
    this.updateCursor();
    this.renderLoop.requestRender();
  }

  private handleDoubleClick(e: MouseEvent): void {
    const info = this.createPointerInfo(e);
    if (!info) return;
    this.tools.onDoubleClick(info);
    this.renderLoop.requestRender();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const cursorScreen: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    const viewport = this.renderer.getViewportSize();

    if (e.ctrlKey || e.metaKey) {
      // Zoom with wheel
      const zoomFactor = Math.pow(0.999, e.deltaY);
      this.camera.zoomAt(cursorScreen, zoomFactor, viewport);
    } else {
      // Pan with wheel / trackpad
      this.camera.panByScreenDelta(-e.deltaX, -e.deltaY);
    }

    this.renderLoop.requestRender();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore global shortcuts when user is typing inside an input or textarea
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const keyInfo: KeyEventInfo = {
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      originalEvent: e
    };

    if (this.tools.handleKeyDown(keyInfo)) {
      this.updateCursor();
      this.renderLoop.requestRender();
      return;
    }

    // Standard Workspace Keyboard Shortcuts
    if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.history.undo();
      this.renderLoop.requestRender();
      return;
    }

    if ((isCtrl && e.shiftKey && e.key.toLowerCase() === 'z') || (isCtrl && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      this.history.redo();
      this.renderLoop.requestRender();
      return;
    }

    if (isCtrl && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.clipboard.copy();
      return;
    }

    if (isCtrl && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      this.clipboard.cut();
      this.renderLoop.requestRender();
      return;
    }

    if (isCtrl && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      this.clipboard.paste();
      this.renderLoop.requestRender();
      return;
    }

    if (isCtrl && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.clipboard.duplicate();
      this.renderLoop.requestRender();
      return;
    }

    if (isCtrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.selectAll();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
      return;
    }

    if (e.key === 'Escape') {
      this.clearSelection();
      this.setTool('select');
      return;
    }

    // Tool hotkeys
    switch (e.key.toLowerCase()) {
      case 'v':
        this.setTool('select');
        break;
      case 'h':
        this.setTool('pan');
        break;
      case 'r':
        this.setTool('rectangle');
        break;
      case 'o':
      case 'e':
        this.setTool('ellipse');
        break;
      case 't':
        this.setTool('text');
        break;
      case 's':
        this.setTool('sticky');
        break;
      case 'l':
        this.setTool('line');
        break;
      case 'a':
        if (!isCtrl) this.setTool('arrow');
        break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const keyInfo: KeyEventInfo = {
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      originalEvent: e
    };

    if (this.tools.handleKeyUp(keyInfo)) {
      this.updateCursor();
      this.renderLoop.requestRender();
    }
  }
}
