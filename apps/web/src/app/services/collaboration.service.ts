import { Injectable, signal, computed, OnDestroy, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import {
  DocumentOperation,
  UserPresence,
  ConnectionStatus,
  ClientMessage,
  ServerMessage,
  JoinedPayload,
  UserJoinedPayload,
  UserLeftPayload,
  RemoteOperationPayload,
  RemoteCursorPayload,
  RemoteSelectionPayload,
  SnapshotPayload,
  createClientMessage
} from '@alignify/protocol';
import { CanvasObject, Point } from '@alignify/shared-types';
import { AuthService } from './auth.service';

const COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#e11d48'  // Rose
];

const RANDOM_NAMES = [
  'Architect',
  'Designer',
  'Engineer',
  'Builder',
  'Planner',
  'Creator',
  'Strategist',
  'Navigator',
  'Draftsman'
];

@Injectable({
  providedIn: 'root'
})
export class CollaborationService implements OnDestroy {
  private readonly auth = inject(AuthService);

  // --- Reactive Signals ---
  readonly connectionStatus = signal<ConnectionStatus>('DISCONNECTED');
  readonly collaborators = signal<UserPresence[]>([]);
  readonly collaboratorCount = computed(() => this.collaborators().length);
  readonly roomId = signal<string>('board_default');
  readonly currentUser = signal<UserPresence>(this.initLocalUser());
  readonly userRole = signal<'owner' | 'editor' | 'viewer'>('editor');
  readonly isViewer = computed(() => this.userRole() === 'viewer');
  readonly lastSyncedSeq = signal<number>(0);
  readonly latencyMs = signal<number>(0);
  readonly isConnected = computed(() => this.connectionStatus() === 'CONNECTED');
  readonly errorMessage = signal<string | null>(null);

  // --- Event Streams for Engine Coordination ---
  private readonly remoteOperationSubject = new Subject<{ userId: string; operation: DocumentOperation; seq: number }>();
  readonly remoteOperation$: Observable<{ userId: string; operation: DocumentOperation; seq: number }> =
    this.remoteOperationSubject.asObservable();

  private readonly remoteSnapshotSubject = new Subject<{ boardId: string; objects: CanvasObject[]; seq: number }>();
  readonly remoteSnapshot$: Observable<{ boardId: string; objects: CanvasObject[]; seq: number }> =
    this.remoteSnapshotSubject.asObservable();

  // --- WebSocket & Reconnection State ---
  private ws: WebSocket | null = null;
  private wsUrl = '';
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastPingTimestamp = 0;
  private isIntentionallyDisconnected = false;

  // --- Throttling Buffers ---
  private pendingCursor: Point | null = null;
  private cursorThrottleTimer: number | null = null;
  private readonly cursorThrottleMs = 35; // ~30 fps cursor broadcasting

  private pendingSelection: string[] | null = null;
  private selectionThrottleTimer: number | null = null;
  private readonly selectionThrottleMs = 50;

  // --- Reconnection Parameters ---
  private readonly baseDelayMs = 1000;
  private readonly maxDelayMs = 25000;
  private readonly backoffFactor = 1.5;
  private readonly jitter = 0.2;

  constructor() {
    this.initRoomFromUrl();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private initLocalUser(): UserPresence {
    if (typeof window === 'undefined') {
      return {
        userId: 'u_' + Math.random().toString(36).substring(2, 9),
        userName: 'Architect 1',
        userColor: COLOR_PALETTE[0]!,
        selectedIds: [],
        lastActive: Date.now()
      };
    }

    try {
      const storedUser = localStorage.getItem('alignify_user') || sessionStorage.getItem('alignify_user');
      if (storedUser) {
        const u = JSON.parse(storedUser);
        if (u.id && u.displayName) {
          return {
            userId: u.id,
            userName: u.displayName,
            userColor: u.avatarColor || COLOR_PALETTE[0]!,
            selectedIds: [],
            lastActive: Date.now()
          };
        }
      }

      const storedId = sessionStorage.getItem('alignify_user_id');
      const storedName = sessionStorage.getItem('alignify_user_name');
      const storedColor = sessionStorage.getItem('alignify_user_color');

      const userId = storedId || 'u_' + Math.random().toString(36).substring(2, 9);
      const randomIndex = Math.floor(Math.random() * COLOR_PALETTE.length);
      const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + ' ' + Math.floor(10 + Math.random() * 90);
      const userName = storedName || randomName;
      const userColor = storedColor || COLOR_PALETTE[randomIndex]!;

      sessionStorage.setItem('alignify_user_id', userId);
      sessionStorage.setItem('alignify_user_name', userName);
      sessionStorage.setItem('alignify_user_color', userColor);

      return {
        userId,
        userName,
        userColor,
        selectedIds: [],
        lastActive: Date.now()
      };
    } catch {
      return {
        userId: 'u_' + Math.random().toString(36).substring(2, 9),
        userName: 'Architect 1',
        userColor: COLOR_PALETTE[0]!,
        selectedIds: [],
        lastActive: Date.now()
      };
    }
  }

  private initRoomFromUrl(): void {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('board') || urlParams.get('room');
      if (roomParam) {
        this.roomId.set(roomParam);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // ==========================================
  // Public Connection Management
  // ==========================================

  connect(customWsUrl?: string, role?: 'owner' | 'editor' | 'viewer'): void {
    if (typeof window === 'undefined') return;

    if (role) {
      this.userRole.set(role);
    }

    // Refresh current user if auth user exists
    const authUser = this.auth.currentUser();
    if (authUser) {
      this.currentUser.set({
        userId: authUser.id,
        userName: authUser.displayName,
        userColor: authUser.avatarColor || COLOR_PALETTE[0]!,
        selectedIds: [],
        lastActive: Date.now()
      });
    }

    this.isIntentionallyDisconnected = false;
    this.clearReconnectTimer();

    if (customWsUrl) {
      this.wsUrl = customWsUrl;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      this.wsUrl = `${protocol}//${host}:8080/ws`;
    }

    this.initiateWebSocket();
  }

  disconnect(): void {
    this.isIntentionallyDisconnected = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.clearThrottleTimers();

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.sendMessage('leave', {});
        }
        this.ws.close();
      } catch (e) {
        console.warn('[CollaborationService] Error during disconnect:', e);
      }
      this.ws = null;
    }

    this.collaborators.set([]);
    this.connectionStatus.set('DISCONNECTED');
  }

