# ADR 0002: Affine Coordinate Transformations and Viewport Navigation

## Status
Accepted

## Context
Visual design tools operate on an infinite 2D world space coordinate plane where users can position objects arbitrarily and navigate via panning and zooming. The renderer and interaction hit-testers must continuously convert between:
1. **Screen Space** (Physical CSS/device pixels relative to the canvas viewport element).
2. **World Space** (Infinite virtual canvas coordinates where objects reside).

Without precise mathematical formulas, zooming into a cursor location introduces drift, selection bounding boxes desynchronize at fractional zoom levels, and hit testing misses objects.

## Decision
We implement a centered camera model with explicit forward and inverse affine transformation formulas:

### Forward Transformation (World to Screen)
Given world coordinates $(x_w, y_w)$, camera position $(c_x, c_y)$, zoom factor $s$, and viewport dimensions $(V_w, V_h)$:
$$\text{screenX} = (x_w - c_x) \times s + \frac{V_w}{2}$$
$$\text{screenY} = (y_w - c_y) \times s + \frac{V_h}{2}$$

### Inverse Transformation (Screen to World)
Given screen coordinates $(x_s, y_s)$:
$$x_w = \frac{x_s - \frac{V_w}{2}}{s} + c_x$$
$$y_w = \frac{y_s - \frac{V_h}{2}}{s} + c_y$$

### Zoom-Towards-Pointer Invariance
When zooming via wheel at pointer location $(x_s, y_s)$, the world coordinate under the pointer $P_w$ must remain invariant:
$$P_w = \text{screenToWorld}(x_s, y_s, c_{\text{old}}, s_{\text{old}})$$
To maintain this point under the pointer with new zoom $s_{\text{new}}$, the new camera position $c_{\text{new}}$ is:
$$c_{\text{new}} = P_w - \frac{x_s - \frac{V_w}{2}}{s_{\text{new}}}$$

## Consequences
- **Positive**:
  - Smooth, intuitive zooming anchored directly at the mouse cursor position.
  - Zero coordinate drift or jitter during rapid multi-touch trackpad pinching or wheel zooming.
  - High-precision hit testing regardless of zoom levels ranging from 10% to 500%.
