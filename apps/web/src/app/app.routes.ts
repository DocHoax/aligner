import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'workspaces',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/workspace-dashboard/workspace-dashboard.component').then((m) => m.WorkspaceDashboardComponent)
  },
  {
    path: 'workspaces/:workspaceId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/workspace-dashboard/workspace-dashboard.component').then((m) => m.WorkspaceDashboardComponent)
  },
  {
    path: 'workspaces/:workspaceId/members',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/workspace-members/workspace-members.component').then((m) => m.WorkspaceMembersComponent)
  },
  {
    path: 'boards/:boardId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/board-canvas/board-canvas.component').then((m) => m.BoardCanvasComponent)
  },
  {
    path: '',
    redirectTo: 'workspaces',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'workspaces'
  }
];
