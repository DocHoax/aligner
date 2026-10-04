/**
 * Snapping and Alignment Utilities
 */
import { Point } from '@alignify/shared-types';

export class Snap {
  static readonly DEFAULT_GRID_SIZE = 16;
  static readonly ANGLE_SNAP_STEP = 15; // 15 degrees when Shift is held

  static snapToGrid(value: number, gridSize = this.DEFAULT_GRID_SIZE): number {
    return Math.round(value / gridSize) * gridSize;
  }

  static snapPointToGrid(p: Point, gridSize = this.DEFAULT_GRID_SIZE): Point {
    return {
      x: this.snapToGrid(p.x, gridSize),
      y: this.snapToGrid(p.y, gridSize)
    };
  }

  static snapAngle(degrees: number, step = this.ANGLE_SNAP_STEP): number {
    const normalized = (degrees % 360 + 360) % 360;
    const snapped = Math.round(normalized / step) * step;
    return (snapped % 360 + 360) % 360;
  }

  static snapAspectRatio(
    width: number,
    height: number,
    preserveRatio = true
  ): { width: number; height: number } {
    if (!preserveRatio) return { width, height };
    const side = Math.max(Math.abs(width), Math.abs(height));
    return {
      width: Math.sign(width) * side || side,
      height: Math.sign(height) * side || side
    };
  }
}
