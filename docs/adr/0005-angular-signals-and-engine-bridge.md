# ADR 0005: Angular 19 Signals Integration and Bridge Architecture

## Status
Accepted

## Context
The canvas engine is intentionally built framework-agnostic to decouple graphics rendering from UI frameworks. However, the Angular 19 frontend requires fine-grained reactive state updates for:
- Active tool selection badges.
- Zoom percentage indicators.
- Undo/redo button availability.
- Dynamic properties panel display based on selected object count and types.
- Live coordinate/color/size inputs.

Traditional RxJS subjects or manual Zone.js change detection triggers can cause excessive change detection cycles or boilerplate.

## Decision
We implement a bidirectional bridge pattern via `CanvasEngineBridgeService` utilizing Angular 19 Signals (`signal`, `computed`, `effect`):

1. **Reactive State Synchronizer**:
   - `CanvasEngineBridgeService` subscribes to the engine's `EventBus` (`tool_changed`, `selection_changed`, `camera_changed`, `history_changed`, `document_changed`, `edit_request`).
   - Events immediately update Angular primitive signals (`tool`, `zoom`, `selectedObjects`, `canUndo`, `canRedo`, `documentMeta`).

2. **Fine-Grained Computed Projections**:
   - UI components use zero-overhead `computed()` signals to derive contextual states:
     ```typescript
     readonly selectedCount = computed(() => this.selectedObjects().length);
     readonly singleSelectedObject = computed(() => {
       const list = this.selectedObjects();
       return list.length === 1 ? list[0] : null;
     });
     readonly isTextType = computed(() => {
       const obj = this.singleObject();
       return obj?.type === 'text' || obj?.type === 'sticky';
     });
     ```

3. **Decoupled User Actions**:
   - UI user interactions (button clicks, color picks, property inputs) call concise bridge methods (`bridge.setTool()`, `bridge.updateSelectedStyle()`, `bridge.reorderSelected()`), delegating directly to the underlying engine subsystem.

## Consequences
- **Positive**:
  - Zero unneeded change detection runs; updates occur with surgical precision.
  - Complete separation between UI components and canvas math.
  - Testable bridge and components with standard Angular testing utilities.
