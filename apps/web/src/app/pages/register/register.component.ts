import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const COLOR_OPTIONS = [
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

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen w-screen bg-slate-950 flex flex-col justify-center items-center px-4 select-none font-sans">
      <!-- Background Ambient Glow -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div class="absolute top-1/2 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
      </div>

      <div class="relative w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 z-10">
        <!-- Logo & Header -->
        <div class="flex flex-col items-center text-center mb-8">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
            <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-white">Join Alignify</h1>
          <p class="text-sm text-slate-400 mt-1">Create your account and start collaborating in real-time</p>
        </div>

        <!-- Error Banner -->
        @if (error()) {
          <div class="mb-5 p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{{ error() }}</span>
          </div>
        }

        <!-- Form -->
        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              [(ngModel)]="displayName"
              name="displayName"
              required
              autocomplete="name"
              placeholder="Alex Rivera"
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              autocomplete="email"
              placeholder="alex@company.com"
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <input
              type="password"
              [(ngModel)]="password"
              name="password"
              required
              autocomplete="new-password"
              placeholder="At least 6 characters"
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-2">Avatar & Cursor Color</label>
            <div class="flex items-center gap-2">
              @for (c of colors; track c) {
                <button
                  type="button"
                  (click)="selectedColor = c"
                  class="w-7 h-7 rounded-full transition-transform flex items-center justify-center"
                  [style.backgroundColor]="c"
                  [class.scale-125]="selectedColor === c"
                  [class.ring-2]="selectedColor === c"
                  [class.ring-white]="selectedColor === c"
                  [class.ring-offset-2]="selectedColor === c"
                  [class.ring-offset-slate-900]="selectedColor === c"
                >
                  @if (selectedColor === c) {
                    <svg class="w-3.5 h-3.5 text-white stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  }
                </button>
              }
            </div>
          </div>

          <button
            type="submit"
            [disabled]="isLoading() || !email || !password || !displayName"
            class="w-full mt-4 py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/25 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            @if (isLoading()) {
              <svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Creating account...</span>
            } @else {
              <span>Create Account</span>
            }
          </button>
        </form>

        <div class="mt-6 text-center text-xs text-slate-400">
          Already have an account?
          <a routerLink="/login" class="text-blue-400 hover:text-blue-300 font-semibold ml-1">Sign in</a>
        </div>
      </div>
    </div>
  `
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  displayName = '';
  email = '';
  password = '';
  selectedColor = COLOR_OPTIONS[0];
  colors = COLOR_OPTIONS;

  isLoading = signal(false);
  error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password || !this.displayName) return;

    if (this.password.length < 6) {
      this.error.set('Password must be at least 6 characters');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.auth.register({
        email: this.email,
        password: this.password,
        displayName: this.displayName,
        avatarColor: this.selectedColor
      });
      this.router.navigateByUrl('/workspaces');
    } catch (err: any) {
      this.error.set(err.message || 'Registration failed. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
