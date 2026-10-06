import { Component, OnInit, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../services/activity.service';
import { BoardActivity } from '../../models/auth.models';

@Component({
  selector: 'app-activity-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-100 select-none shadow-2xl">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Activity Log</h2>
            <p class="text-[11px] text-slate-400">Audit trail of changes & collaboration</p>
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

      <!-- Activity Items List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        @if (activityService.loading()) {
          <div class="flex items-center justify-center py-12 text-slate-500 text-xs">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading activity log...
          </div>
        } @else if (activityService.activities().length === 0) {
          <div class="text-center py-12 text-slate-500 text-xs space-y-1">
            <p class="font-medium text-slate-400">No activity recorded yet</p>
            <p>Actions on this board will appear here automatically.</p>
          </div>
        } @else {
          <div class="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            @for (act of activityService.activities(); track act.id) {
              <div class="relative group">
                <!-- Timeline Dot -->
                <div
                  class="absolute -left-6 top-1 w-5 h-5 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px]"
                  [class.bg-indigo-600]="act.actionType.startsWith('board_')"
                  [class.bg-emerald-600]="act.actionType.startsWith('comment_')"
                  [class.bg-amber-600]="act.actionType.startsWith('version_')"
                  [class.bg-purple-600]="!act.actionType.startsWith('board_') && !act.actionType.startsWith('comment_') && !act.actionType.startsWith('version_')"
                >
                  <span class="text-white text-[9px]">●</span>
                </div>

                <!-- Event Details -->
                <div class="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 hover:border-slate-700 transition-colors">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-slate-200">{{ act.userName || 'Collaborator' }}</span>
                    <span class="text-[10px] text-slate-500 font-mono">{{ formatDate(act.createdAt) }}</span>
                  </div>

                  <p class="text-slate-300 font-medium">
                    {{ formatActionText(act) }}
                  </p>

                  @if (hasMetadata(act)) {
                    <div class="pt-1 text-[10px] font-mono text-slate-400 bg-slate-900/60 rounded p-1.5 overflow-x-auto">
                      {{ formatMetadata(act.metadata) }}
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class ActivityDrawerComponent implements OnInit {
  readonly boardId = input.required<string>();
  readonly close = output<void>();

  readonly activityService = inject(ActivityService);

  ngOnInit(): void {
    if (this.boardId()) {
      this.activityService.loadActivities(this.boardId()).subscribe();
    }
  }

  formatActionText(act: BoardActivity): string {
    switch (act.actionType) {
      case 'board_created':
        return 'Created this board';
      case 'comment_created':
        return 'Posted a new comment';
      case 'comment_resolved':
        return 'Marked a comment thread as resolved';
      case 'comment_deleted':
        return 'Deleted a comment thread';
      case 'version_restored':
        return `Restored board to snapshot sequence #${act.metadata?.restoredSeq || ''}`;
      case 'snapshot_created':
        return 'Compacted board checkpoint snapshot';
      case 'member_invited':
        return 'Invited a team member to collaborate';
      case 'board_renamed':
        return `Renamed board to "${act.metadata?.name || 'new name'}"`;
      default:
        return `Performed ${act.actionType.replace(/_/g, ' ')}`;
    }
  }

  hasMetadata(act: BoardActivity): boolean {
    return act.metadata && Object.keys(act.metadata).length > 0 && !act.actionType.startsWith('version_');
  }

  formatMetadata(meta: any): string {
    return JSON.stringify(meta);
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
