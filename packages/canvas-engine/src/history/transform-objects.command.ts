/**
 * Transform Objects Command
 * Records position, size, rotation, endpoints changes for undo/redo.
 */
import { CanvasObject } from '@alignify/shared-types';
import { ObjectStore } from '../objects/object-store';
import { ICommand } from './command';

export interface ObjectTransformState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  x2?: number;
  y2?: number;
}

export class TransformObjectsCommand implements ICommand {
  readonly id: string;

  constructor(
    private readonly store: ObjectStore,
    public readonly description: string,
    private readonly beforeStates: ObjectTransformState[],
    private readonly afterStates: ObjectTransformState[]
  ) {
    this.id = 'transform_' + Math.random().toString(36).substring(2, 9);
  }

  execute(): void {
    this.applyStates(this.afterStates);
  }

  undo(): void {
    this.applyStates(this.beforeStates);
  }

  redo(): void {
    this.execute();
  }

  private applyStates(states: ObjectTransformState[]): void {
    for (const state of states) {
      const updates: Partial<CanvasObject> = {
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        rotation: state.rotation
      };
      if (state.x2 !== undefined) {
        (updates as Record<string, unknown>)['x2'] = state.x2;
      }
      if (state.y2 !== undefined) {
        (updates as Record<string, unknown>)['y2'] = state.y2;
      }
      this.store.update(state.id, updates);
    }
  }
}