  setRoom(newRoomId: string, role?: 'owner' | 'editor' | 'viewer'): void {
    if (!newRoomId) return;

    if (role) {
      this.userRole.set(role);
    }

    if (newRoomId === this.roomId() && this.isConnected()) return;

    this.roomId.set(newRoomId);

    if (this.connectionStatus() === 'CONNECTED' || this.connectionStatus() === 'CONNECTING') {
      this.connect(undefined, role);
    }
  }

  setUserName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    const current = this.currentUser();
    const updated = { ...current, userName: trimmed };
    this.currentUser.set(updated);

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('alignify_user_name', trimmed);
      } catch {}
    }

    if (this.isConnected()) {
      this.sendMessage('join', {
        userName: trimmed,
        userColor: current.userColor
      });
    }
  }

  setUserColor(color: string): void {
    const current = this.currentUser();
    const updated = { ...current, userColor: color };
    this.currentUser.set(updated);

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('alignify_user_color', color);
      } catch {}
    }

    if (this.isConnected()) {
      this.sendMessage('join', {
        userName: current.userName,
        userColor: color
      });
    }
  }

  // ==========================================
  // Outbound Delta Broadcasting
  // ==========================================

  sendOperation(operation: DocumentOperation): void {
    if (!this.isConnected()) return;
    if (this.isViewer()) {
      console.warn('[CollaborationService] Viewers cannot send operations');
      return;
    }

    this.sendMessage('operation', {
      operation,
      seq: this.lastSyncedSeq()
    });
  }

  sendCursor(x: number, y: number): void {
    if (!this.isConnected()) return;

    this.pendingCursor = { x, y };

    if (!this.cursorThrottleTimer) {
      this.cursorThrottleTimer = window.setTimeout(() => {
        this.cursorThrottleTimer = null;
        if (this.pendingCursor && this.isConnected()) {
          this.sendMessage('cursor', {
            x: Math.round(this.pendingCursor.x * 10) / 10,
            y: Math.round(this.pendingCursor.y * 10) / 10
          });
          this.pendingCursor = null;
        }
      }, this.cursorThrottleMs);
    }
  }

  sendSelection(selectedIds: string[]): void {
    if (!this.isConnected()) return;

    this.pendingSelection = selectedIds;

    if (!this.selectionThrottleTimer) {
      this.selectionThrottleTimer = window.setTimeout(() => {
        this.selectionThrottleTimer = null;
        if (this.pendingSelection && this.isConnected()) {
          this.sendMessage('selection', {
            selectedIds: this.pendingSelection
          });
          this.pendingSelection = null;
        }
      }, this.selectionThrottleMs);
    }
  }

  requestSync(): void {
    if (!this.isConnected()) return;

    this.sendMessage('sync_request', {
      lastKnownSeq: this.lastSyncedSeq()
    });
  }

  getShareableLink(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/boards/${this.roomId()}`;
  }

  // ==========================================
  // Internal WebSocket Connection Lifecycle
  // ==========================================

  private initiateWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const user = this.currentUser();
    const token = this.auth.token() || (typeof window !== 'undefined' ? localStorage.getItem('alignify_token') : null);

    const queryParams = new URLSearchParams({
      boardId: this.roomId(),
      userId: user.userId,
      userName: user.userName,
      userColor: user.userColor
    });

    if (token) {
      queryParams.set('token', token);
    }

    const fullUrl = `${this.wsUrl}?${queryParams.toString()}`;

    this.connectionStatus.set(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.connectionStatus.set('CONNECTED');
        this.errorMessage.set(null);
        this.setupHeartbeat();

        // Send initial join message
        this.sendMessage('join', {
          userName: user.userName,
          userColor: user.userColor
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleIncomingMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('[CollaborationService] WebSocket error:', err);
      };

      this.ws.onclose = () => {
        this.clearHeartbeat();
        this.ws = null;

        if (!this.isIntentionallyDisconnected) {
          this.scheduleReconnect();
        } else {
          this.connectionStatus.set('DISCONNECTED');
        }
      };
    } catch (err) {
      console.error('[CollaborationService] Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyDisconnected) return;

    this.connectionStatus.set('RECONNECTING');
    this.reconnectAttempts++;

    const delay = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * Math.pow(this.backoffFactor, this.reconnectAttempts - 1)
    );
    const randomizedDelay = delay * (1 + (Math.random() * 2 - 1) * this.jitter);

    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.initiateWebSocket();
    }, randomizedDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearThrottleTimers(): void {
    if (this.cursorThrottleTimer !== null) {
      clearTimeout(this.cursorThrottleTimer);
      this.cursorThrottleTimer = null;
    }
    if (this.selectionThrottleTimer !== null) {
      clearTimeout(this.selectionThrottleTimer);
      this.selectionThrottleTimer = null;
    }
  }

  private setupHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.lastPingTimestamp = performance.now();
        this.sendMessage('heartbeat', {});
      }
    }, 20000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendMessage<T>(type: ClientMessage<T>['type'], payload: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = createClientMessage(
      type,
      this.roomId(),
      this.currentUser().userId,
      payload
    );

    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.warn('[CollaborationService] Error sending message:', err);
    }
  }

  // ==========================================
  // Inbound Message Dispatching
  // ==========================================

  private handleIncomingMessage(rawPayload: string): void {
    try {
      const message: ServerMessage = JSON.parse(rawPayload);

      switch (message.type) {
        case 'joined': {
          const payload = message.payload as JoinedPayload;
          this.lastSyncedSeq.set(payload.seq || 0);

          // Filter out our local user from collaborator list
          const localId = this.currentUser().userId;
          const others = (payload.users || []).filter((u) => u.userId !== localId);
          this.collaborators.set(others);

          if (payload.snapshot && payload.snapshot.length > 0) {
            this.remoteSnapshotSubject.next({
              boardId: payload.boardId,
              objects: payload.snapshot,
              seq: payload.seq
            });
          }
          break;
        }

        case 'user_joined': {
          const payload = message.payload as UserJoinedPayload;
          const newUser = payload.user;
          if (newUser && newUser.userId !== this.currentUser().userId) {
            const current = this.collaborators();
            const filtered = current.filter((u) => u.userId !== newUser.userId);
            this.collaborators.set([...filtered, newUser]);
          }
          break;
        }

        case 'user_left': {
          const payload = message.payload as UserLeftPayload;
          const leftUserId = payload.userId;
          this.collaborators.update((list) => list.filter((u) => u.userId !== leftUserId));
          break;
        }

        case 'operation': {
          const payload = message.payload as RemoteOperationPayload;
          if (payload && payload.operation) {
            this.lastSyncedSeq.set(payload.seq);
            this.remoteOperationSubject.next({
              userId: payload.userId,
              operation: payload.operation,
              seq: payload.seq
            });
          }
          break;
        }

        case 'cursor': {
          const payload = message.payload as RemoteCursorPayload;
          if (payload.userId !== this.currentUser().userId) {
            this.collaborators.update((list) =>
              list.map((u) => {
                if (u.userId === payload.userId) {
                  return {
                    ...u,
                    cursor: payload.cursor,
                    lastActive: Date.now()
                  };
                }
                return u;
              })
            );
          }
          break;
        }

        case 'selection': {
          const payload = message.payload as RemoteSelectionPayload;
          if (payload.userId !== this.currentUser().userId) {
            this.collaborators.update((list) =>
              list.map((u) => {
                if (u.userId === payload.userId) {
                  return {
                    ...u,
                    selectedIds: payload.selectedIds || [],
                    lastActive: Date.now()
                  };
                }
                return u;
              })
            );
          }
          break;
        }

        case 'snapshot': {
          const payload = message.payload as SnapshotPayload;
          this.lastSyncedSeq.set(payload.seq || 0);
          this.remoteSnapshotSubject.next({
            boardId: payload.boardId,
            objects: payload.objects || [],
            seq: payload.seq
          });
          break;
        }

        case 'ack': {
          if (this.lastPingTimestamp > 0) {
            const rtt = Math.round(performance.now() - this.lastPingTimestamp);
            this.latencyMs.set(rtt);
          }
          break;
        }

        case 'error': {
          const err = message.payload as any;
          console.warn('[CollaborationService] Server error:', err);
          if (err?.code === 'INSUFFICIENT_PERMISSIONS') {
            this.errorMessage.set('You are in view-only mode and cannot edit this board.');
          } else if (err?.message) {
            this.errorMessage.set(err.message);
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[CollaborationService] Failed to parse incoming WebSocket message:', err);
    }
  }
}
