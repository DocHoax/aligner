import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasEngineBridgeService } from '../canvas-engine-bridge.service';
import { DocumentOperation } from '@alignify/protocol';
import { CanvasObject } from '@alignify/shared-types';

function createOp(id: string): DocumentOperation {
  return {
    op: 'create',
    object: { id, type: 'rectangle', x: 0, y: 0 } as unknown as CanvasObject
  };
}

describe('CanvasEngineBridgeService - AI operation application', () => {
  let bridge: CanvasEngineBridgeService;
  let engine: {
    applyOperations: ReturnType<typeof vi.fn>;
    getSelection: ReturnType<typeof vi.fn>;
    fitToContent: ReturnType<typeof vi.fn>;
  };
  let collaboration: { sendOperation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    engine = {
      applyOperations: vi.fn().mockReturnValue(2),
      getSelection: vi.fn().mockReturnValue({ setSelection: vi.fn() }),
      fitToContent: vi.fn()
    };
    collaboration = { sendOperation: vi.fn() };

    bridge = Object.create(CanvasEngineBridgeService.prototype);
    (bridge as unknown as Record<string, unknown>)['engine'] = engine;
    (bridge as unknown as Record<string, unknown>)['collaboration'] = collaboration;
    (bridge as unknown as Record<string, unknown>)['flashStatus'] = vi.fn();
  });

  it('records AI operations on the engine command stack as one undoable unit', () => {
    const operations = [createOp('ai_node_1'), createOp('ai_node_2')];

    bridge.applyOperations(operations, false);

    expect(engine.applyOperations).toHaveBeenCalledTimes(1);
    expect(engine.applyOperations).toHaveBeenCalledWith(operations, 'AI-generated change');
  });

  it('does not broadcast operations itself - the engine local operation stream does', () => {
    const operations = [createOp('ai_node_1'), createOp('ai_node_2')];

    bridge.applyOperations(operations, false);

    expect(collaboration.sendOperation).not.toHaveBeenCalled();
  });

  it('forwards a custom description and selects newly added objects', () => {
    const operations = [createOp('ai_added')];

    bridge.applyOperations(operations, false, ['ai_added'], 'AI refine: add cache');

    expect(engine.applyOperations).toHaveBeenCalledWith(operations, 'AI refine: add cache');
    expect(engine.getSelection).toHaveBeenCalled();
    expect(engine.getSelection().setSelection).toHaveBeenCalledWith(['ai_added']);
  });

  it('ignores empty operation batches', () => {
    bridge.applyOperations([], false);

    expect(engine.applyOperations).not.toHaveBeenCalled();
    expect(collaboration.sendOperation).not.toHaveBeenCalled();
  });
});
