export type UserRole = 'owner' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  ownerId: string;
  userRole?: UserRole;
  memberCount?: number;
  boardCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string;
  avatarColor: string;
  role: UserRole;
  joinedAt: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  createdBy?: string;
  isPublic: boolean;
  isFavorite?: boolean;
  thumbnailUrl?: string;
  userRole?: UserRole;
  workspaceName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardComment {
  id: string;
  boardId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorAvatarColor: string;
  content: string;
  x?: number;
  y?: number;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  replies?: BoardComment[];
}

export interface BoardActivity {
  id: number;
  boardId: string;
  userId: string;
  userName: string;
  userAvatarColor: string;
  actionType: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface BoardSnapshot {
  id: string;
  boardId: string;
  seq: number;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  data?: any;
}

export interface AuthResponse {
  token: string;
  user: User;
  workspace?: Workspace;
}
