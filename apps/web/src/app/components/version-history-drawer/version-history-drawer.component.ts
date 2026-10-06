import { Component, OnInit, inject, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VersionService } from '../../services/version.service';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';
import { BoardSnapshot } from '../../models/auth.models';

@Component({
  selector: 'app-version-history-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-100 select-none shadow-2xl">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Version History</h2>
            <p class="text-[11px] text-slate-400">Deterministic snapshot checkpoints</p>
          </div>
        </div>
        <button
          (click)="close.emit()"
          class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Versions List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        @if (versionService.loading()) {
          <div class="flex items-center justify-center py-12 text-slate-500 text-xs">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading snapshot history...
          </div>
        } @else if (versionService.versions().length === 0) {
          <div class="text-center py-12 text-slate-500 text-xs space-y-1">
            <p class="font-medium text-slate-400">No snapshot checkpoints</p>
            <p>Snapshots are automatically created during active sessions.</p>
          </div>
        } @else {
          @for (ver of versionService.versions(); track ver.id; let idx = $index) {
            <div
              class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3 hover:border-slate-700 transition-colors text-xs"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Seq #{{ ver.seq }}
                  </span>
                  @if (idx === 0) {
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Latest
                    </span>
                  }
                </div>
                <span class="text-[10px] text-slate-500 font-mono">{{ formatDate(ver.createdAt) }}</span>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-400">
                <span>{{ ver.data?.length || 0 }} Canvas Objects</span>
                <span>Snapshot ID: {{ ver.id.slice(0, 8) }}</span>
              </div>

              <!-- Restore Action -->
              <div class="pt-1 flex items-center justify-end">
                <button
                  (click)="restoreVersion(ver)"
                  [disabled]="isRestoring()"
                  class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-200 text-xs font-medium border border-slate-700 hover:border-amber-500 transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Restore this version
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class VersionHistoryDrawerComponent implements OnInit {
  readonly boardId = input.required<string>();
  readonly close = output<void>();
  readonly restored = output<number>();

  readonly versionService = inject(VersionService);
  readonly bridge = inject(CanvasEngineBridgeService);
  readonly isRestoring = signal(false);

  ngOnInit(): void {
    if (this.boardId()) {
      this.versionService.loadVersions(this.boardId()).subscribe();
    }
  }

  restoreVersion(ver: BoardSnapshot): void {
    const confirmRestore = confirm(
      `Are you sure you want to restore snapshot Seq #${ver.seq}? This will restore all objects to this checkpoint.`
    );
    if (!confirmRestore) return;

    this.isRestoring.set(true);
    this.versionService.restoreVersion(this.boardId(), ver.id).subscribe({
      next: (res) => {
        this.isRestoring.set(false);
        // Replace current local engine objects with snapshot data
        if (ver.data) {
          this.bridge.getEngine().getStore().reset(ver.data);
        }
        this.restored.emit(res.restoredSeq);
        this.close.emit();
      },
      error: () => this.isRestoring.set(false)
    });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }
}
