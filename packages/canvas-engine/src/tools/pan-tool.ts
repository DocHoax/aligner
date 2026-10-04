/**
 * Pan / Hand Tool
 * Panning the canvas viewport via pointer drag.
 */
import { Point, ToolType } from '@alignify/shared-types';
import { Camera } from '../camera/camera';
import { ITool, PointerEventInfo } from './tool';

export class PanTool implements ITool {
  readonly type: ToolType = 'pan';
  readonly cursor = 'grab';

  private isPanning = false;
  private lastScreenPoint: Point | null = null;

  constructor(private readonly camera: Camera) {}

  onPointerDown(event: PointerEventInfo): void {
    if (event.button === 0 || event.button === 1) {
      this.isPanning = true;
      this.lastScreenPoint = { ...event.screenPoint };
    }
  }

  onPointerMove(event: PointerEventInfo): void {
    if (!this.isPanning || !this.lastScreenPoint) return;

    const dx = event.screenPoint.x - this.lastScreenPoint.x;
    const dy = event.screenPoint.y - this.lastScreenPoint.y;

    this.camera.panByScreenDelta(dx, dy);
    this.lastScreenPoint = { ...event.screenPoint };
  }

  onPointerUp(_event: PointerEventInfo): void {
    this.isPanning = false;
    this.lastScreenPoint = null;
  }

  onDeactivate(): void {
    this.isPanning = false;
    this.lastScreenPoint = null;
  }

  getCursor(): string {
    return this.isPanning ? 'grabbing' : 'grab';
  }
}
