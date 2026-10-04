/**
 * @alignify/protocol
 * WebSocket message specifications & wire protocols for real-time collaboration.
 */

import { CanvasObject, Point } from '@alignify/shared-types';

export type ClientMessageType =
  | 'join_board'
  | 'leave_board'
  | 'cursor_move'
  | 'selection_change'
  | 'apply_changes'
  | 'request_sync';

export type ServerMessageType =
  | 'board_snapshot'
  | 'user_joined'
  | 'user_left'
  | 'user_cursor'
  | 'user_selection'
  | 'remote_changes'
  | 'error_ack';

export interface UserPresence {
  userId: string;
  userName: string;
  userColor: string;
  cursor?: Point;
  selectedIds: string[];
  lastActive: number;
}

export interface ClientMessage<T = unknown> {
  type: ClientMessageType;
  boardId: string;
  userId: string;
  timestamp: number;
  payload: T;
}

export interface ServerMessage<T = unknown> {
  type: ServerMessageType;
  boardId: string;
  timestamp: number;
  payload: T;
}

export interface ChangeDelta {
  created?: CanvasObject[];
  updated?: Partial<CanvasObject>[];
  deleted?: string[];
}
