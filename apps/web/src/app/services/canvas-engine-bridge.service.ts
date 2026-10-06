import { Injectable, signal, computed, inject, effect, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CanvasEngine,
} from '@alignify/canvas-engine';
import {
  CanvasObject,
  DocumentMeta,
  ObjectStyle,
  Point,
  ToolType
} from '@alignify/shared-types';
import { DocumentOperation } from '@alignify/protocol';
import { CollaborationService } from './collaboration.service';

@Injectable({
  providedIn: 'root'
})
export class CanvasEngineBridgeService implements OnDestroy {
  readonly collaboration = inject(CollaborationService);

  private engine: CanvasEngine | null = null;
  private subscriptions: Subscription[] = [];

  // Reactive State Signals
  readonly tool = signal<ToolType>('select');
  readonly zoom = signal<number>(100);
  readonly selectedObjects = signal<CanvasObject[]>([]);
  readonly allObjects = signal<CanvasObject[]>([]);
  readonly selectedCount = computed(() => this.selectedObjects().length);
  readonly singleSelectedObject = computed(() => {
    const list = this.selectedObjects();
    return list.length === 1 ? list[0] : null;
  });

  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);
  readonly documentMeta = signal<DocumentMeta>({
    id: 'doc_' + Date.now().toString(36),
    name: 'Untitled Architecture Diagram',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    objectCount: 0
  });

  readonly cameraState = signal<{ x: number; y: number; zoom: number }>({
    x: 0,
    y: 0,
    zoom: 1
  });

  readonly activeEditObject = signal<CanvasObject | null>(null);
  readonly statusMessage = signal<string>('Ready');

  constructor() {
    this.initEngine();
    this.setupCollaborationBridge();

    // Automatically connect to collaboration server on start
    if (typeof window !== 'undefined') {
      this.collaboration.connect();
    }
  }

  ngOnDestroy(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.engine?.destroy();
    this.engine = null;
  }

  private initEngine(): void {
    this.engine = new CanvasEngine({
      rendererOptions: {
        gridEnabled: true,
        gridSize: 20
      },
      autosaveIntervalMs: 4000
    });

    const eventBus = this.engine.getEventBus();

    eventBus.on('store_changed', (all) => {
      this.allObjects.set([...(all as CanvasObject[])]);
    });

    eventBus.on('tool_changed', (tool) => {
      this.tool.set(tool as ToolType);
    });

    eventBus.on('selection_changed', (selected) => {
      const objects = selected as CanvasObject[];
      this.selectedObjects.set([...objects]);
      // Broadcast local selection to collaborators
      const ids = objects.map((o) => o.id);
      this.collaboration.sendSelection(ids);
    });

    eventBus.on('cursor_moved', (pt) => {
      const worldPoint = pt as Point;
      this.collaboration.sendCursor(worldPoint.x, worldPoint.y);
    });

    eventBus.on('local_operation', (op) => {
      this.collaboration.sendOperation(op as DocumentOperation);
    });

    eventBus.on('camera_changed', (cam) => {
      const camera = cam as { x: number; y: number; zoom: number };
      this.cameraState.set(camera);
      this.zoom.set(Math.round(camera.zoom * 100));
    });

    eventBus.on('history_changed', (hist) => {
      const h = hist as { canUndo: boolean; canRedo: boolean };
      this.canUndo.set(h.canUndo);
      this.canRedo.set(h.canRedo);
    });

    eventBus.on('document_changed', (meta) => {
      this.documentMeta.set(meta as DocumentMeta);
    });

    eventBus.on('document_saved', (meta) => {
      this.documentMeta.set(meta as DocumentMeta);
      this.flashStatus('Document saved to local storage');
    });

    eventBus.on('document_loaded', (meta) => {
      this.documentMeta.set(meta as DocumentMeta);
      this.flashStatus('Document loaded successfully');
    });

    eventBus.on('edit_request', (obj) => {
      this.activeEditObject.set(obj as CanvasObject);
    });
  }

  private setupCollaborationBridge(): void {
    // 1. Sync remote operations into the canvas engine without polluting history
    this.subscriptions.push(
      this.collaboration.remoteOperation$.subscribe(({ operation }) => {
        if (this.engine) {
          this.engine.applyRemoteOperation(operation);
        }
      })
    );

    // 2. Sync full remote snapshots on room entry or reconnect catch-up
    this.subscriptions.push(
      this.collaboration.remoteSnapshot$.subscribe(({ objects }) => {
        if (this.engine) {
          this.engine.getStore().reset(objects);
          this.flashStatus('Synchronized board state');
        }
      })
    );

    // 3. Reactively pass collaborator presence list to the engine renderer
    effect(() => {
      const collaborators = this.collaboration.collaborators();
      if (this.engine) {
        this.engine.setCollaborators(collaborators);
      }
    });
  }

  getEngine(): CanvasEngine {
    if (!this.engine) {
      this.initEngine();
    }
    return this.engine!;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.getEngine().attach(canvas);
  }

  detach(): void {
    this.engine?.detach();
  }

  setTool(tool: ToolType): void {
    this.tool.set(tool);
    this.engine?.setTool(tool);
  }

  setZoom(zoomPercent: number): void {
    this.engine?.setZoom(zoomPercent / 100);
  }

  zoomIn(): void {
    this.engine?.zoomIn();
  }

  zoomOut(): void {
    this.engine?.zoomOut();
  }

  resetZoom(): void {
    this.engine?.resetZoom();
  }

  fitToContent(): void {
    this.engine?.fitToContent();
  }

  selectAll(): void {
    this.engine?.selectAll();
  }

  clearSelection(): void {
    this.engine?.clearSelection();
  }

  deleteSelected(): void {
    this.engine?.deleteSelected();
  }

  undo(): void {
    this.engine?.getHistory().undo();
  }

  redo(): void {
    this.engine?.getHistory().redo();
  }

  updateSelectedProperties(properties: Partial<CanvasObject>): void {
    this.engine?.updateSelectedProperties(properties);
    // Update local signal copy for instant responsiveness
    const current = this.selectedObjects();
    this.selectedObjects.set(
      current.map((obj) => ({ ...obj, ...properties } as unknown as CanvasObject))
    );
  }

  updateSelectedStyle(style: Partial<ObjectStyle>): void {
    this.engine?.updateSelectedStyle(style);
    const current = this.selectedObjects();
    this.selectedObjects.set(
      current.map((obj) => ({
        ...obj,
        ...style
      } as unknown as CanvasObject))
    );
  }

  reorderSelected(action: 'bringToFront' | 'sendToBack' | 'bringForward' | 'sendBackward'): void {
    this.engine?.reorderSelected(action);
  }

  alignSelected(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    this.engine?.alignSelected(alignment);
  }

  distributeSelected(type: 'horizontal' | 'vertical'): void {
    this.engine?.distributeSelected(type);
  }

  lockSelected(locked = true): void {
    this.engine?.lockSelected(locked);
  }

  toggleSelectedLock(): void {
    this.engine?.toggleSelectedLock();
  }

  selectObject(id: string, additive = false): void {
    if (!this.engine) return;
    const obj = this.engine.getStore().get(id);
    if (!obj) return;
    if (additive) {
      this.engine.getSelection().toggle(id);
    } else {
      this.engine.getSelection().select(id);
    }
  }

  async generateThumbnail(): Promise<string> {
    if (!this.engine) return '';
    try {
      const objects = this.engine.getStore().getAll();
      if (objects.length === 0) return '';
      return await this.engine.getExport().exportPNG({
        pixelRatio: 1,
        padding: 16,
        includeBackground: true,
        backgroundColor: '#0f172a'
      });
    } catch {
      return '';
    }
  }

  newDocument(name?: string): void {
    this.engine?.newDocument(name);
    this.flashStatus('New document created');
  }

  async saveDocument(): Promise<void> {
    if (!this.engine) return;
    await this.engine.saveDocument();
  }

  async loadDocument(id: string): Promise<boolean> {
    if (!this.engine) return false;
    return await this.engine.loadDocument(id);
  }

  async loadFromJSON(jsonString: string): Promise<void> {
    if (!this.engine) return;
    await this.engine.loadFromJSON(jsonString);
  }

  setDocumentName(name: string): void {
    this.engine?.setDocumentName(name);
  }

  // Export actions
  async exportPNG(): Promise<void> {
    if (!this.engine) return;
    const blob = await this.engine.getExport().exportPNG({
      backgroundColor: '#090d16',
      pixelRatio: 2
    });
    const filename = `${this.documentMeta().name.toLowerCase().replace(/\s+/g, '-')}.png`;
    this.triggerDownload(this.dataUrlToBlob(blob), filename);
    this.flashStatus('Exported PNG successfully');
  }

  exportSVG(): void {
    if (!this.engine) return;
    const svgString = this.engine.getExport().exportSVG({
      backgroundColor: '#090d16'
    });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const filename = `${this.documentMeta().name.toLowerCase().replace(/\s+/g, '-')}.svg`;
    this.triggerDownload(blob, filename);
    this.flashStatus('Exported SVG successfully');
  }

  exportJSON(): void {
    if (!this.engine) return;
    const jsonString = this.engine.getExport().exportJSON();
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const filename = `${this.documentMeta().name.toLowerCase().replace(/\s+/g, '-')}.alignify.json`;
    this.triggerDownload(blob, filename);
    this.flashStatus('Exported Architecture Diagram JSON');
  }

  // Inline editing overlay actions
  beginEditing(object: CanvasObject): void {
    this.activeEditObject.set(object);
  }

  finishEditing(newText: string): void {
    const obj = this.activeEditObject();
    if (!obj || !this.engine) {
      this.activeEditObject.set(null);
      return;
    }

    if (obj.type === 'text' || obj.type === 'sticky') {
      this.engine.updateSelectedProperties({ text: newText });
    }
    this.activeEditObject.set(null);
  }

  cancelEditing(): void {
    this.activeEditObject.set(null);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(',');
    if (!header || !data) {
      throw new Error('Export returned an invalid data URL.');
    }

    const mimeMatch = header.match(/^data:(.*?);base64$/);
    if (!mimeMatch?.[1]) {
      throw new Error('Export returned an unsupported data URL.');
    }

    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeMatch[1] });
  }

  private flashStatus(msg: string): void {
    this.statusMessage.set(msg);
    setTimeout(() => {
      if (this.statusMessage() === msg) {
        this.statusMessage.set('Ready');
      }
    }, 3500);
  }
}
