# ADR 0003: High-Performance Canvas Rendering and Spatial Indexing

## Status
Accepted

## Context
Interactive whiteboard applications must maintain a solid 60 FPS render loop while rendering hundreds or thousands of canvas objects, grid patterns, selection bounding boxes, multi-touch marquee rectangles, and transform handles.

Naive full-canvas DOM rendering or unoptimized canvas clearing causes frame drops and high battery consumption. Furthermore, hit-testing rotated shapes with bounding boxes results in false positive clicks on empty corners.

## Decision
1. **Demand-Driven Render Loop with Frame Throttling**:
   - `RenderLoop` leverages `requestAnimationFrame` with a dirty-flag pattern. The canvas re-renders only when state changes (camera move, object mutation, selection update, drag event), minimizing idle GPU/CPU consumption.
   - HiDPI pixel ratio scaling (`window.devicePixelRatio`) ensures sharp rendering on Retina / 4K displays while computing transforms in logical CSS units.

2. **Inverse-Coordinate Rotation for Spatial Hit Testing**:
   - For arbitrary rotated objects $(x, y, w, h, \theta)$, hit testing transforms the pointer world point $(p_x, p_y)$ into the object's local unrotated space $(p'_x, p'_y)$ by counter-rotating around the center $(c_x, c_y)$ by $-\theta$:
     $$p'_x = c_x + (p_x - c_x) \cos(-\theta) - (p_y - c_y) \sin(-\theta)$$
     $$p'_y = c_y + (p_x - c_x) \sin(-\theta) + (p_y - c_y) \cos(-\theta)$$
   - Point-in-shape tests (Rectangle bounds, Ellipse $(x/a)^2 + (y/b)^2 \le 1$, Line distance to segment) are then calculated in simple local axis-aligned coordinates.

3. **Spatial Handle and Edge Testing**:
   - 8-point transformation handles (NW, N, NE, E, SE, S, SW, W) and rotation handle are tested with a hit radius scaled inversely with zoom, ensuring handles remain easily clickable at any zoom level.

## Consequences
- **Positive**:
  - Consistent 60 FPS interactions and sub-millisecond hit test times.
  - Pixel-perfect selection of rotated shapes and thin lines.
  - Zero false positives on rotated bounding box corners.
