/**
 * Smart Snapping & Alignment Guides Engine
 * Computes magnetic snapping to grid and reference objects during translation/resizing,
 * and generates visual alignment guide lines for rendering.
 */
import { CanvasObject, IBoundingBox, Point } from '@alignify/shared-types';
import { Bounds } from './bounds';

export interface SnapGuide {
  type: 'horizontal' | 'vertical';
  position: number; // World coordinate for the line (y for horizontal, x for vertical)
  start: number;    // Start along perpendicular axis
  end: number;      // End along perpendicular axis
}

export interface SnapOptions {
  snapToGrid?: boolean;
  gridSize?: number;
  snapToObjects?: boolean;
  snapThreshold?: number; // In world units (e.g. 6 / zoom)
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export class SnappingEngine {
  static readonly DEFAULT_THRESHOLD = 6;
  static readonly DEFAULT_GRID_SIZE = 16;

  /**
   * Snaps a moving bounding box against other objects and/or grid.
   */
  static snapMove(
    movingBounds: IBoundingBox,
    targetObjects: CanvasObject[],
    options: SnapOptions = {}
  ): SnapResult {
    const threshold = options.snapThreshold ?? this.DEFAULT_THRESHOLD;
    const guides: SnapGuide[] = [];
    let bestDx = 0;
    let minDiffX = threshold;

    let bestDy = 0;
    let minDiffY = threshold;

    const movingXEdges = [
      { edge: 'left', val: movingBounds.minX },
      { edge: 'center', val: movingBounds.centerX },
      { edge: 'right', val: movingBounds.maxX }
    ];

    const movingYEdges = [
      { edge: 'top', val: movingBounds.minY },
      { edge: 'middle', val: movingBounds.centerY },
      { edge: 'bottom', val: movingBounds.maxY }
    ];

    if (options.snapToObjects && targetObjects.length > 0) {
      for (const target of targetObjects) {
        if (target.locked) continue;
        const tb = Bounds.fromObject(target);

        const targetXEdges = [tb.minX, tb.centerX, tb.maxX];
        const targetYEdges = [tb.minY, tb.centerY, tb.maxY];

        // Horizontal alignment (Vertical guide lines)
        for (const mx of movingXEdges) {
          for (const tx of targetXEdges) {
            const diff = tx - mx.val;
            if (Math.abs(diff) <= minDiffX) {
              minDiffX = Math.abs(diff);
              bestDx = diff;
            }
          }
        }

        // Vertical alignment (Horizontal guide lines)
        for (const my of movingYEdges) {
          for (const ty of targetYEdges) {
            const diff = ty - my.val;
            if (Math.abs(diff) <= minDiffY) {
              minDiffY = Math.abs(diff);
              bestDy = diff;
            }
          }
        }
      }

      // Generate visual guides for active object snaps
      if (bestDx !== 0 || minDiffX < threshold) {
        const snappedMovingX = [
          movingBounds.minX + bestDx,
          movingBounds.centerX + bestDx,
          movingBounds.maxX + bestDx
        ];

        for (const target of targetObjects) {
          if (target.locked) continue;
          const tb = Bounds.fromObject(target);
          const targetXEdges = [tb.minX, tb.centerX, tb.maxX];

          for (const smx of snappedMovingX) {
            for (const tx of targetXEdges) {
              if (Math.abs(smx - tx) < 0.001) {
                const minY = Math.min(movingBounds.minY + bestDy, tb.minY);
                const maxY = Math.max(movingBounds.maxY + bestDy, tb.maxY);
                guides.push({
                  type: 'vertical',
                  position: tx,
                  start: minY - 20,
                  end: maxY + 20
                });
              }
            }
          }
        }
      }

      if (bestDy !== 0 || minDiffY < threshold) {
        const snappedMovingY = [
          movingBounds.minY + bestDy,
          movingBounds.centerY + bestDy,
          movingBounds.maxY + bestDy
        ];

        for (const target of targetObjects) {
          if (target.locked) continue;
          const tb = Bounds.fromObject(target);
          const targetYEdges = [tb.minY, tb.centerY, tb.maxY];

          for (const smy of snappedMovingY) {
            for (const ty of targetYEdges) {
              if (Math.abs(smy - ty) < 0.001) {
                const minX = Math.min(movingBounds.minX + bestDx, tb.minX);
                const maxX = Math.max(movingBounds.maxX + bestDx, tb.maxX);
                guides.push({
                  type: 'horizontal',
                  position: ty,
                  start: minX - 20,
                  end: maxX + 20
                });
              }
            }
          }
        }
      }
    }

    // Grid snapping if not snapped to objects or if grid enabled
    if (options.snapToGrid && (bestDx === 0 || bestDy === 0)) {
      const gridSize = options.gridSize ?? this.DEFAULT_GRID_SIZE;

      if (bestDx === 0) {
        const snappedMinX = Math.round(movingBounds.minX / gridSize) * gridSize;
        const gridDiffX = snappedMinX - movingBounds.minX;
        if (Math.abs(gridDiffX) <= threshold) {
          bestDx = gridDiffX;
        }
      }

      if (bestDy === 0) {
        const snappedMinY = Math.round(movingBounds.minY / gridSize) * gridSize;
        const gridDiffY = snappedMinY - movingBounds.minY;
        if (Math.abs(gridDiffY) <= threshold) {
          bestDy = gridDiffY;
        }
      }
    }

    return {
      dx: bestDx,
      dy: bestDy,
      guides
    };
  }

  /**
   * Snaps a single point to grid or nearby target points.
   */
  static snapPoint(point: Point, options: SnapOptions = {}): Point {
    if (!options.snapToGrid) return point;
    const gridSize = options.gridSize ?? this.DEFAULT_GRID_SIZE;
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize
    };
  }
}
