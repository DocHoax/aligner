export type UserRole = 'owner' | 'editor' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
  workspace?: Workspace;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  userRole?: UserRole;
  memberCount?: number;
  boardCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName: string;
  avatarColor: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy?: string;
  isPublic: boolean;
  userRole?: UserRole;
  createdAt: string;
  updatedAt: string;
}
