import { describe, it, expect } from 'vitest';
import {
  createClientMessage,
  createServerMessage,
  DocumentOperation,
  CreateObjectOp,
  UpdateObjectOp,
  DeleteObjectOp,
  MoveObjectOp,
  BatchOp
} from '../src/index';

describe('Protocol Message Serialization & Operations', () => {
  it('should construct client join messages correctly', () => {
    const msg = createClientMessage('join', 'board-123', 'user-456', {
      userName: 'Alice',
      userColor: '#3b82f6'
    });

    expect(msg.type).toBe('join');
    expect(msg.boardId).toBe('board-123');
    expect(msg.userId).toBe('user-456');
    expect(msg.payload.userName).toBe('Alice');
    expect(msg.payload.userColor).toBe('#3b82f6');
    expect(typeof msg.timestamp).toBe('number');
  });

  it('should construct client cursor messages correctly', () => {
    const msg = createClientMessage('cursor', 'board-123', 'user-456', {
      x: 100,
      y: 200
    });

    expect(msg.type).toBe('cursor');
    expect(msg.payload.x).toBe(100);
    expect(msg.payload.y).toBe(200);
  });

  it('should construct server broadcast operations', () => {
    const createOp: CreateObjectOp = {
      op: 'create',
      object: {
        id: 'rect-1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rotation: 0,
        zIndex: 1,
        fillColor: '#ef4444',
        strokeColor: '#ffffff',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    const serverMsg = createServerMessage('operation', 'board-123', {
      userId: 'user-456',
      operation: createOp,
      seq: 42
    });

    expect(serverMsg.type).toBe('operation');
    expect(serverMsg.boardId).toBe('board-123');
    expect(serverMsg.payload.seq).toBe(42);
    expect(serverMsg.payload.operation.op).toBe('create');
  });

  it('should support batch operations containing multiple sub-operations', () => {
    const ops: DocumentOperation[] = [
      {
        op: 'move',
        id: 'obj-1',
        x: 50,
        y: 60
      } as MoveObjectOp,
      {
        op: 'update',
        id: 'obj-2',
        changes: { opacity: 0.5 }
      } as UpdateObjectOp,
      {
        op: 'delete',
        id: 'obj-3'
      } as DeleteObjectOp
    ];

    const batch: BatchOp = {
      op: 'batch',
      operations: ops
    };

    expect(batch.op).toBe('batch');
    expect(batch.operations.length).toBe(3);
    expect(batch.operations[0].op).toBe('move');
    expect(batch.operations[1].op).toBe('update');
    expect(batch.operations[2].op).toBe('delete');
  });
});
