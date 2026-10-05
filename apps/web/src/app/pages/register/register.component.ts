import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const AVATAR_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1'  // Indigo
];

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen w-full bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      <!-- Background Glow -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
      </div>

      <div class="relative w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-8 shadow-2xl shadow-black/50">
        <!-- Brand Header -->
        <div class="flex items-center gap-3 mb-8">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-white">Alignify</h1>
            <p class="text-xs text-slate-400 font-medium">Real-Time Visual Workspace</p>
          </div>
        </div>

        <div class="mb-6">
          <h2 class="text-2xl font-semibold text-slate-100">Create your account</h2>
          <p class="text-sm text-slate-400 mt-1">Start collaborating with your team in real time</p>
        </div>

        <!-- Error Alert -->
        @if (errorMessage()) {
          <div class="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5" for="displayName">
              Full Name / Nickname
            </label>
            <input
              id="displayName"
              type="text"
              [(ngModel)]="displayName"
              name="displayName"
              required
              placeholder="Alice Parker"
              class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5" for="email">
              Work Email
            </label>
            <input
              id="email"
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              placeholder="alice@company.dev"
              class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5" for="password">
              Password (min 6 characters)
            </label>
            <input
              id="password"
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              minlength="6"
              placeholder="••••••••"
              class="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Choose Avatar Color
            </label>
            <div class="flex items-center gap-2">
              @for (color of avatarColors; track color) {
                <button
                  type="button"
                  (click)="selectedColor = color"
                  [style.background-color]="color"
                  [class.ring-2]="selectedColor === color"
                  [class.ring-white]="selectedColor === color"
                  [class.scale-110]="selectedColor === color"
                  class="w-7 h-7 rounded-full cursor-pointer transition-transform ring-offset-2 ring-offset-slate-900 focus:outline-none"
                ></button>
              }
            </div>
          </div>

          <button
            type="submit"
            [disabled]="loading() || !email || !password || !displayName"
            class="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
          >
            @if (loading()) {
              <svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Creating account...</span>
            } @else {
              <span>Get Started</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
              </svg>
            }
          </button>
        </form>

        <div class="mt-8 pt-6 border-t border-slate-800 text-center">
          <p class="text-sm text-slate-400">
            Already have an account?
            <a routerLink="/login" class="text-indigo-400 hover:text-indigo-300 font-medium ml-1 transition-colors">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  displayName = '';
  email = '';
  password = '';
  avatarColors = AVATAR_COLORS;
  selectedColor = AVATAR_COLORS[0];

  loading = signal<boolean>(false);
  errorMessage = signal<string>('');

  onSubmit(): void {
    if (!this.email || !this.password || !this.displayName) return;

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService
      .register({
        displayName: this.displayName,
        email: this.email,
        password: this.password,
        avatarColor: this.selectedColor
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/workspaces']);
        },
        error: (err) => {
          this.loading.set(false);
          this.errorMessage.set(err?.error?.error || 'Failed to create account. Please try again.');
        }
      });
  }
}
