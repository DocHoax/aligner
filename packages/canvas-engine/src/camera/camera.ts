/**
 * Camera & Viewport Management
 * Provides screen <-> world coordinate conversions, pan and zoom calculations.
 */
import { CameraState, CanvasObject, Point, Size, ViewportBounds } from '@alignify/shared-types';
import { Bounds } from '../math/bounds';

export type CameraChangeListener = (state: CameraState) => void;

export class Camera implements CameraState {
  private _x = 0;
  private _y = 0;
  private _zoom = 1;

  readonly minZoom = 0.05; // 5%
  readonly maxZoom = 32.0; // 3200%

  private readonly listeners = new Set<CameraChangeListener>();

  constructor(initialState?: Partial<CameraState>) {
    if (initialState?.x !== undefined) this._x = initialState.x;
    if (initialState?.y !== undefined) this._y = initialState.y;
    if (initialState?.zoom !== undefined) {
      this._zoom = this.clampZoom(initialState.zoom);
    }
  }

  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }

  get zoom(): number {
    return this._zoom;
  }

  getState(): CameraState {
    return {
      x: this._x,
      y: this._y,
      zoom: this._zoom
    };
  }

  setState(state: Partial<CameraState>): void {
    let changed = false;
    if (state.x !== undefined && state.x !== this._x) {
      this._x = state.x;
      changed = true;
    }
    if (state.y !== undefined && state.y !== this._y) {
      this._y = state.y;
      changed = true;
    }
    if (state.zoom !== undefined) {
      const clamped = this.clampZoom(state.zoom);
      if (clamped !== this._zoom) {
        this._zoom = clamped;
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  /**
   * Converts screen (pixel) coordinates to world coordinates.
   * Screen center maps to (x, y) in world coordinates.
   */
  screenToWorld(screenPoint: Point, viewportSize: Size): Point {
    const halfWidth = viewportSize.width / 2;
    const halfHeight = viewportSize.height / 2;
    return {
      x: (screenPoint.x - halfWidth) / this._zoom + this._x,
      y: (screenPoint.y - halfHeight) / this._zoom + this._y
    };
  }

  /**
   * Converts world coordinates to screen (pixel) coordinates.
   */
  worldToScreen(worldPoint: Point, viewportSize: Size): Point {
    const halfWidth = viewportSize.width / 2;
    const halfHeight = viewportSize.height / 2;
    return {
      x: (worldPoint.x - this._x) * this._zoom + halfWidth,
      y: (worldPoint.y - this._y) * this._zoom + halfHeight
    };
  }

  /**
   * Converts screen delta (in pixels) to world delta.
   */
  screenToWorldDelta(dx: number, dy: number): { dx: number; dy: number } {
    return {
      dx: dx / this._zoom,
      dy: dy / this._zoom
    };
  }

  /**
   * Converts world delta to screen delta (in pixels).
   */
  worldToScreenDelta(dx: number, dy: number): { dx: number; dy: number } {
    return {
      dx: dx * this._zoom,
      dy: dy * this._zoom
    };
  }

  /**
   * Pans the camera by screen delta (dx, dy).
   */
  panByScreenDelta(screenDx: number, screenDy: number): void {
    const { dx, dy } = this.screenToWorldDelta(-screenDx, -screenDy);
    this._x += dx;
    this._y += dy;
    this.notify();
  }

  /**
   * Pans the camera by world delta.
   */
  panBy(worldDx: number, worldDy: number): void {
    this._x += worldDx;
    this._y += worldDy;
    this.notify();
  }

  /**
   * Zooms around a specific screen anchor point (e.g. mouse cursor) so that
   * the world point under the cursor stays stationary on screen.
   */
  zoomAt(screenAnchor: Point, zoomMultiplier: number, viewportSize: Size): void {
    const newZoom = this.clampZoom(this._zoom * zoomMultiplier);
    if (newZoom === this._zoom) return;

    // 1. Find world point under anchor with current zoom
    const worldBefore = this.screenToWorld(screenAnchor, viewportSize);

    // 2. Set new zoom
    this._zoom = newZoom;

    // 3. Find where that world point lands on screen now
    const halfWidth = viewportSize.width / 2;
    const halfHeight = viewportSize.height / 2;

    // We want: (worldBefore.x - newX) * newZoom + halfWidth == screenAnchor.x
    // So: worldBefore.x - newX = (screenAnchor.x - halfWidth) / newZoom
    // Thus: newX = worldBefore.x - (screenAnchor.x - halfWidth) / newZoom
    this._x = worldBefore.x - (screenAnchor.x - halfWidth) / this._zoom;
    this._y = worldBefore.y - (screenAnchor.y - halfHeight) / this._zoom;

    this.notify();
  }

  zoomIn(viewportSize: Size): void {
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    this.zoomAt(center, 1.25, viewportSize);
  }

  zoomOut(viewportSize: Size): void {
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    this.zoomAt(center, 0.8, viewportSize);
  }

  resetZoom(viewportSize: Size): void {
    const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
    this.zoomAt(center, 1 / this._zoom, viewportSize);
  }

  /**
   * Gets visible world bounds given current viewport size.
   */
  getVisibleWorldBounds(viewportSize: Size): ViewportBounds {
    const topLeft = this.screenToWorld({ x: 0, y: 0 }, viewportSize);
    const bottomRight = this.screenToWorld(
      { x: viewportSize.width, y: viewportSize.height },
      viewportSize
    );
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }

  /**
   * Fits camera view to enclose all provided objects with padding.
   */
  fitToObjects(objects: CanvasObject[], viewportSize: Size, padding = 64): void {
    if (objects.length === 0) {
      this._x = 0;
      this._y = 0;
      this._zoom = 1;
      this.notify();
      return;
    }

    const bounds = Bounds.fromObjects(objects);
    if (!bounds) return;

    const availableWidth = Math.max(10, viewportSize.width - padding * 2);
    const availableHeight = Math.max(10, viewportSize.height - padding * 2);

    const zoomX = availableWidth / bounds.width;
    const zoomY = availableHeight / bounds.height;
    const idealZoom = Math.min(zoomX, zoomY, 1.5); // cap max auto zoom at 150%

    this._zoom = this.clampZoom(idealZoom);
    this._x = bounds.centerX;
    this._y = bounds.centerY;

    this.notify();
  }

  subscribe(listener: CameraChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private clampZoom(zoom: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
