# ADR 0006: Multi-Format Vector and Raster Export Pipeline

## Status
Accepted

## Context
Developers and software architects need to share and embed system design diagrams in documentation, pull requests, wikis, and design specs. This requires high-fidelity export in three distinct formats:
1. **HiDPI Raster PNG** (Sharp for presentations and chat sharing).
2. **Lossless Vector SVG** (Scalable and embeddable directly in web pages and Markdown).
3. **Canonical Alignify Project JSON** (For project saving, sharing, and version control backup).

Exporting must work purely client-side without sending private architecture schemas to external third-party rendering services.

## Decision
We implement a dedicated `ExportManager` subsystem within `CanvasEngine`:

1. **HiDPI PNG Export**:
   - Calculates the exact collective bounding box of all canvas objects (with configurable padding).
   - Allocates an offscreen `<canvas>` scaled by the requested pixel ratio (e.g. $2\times$ or $3\times$).
   - Translates coordinates to align the bounding box origin at $(0,0)$ and renders all objects with full antialiasing and custom background fills.
   - Encodes as a PNG Blob via `canvas.toBlob()`.

2. **Lossless Vector SVG Export**:
   - Computes document bounds and constructs an XML `<svg>` document with proper `xmlns`, `viewBox`, `width`, and `height`.
   - Generates exact vector primitives for each canvas object type:
     - `Rectangle` $\to$ `<rect rx="..." ry="..." />`
     - `Ellipse` $\to$ `<ellipse cx="..." cy="..." rx="..." ry="..." />`
     - `Line` $\to$ `<path d="M... L..." />`
     - `Arrow` $\to$ `<path d="..." />` + marker arrowheads `<polygon points="..." />`
     - `Text` $\to$ `<text x="..." y="..." text-anchor="...">` with escaped XML content
     - `Sticky Note` $\to$ `<rect rx="4" />` with subtle drop shadow filter + multi-line `<text>` `<tspan>` elements
   - Supports transparent or colored backgrounds and custom stroke widths and dash arrays.

3. **Project JSON Export and Import**:
   - Serializes document metadata, schema version, camera state, and the complete array of canvas objects into formatted JSON.
   - Validates incoming JSON on load via `validateAlignifyDocument()` to guarantee data integrity.

## Consequences
- **Positive**:
  - 100% private, client-side, zero-latency exports.
  - Pixel-crisp HiDPI raster images and clean standards-compliant SVG files.
  - Safe import/export with schema validation.
