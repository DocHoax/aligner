/**
 * Object Distribution Engine
 * Distributes 3 or more canvas objects evenly along horizontal or vertical axes.
 */
import { CanvasObject } from '@alignify/shared-types';
import { Bounds } from './bounds';

export type DistributionType = 'horizontal' | 'vertical';

export interface DistributionChange {
  id: string;
  changes: Partial<CanvasObject>;
}

export class DistributionEngine {
  /**
   * Distributes objects evenly along horizontal or vertical axis.
   * Spacing between consecutive object bounding boxes will be made equal.
   */
  static distribute(objects: CanvasObject[], type: DistributionType): DistributionChange[] {
    const unlocked = objects.filter((o) => !o.locked);
    if (unlocked.length < 3) return [];

    // Map each object with its bounding box
    const items = unlocked.map((obj) => ({
      obj,
      bounds: Bounds.fromObject(obj)
    }));

    const changes: DistributionChange[] = [];

    if (type === 'horizontal') {
      // Sort left to right
      items.sort((a, b) => a.bounds.minX - b.bounds.minX);

      const first = items[0]!;
      const last = items[items.length - 1]!;

      // Total span between first minX and last maxX
      const totalSpan = last.bounds.maxX - first.bounds.minX;
      const totalObjectWidths = items.reduce((acc, item) => acc + item.bounds.width, 0);
      const remainingSpace = totalSpan - totalObjectWidths;
      const spacing = remainingSpace / (items.length - 1);

      let currentX = first.bounds.minX;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const targetMinX = currentX;
        const dx = targetMinX - item.bounds.minX;

        if (Math.abs(dx) > 0.001) {
          if (item.obj.type === 'line' || item.obj.type === 'arrow') {
            changes.push({
              id: item.obj.id,
              changes: {
                x: item.obj.x + dx,
                x2: item.obj.x2 + dx
              }
            });
          } else {
            changes.push({
              id: item.obj.id,
              changes: {
                x: item.obj.x + dx
              }
            });
          }
        }

        currentX += item.bounds.width + spacing;
      }
    } else {
      // Sort top to bottom
      items.sort((a, b) => a.bounds.minY - b.bounds.minY);

      const first = items[0]!;
      const last = items[items.length - 1]!;

      const totalSpan = last.bounds.maxY - first.bounds.minY;
      const totalObjectHeights = items.reduce((acc, item) => acc + item.bounds.height, 0);
      const remainingSpace = totalSpan - totalObjectHeights;
      const spacing = remainingSpace / (items.length - 1);

      let currentY = first.bounds.minY;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const targetMinY = currentY;
        const dy = targetMinY - item.bounds.minY;

        if (Math.abs(dy) > 0.001) {
          if (item.obj.type === 'line' || item.obj.type === 'arrow') {
            changes.push({
              id: item.obj.id,
              changes: {
                y: item.obj.y + dy,
                y2: item.obj.y2 + dy
              }
            });
          } else {
            changes.push({
              id: item.obj.id,
              changes: {
                y: item.obj.y + dy
              }
            });
          }
        }

        currentY += item.bounds.height + spacing;
      }
    }

    return changes;
  }
}
