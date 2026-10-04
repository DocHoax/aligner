/**
 * Clipboard Manager
 * Handles Copy, Cut, Paste, and Duplicate operations for canvas objects with history tracking.
 */
import { CanvasObject, Point } from '@alignify/shared-types';
import { CommandStack } from '../history/command-stack';
import { CreateObjectCommand } from '../history/create-object.command';
import { DeleteObjectsCommand } from '../history/delete-objects.command';
import { ObjectStore } from '../objects/object-store';
import { SelectionManager } from '../selection/selection-manager';

export class ClipboardManager {
  private clipboard: CanvasObject[] = [];
  private pasteCount = 0;

  constructor(
    private readonly store: ObjectStore,
    private readonly selection: SelectionManager,
    private readonly history: CommandStack
  ) {}

  hasItems(): boolean {
    return this.clipboard.length > 0;
  }

  copy(): boolean {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return false;

    // Deep clone selected objects
    this.clipboard = JSON.parse(JSON.stringify(selected));
    this.pasteCount = 0;
    return true;
  }

  cut(): boolean {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return false;

    this.copy();

    // Delete cut objects via command
    const cmd = new DeleteObjectsCommand(this.store, selected);
    this.history.execute(cmd);
    this.selection.clear();
    return true;
  }

  paste(customOffset?: Point): CanvasObject[] {
    if (this.clipboard.length === 0) return [];

    this.pasteCount++;
    const defaultOffset = 20 * this.pasteCount;
    const dx = customOffset ? customOffset.x : defaultOffset;
    const dy = customOffset ? customOffset.y : defaultOffset;

    const newObjects: CanvasObject[] = this.clipboard.map((obj) => {
      const cloned: CanvasObject = JSON.parse(JSON.stringify(obj));
      cloned.id = this.generateId();
      cloned.x += dx;
      cloned.y += dy;

      if (cloned.type === 'line' || cloned.type === 'arrow') {
        cloned.x2 += dx;
        cloned.y2 += dy;
      }
      return cloned;
    });

    const cmd = new CreateObjectCommand(this.store, newObjects);
    this.history.execute(cmd);

    // Select the newly pasted objects
    this.selection.setSelection(newObjects.map((o) => o.id));
    return newObjects;
  }

  duplicate(): CanvasObject[] {
    const selected = this.selection.getSelectedObjects();
    if (selected.length === 0) return [];

    const dx = 20;
    const dy = 20;

    const newObjects: CanvasObject[] = selected.map((obj) => {
      const cloned: CanvasObject = JSON.parse(JSON.stringify(obj));
      cloned.id = this.generateId();
      cloned.x += dx;
      cloned.y += dy;

      if (cloned.type === 'line' || cloned.type === 'arrow') {
        cloned.x2 += dx;
        cloned.y2 += dy;
      }
      return cloned;
    });

    const cmd = new CreateObjectCommand(this.store, newObjects);
    this.history.execute(cmd);

    // Select the duplicated objects
    this.selection.setSelection(newObjects.map((o) => o.id));
    return newObjects;
  }

  private generateId(): string {
    return 'obj_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }
}
