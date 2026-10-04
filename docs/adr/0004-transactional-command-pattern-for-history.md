# ADR 0004: Transactional Command Pattern for Undo/Redo History

## Status
Accepted

## Context
A robust undo/redo system is essential for any visual editing application. Naive state snapshots (storing full board clones on every mouse drag) consume massive memory ($O(N \times S)$ where $N$ is object count and $S$ is step count) and lead to garbage collection pauses.

## Decision
We implement a transactional Command Pattern via `CommandStack` with atomic, reversible command objects:

1. **Reversible Command Interface**:
   ```typescript
   export interface Command {
     readonly name: string;
     execute(): void;
     undo(): void;
     redo?(): void;
   }
   ```

2. **Core Reversible Command Types**:
   - `CreateObjectCommand`: Adds an object on execute/redo, removes on undo.
   - `DeleteObjectsCommand`: Deletes objects on execute/redo, restores full object snapshots at previous z-indices on undo.
   - `TransformObjectsCommand`: Records `before` and `after` geometric bounding states (`x, y, width, height, rotation`) for mutated objects.
   - `UpdatePropertiesCommand`: Records `before` and `after` style/text properties.
   - `ReorderObjectsCommand`: Captures previous and new z-index ordering arrays.

3. **Transaction Batching**:
   - Real-time dragging / resizing operations mutate object properties during mouse moves without pushing intermediate commands. When the pointer is released (`pointerup`), a single `TransformObjectsCommand` is committed containing the exact start and end states.

## Consequences
- **Positive**:
  - Memory usage is proportional only to delta changes rather than the entire canvas document ($O(\Delta)$).
  - Clean stack traversal with capped depth (e.g. 50 steps) preventing runaway memory growth.
  - History state change events cleanly propagate to UI for reactive button enabling (`canUndo()`, `canRedo()`).
