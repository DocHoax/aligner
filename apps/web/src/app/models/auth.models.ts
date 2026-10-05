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
  userRole?: UserRole;
  workspaceName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  workspace?: Workspace;
}
