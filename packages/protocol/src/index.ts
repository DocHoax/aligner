/**
 * @alignify/protocol
 * WebSocket message specifications & wire protocols for real-time collaboration.
 */

import { CanvasObject, Point, Rect } from '@alignify/shared-types';

// ==========================================
// 1. Granular Document Operations
// ==========================================

export interface CreateObjectOp {
  op: 'create';
  object: CanvasObject;
}

export interface DeleteObjectOp {
  op: 'delete';
  id: string;
}

export interface MoveObjectOp {
  op: 'move';
  id: string;
  x: number;
  y: number;
}

export interface ResizeObjectOp {
  op: 'resize';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotateObjectOp {
  op: 'rotate';
  id: string;
  rotation: number;
}

export interface UpdateObjectOp {
  op: 'update';
  id: string;
  changes: Partial<CanvasObject>;
}

export interface GroupObjectsOp {
  op: 'group';
  groupId: string;
  childIds: string[];
}

export interface UngroupObjectsOp {
  op: 'ungroup';
  groupId: string;
}

export interface BatchOp {
  op: 'batch';
  operations: DocumentOperation[];
}

export type DocumentOperation =
  | CreateObjectOp
  | DeleteObjectOp
  | MoveObjectOp
  | ResizeObjectOp
  | RotateObjectOp
  | UpdateObjectOp
  | GroupObjectsOp
  | UngroupObjectsOp
  | BatchOp;

// ==========================================
// 2. Presence & Collaborator Information
// ==========================================

export interface UserPresence {
  userId: string;
  userName: string;
  userColor: string;
  cursor?: Point | null;
  selectedIds: string[];
  lastActive: number;
}

export interface CollaboratorSelection {
  userId: string;
  userName: string;
  userColor: string;
  selectedIds: string[];
  selectionBounds?: Rect | null;
}

export type ConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

// ==========================================
// 3. Client -> Server Wire Messages
// ==========================================

export type ClientMessageType =
  | 'join'
  | 'leave'
  | 'operation'
  | 'cursor'
  | 'selection'
  | 'sync_request'
  | 'heartbeat';

export interface JoinPayload {
  userName: string;
  userColor: string;
}

export interface CursorPayload {
  x: number;
  y: number;
}

export interface SelectionPayload {
  selectedIds: string[];
}

export interface OperationPayload {
  operation: DocumentOperation;
  seq?: number;
}

export interface SyncRequestPayload {
  lastKnownSeq?: number;
}

export interface ClientMessage<T = unknown> {
  type: ClientMessageType;
  boardId: string;
  userId: string;
  timestamp: number;
  payload: T;
}

// Typed Client Message Variations
export type JoinClientMessage = ClientMessage<JoinPayload> & { type: 'join' };
export type LeaveClientMessage = ClientMessage<Record<string, never>> & { type: 'leave' };
export type CursorClientMessage = ClientMessage<CursorPayload> & { type: 'cursor' };
export type SelectionClientMessage = ClientMessage<SelectionPayload> & { type: 'selection' };
export type OperationClientMessage = ClientMessage<OperationPayload> & { type: 'operation' };
export type SyncRequestClientMessage = ClientMessage<SyncRequestPayload> & { type: 'sync_request' };
export type HeartbeatClientMessage = ClientMessage<Record<string, never>> & { type: 'heartbeat' };

// ==========================================
// 4. Server -> Client Wire Messages
// ==========================================

export type ServerMessageType =
  | 'joined'
  | 'user_joined'
  | 'user_left'
  | 'operation'
  | 'cursor'
  | 'selection'
  | 'snapshot'
  | 'ack'
  | 'error';

export interface JoinedPayload {
  userId: string;
  boardId: string;
  users: UserPresence[];
  snapshot: CanvasObject[];
  seq: number;
}

export interface UserJoinedPayload {
  user: UserPresence;
}

export interface UserLeftPayload {
  userId: string;
}

export interface RemoteOperationPayload {
  userId: string;
  operation: DocumentOperation;
  seq: number;
}

export interface RemoteCursorPayload {
  userId: string;
  userName: string;
  userColor: string;
  cursor: Point;
}

export interface RemoteSelectionPayload {
  userId: string;
  userName: string;
  userColor: string;
  selectedIds: string[];
}

export interface SnapshotPayload {
  boardId: string;
  objects: CanvasObject[];
  seq: number;
}

export interface AckPayload {
  seq: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ServerMessage<T = unknown> {
  type: ServerMessageType;
  boardId: string;
  timestamp: number;
  payload: T;
}

// Typed Server Message Variations
export type JoinedServerMessage = ServerMessage<JoinedPayload> & { type: 'joined' };
export type UserJoinedServerMessage = ServerMessage<UserJoinedPayload> & { type: 'user_joined' };
export type UserLeftServerMessage = ServerMessage<UserLeftPayload> & { type: 'user_left' };
export type RemoteOperationServerMessage = ServerMessage<RemoteOperationPayload> & { type: 'operation' };
export type RemoteCursorServerMessage = ServerMessage<RemoteCursorPayload> & { type: 'cursor' };
export type RemoteSelectionServerMessage = ServerMessage<RemoteSelectionPayload> & { type: 'selection' };
export type SnapshotServerMessage = ServerMessage<SnapshotPayload> & { type: 'snapshot' };
export type AckServerMessage = ServerMessage<AckPayload> & { type: 'ack' };
export type ErrorServerMessage = ServerMessage<ErrorPayload> & { type: 'error' };

// ==========================================
// 5. Message Helper Constructors
// ==========================================

export function createClientMessage<T>(
  type: ClientMessageType,
  boardId: string,
  userId: string,
  payload: T
): ClientMessage<T> {
  return {
    type,
    boardId,
    userId,
    timestamp: Date.now(),
    payload
  };
}

export function createServerMessage<T>(
  type: ServerMessageType,
  boardId: string,
  payload: T
): ServerMessage<T> {
  return {
    type,
    boardId,
    timestamp: Date.now(),
    payload
  };
}
