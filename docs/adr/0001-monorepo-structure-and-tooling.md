# ADR 0001: Monorepo Architecture and Package Boundary Decoupling

## Status
Accepted

## Context
Alignify is a high-performance, developer-centric visual workspace and system design platform. Building a scalable web whiteboard requires strict decoupling between data schemas, domain mathematical primitives, rendering engines, UI design systems, real-time protocols, and frontend application frameworks.

A monolithic frontend tightly coupling UI components with canvas rendering would hinder unit testing, prevent headless or server-side rendering/exporting, and complicate potential multi-target support (e.g. VS Code webviews, desktop Electron/Tauri shells, CLI exporters).

## Decision
We structure Alignify as an npm workspaces monorepo with clean architectural boundaries:

1. **`packages/shared-types`**:
   - Canonical single-source-of-truth TypeScript models for canvas objects (`Rectangle`, `Ellipse`, `Text`, `Sticky Note`, `Line`, `Arrow`), styles, bounding boxes, transform handles, and document meta.
   - 2D affine mathematical primitives (`Vec2`, `Point`, `Rect`, `Bounds`, `Mat2D`).
   - JSON validation schemas (`validateAlignifyDocument`, `validateCanvasObject`).
   - Pure zero-dependency TypeScript package.

2. **`packages/ui`**:
   - Dark theme design tokens, slate/indigo/emerald/rose/amber palettes, font size and stroke width presets.
   - Framework-agnostic design system primitives with Tailwind theme configuration extensions.

3. **`packages/protocol`**:
   - Wire-level communication contracts, real-time WebSocket protocol envelopes, delta synchronization packets, and presence heartbeats for multi-user collaboration.

4. **`packages/canvas-engine`**:
   - Zero-framework, standalone HTML5 Canvas 2D engine.
   - Encapsulates rendering, camera coordinate math, tool state machines, spatial hit testing, transform handles, selection marquee, clipboard management, transactional undo/redo command stack, and multi-format export (PNG HiDPI, SVG, JSON).

5. **`apps/web`**:
   - Standalone Angular 19+ application utilizing reactive signals (`signal`, `computed`, `effect`) and `CanvasEngineBridgeService` for rendering the responsive web UI.

## Consequences
- **Positive**:
  - Independent unit testing for engine math, spatial calculations, and command reversibility without DOM overhead.
  - Complete isolation of canvas rendering logic from Angular framework lifecycle.
  - Reusability of `canvas-engine` and `shared-types` across other platforms or backend export workers.
- **Negative**:
  - Requires npm workspace setup and symlinked module resolution during local development.
