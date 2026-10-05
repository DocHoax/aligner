import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { WorkspaceDashboardComponent } from './pages/workspace-dashboard/workspace-dashboard.component';
import { WorkspaceMembersComponent } from './pages/workspace-members/workspace-members.component';
import { BoardCanvasComponent } from './pages/board-canvas/board-canvas.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'register',
    component: RegisterComponent
  },
  {
    path: 'workspaces',
    component: WorkspaceDashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: 'workspaces/:workspaceId',
    component: WorkspaceDashboardComponent,
    canActivate: [authGuard]
  },
  {
    path: 'workspaces/:workspaceId/members',
    component: WorkspaceMembersComponent,
    canActivate: [authGuard]
  },
  {
    path: 'boards/:boardId',
    component: BoardCanvasComponent,
    canActivate: [authGuard]
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
