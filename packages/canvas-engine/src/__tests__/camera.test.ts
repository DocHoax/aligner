import { describe, it, expect } from 'vitest';
import { Camera } from '../camera/camera';

describe('Camera Coordinates and Transforms', () => {
  const viewport = { width: 800, height: 600 };

  it('converts between screen and world coordinates with 1x zoom', () => {
    const camera = new Camera({ x: 0, y: 0, zoom: 1 });

    // Center of screen (400, 300) is world origin (0, 0)
    const worldCenter = camera.screenToWorld({ x: 400, y: 300 }, viewport);
    expect(worldCenter.x).toBe(0);
    expect(worldCenter.y).toBe(0);

    const screenCenter = camera.worldToScreen({ x: 0, y: 0 }, viewport);
    expect(screenCenter.x).toBe(400);
    expect(screenCenter.y).toBe(300);
  });

  it('converts coordinates accurately with pan and zoom', () => {
    const camera = new Camera({ x: 100, y: 50, zoom: 2 });

    const worldPt = camera.screenToWorld({ x: 400, y: 300 }, viewport);
    expect(worldPt.x).toBe(100);
    expect(worldPt.y).toBe(50);

    const screenPt = camera.worldToScreen({ x: 100, y: 50 }, viewport);
    expect(screenPt.x).toBe(400);
    expect(screenPt.y).toBe(300);
  });

  it('zooms anchored on specific screen point without moving world anchor', () => {
    const camera = new Camera({ x: 0, y: 0, zoom: 1 });
    const screenAnchor = { x: 200, y: 150 };

    const worldBefore = camera.screenToWorld(screenAnchor, viewport);
    camera.zoomAt(screenAnchor, 1.5, viewport);
    const worldAfter = camera.screenToWorld(screenAnchor, viewport);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
  });

  it('pans accurately with screen delta', () => {
    const camera = new Camera({ x: 0, y: 0, zoom: 2 });
    camera.panByScreenDelta(100, -50); // move screen right 100, up 50

    expect(camera.x).toBe(-50);
    expect(camera.y).toBe(25);
  });
});
