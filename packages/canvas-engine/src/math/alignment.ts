/**
 * Object Alignment Engine
 * Aligns 2 or more canvas objects along horizontal or vertical axes.
 */
import { CanvasObject } from '@alignify/shared-types';
import { Bounds } from './bounds';

export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export interface AlignmentChange {
  id: string;
  changes: Partial<CanvasObject>;
}

export class AlignmentEngine {
  /**
   * Calculates position updates to align the given objects according to the specified alignment type.
   * Returns an array of changes (id + partial properties) to apply.
   */
  static align(objects: CanvasObject[], type: AlignmentType): AlignmentChange[] {
    if (objects.length < 2) return [];

    const totalBounds = Bounds.fromObjects(objects);
    if (!totalBounds) return [];

    const changes: AlignmentChange[] = [];

    for (const obj of objects) {
      if (obj.locked) continue;

      const objBounds = Bounds.fromObject(obj);
      let dx = 0;
      let dy = 0;

      switch (type) {
        case 'left':
          dx = totalBounds.minX - objBounds.minX;
          break;
        case 'center':
          dx = totalBounds.centerX - objBounds.centerX;
          break;
        case 'right':
          dx = totalBounds.maxX - objBounds.maxX;
          break;
        case 'top':
          dy = totalBounds.minY - objBounds.minY;
          break;
        case 'middle':
          dy = totalBounds.centerY - objBounds.centerY;
          break;
        case 'bottom':
          dy = totalBounds.maxY - objBounds.maxY;
          break;
      }

      if (dx !== 0 || dy !== 0) {
        if (obj.type === 'line' || obj.type === 'arrow') {
          changes.push({
            id: obj.id,
            changes: {
              x: obj.x + dx,
              y: obj.y + dy,
              x2: obj.x2 + dx,
              y2: obj.y2 + dy
            }
          });
        } else {
          changes.push({
            id: obj.id,
            changes: {
              x: obj.x + dx,
              y: obj.y + dy
            }
          });
        }
      }
    }

    return changes;
  }
}
