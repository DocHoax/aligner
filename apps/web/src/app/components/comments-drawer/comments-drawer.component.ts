import { Component, OnInit, inject, signal, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommentService } from '../../services/comment.service';
import { AuthService } from '../../services/auth.service';
import { BoardComment } from '../../models/auth.models';

@Component({
  selector: 'app-comments-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-100 select-none shadow-2xl">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Board Comments</h2>
            <p class="text-[11px] text-slate-400">Discuss design decisions and feedback</p>
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

      <!-- Filter Tabs -->
      <div class="px-4 py-2 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 text-xs">
        <button
          (click)="filter.set('all')"
          class="px-3 py-1 rounded-lg font-medium transition-colors"
          [class.bg-indigo-600]="filter() === 'all'"
          [class.text-white]="filter() === 'all'"
          [class.text-slate-400]="filter() !== 'all'"
          [class.hover:text-slate-200]="filter() !== 'all'"
        >
          All ({{ commentService.comments().length }})
        </button>
        <button
          (click)="filter.set('open')"
          class="px-3 py-1 rounded-lg font-medium transition-colors"
          [class.bg-indigo-600]="filter() === 'open'"
          [class.text-white]="filter() === 'open'"
          [class.text-slate-400]="filter() !== 'open'"
          [class.hover:text-slate-200]="filter() !== 'open'"
        >
          Open ({{ openCount() }})
        </button>
        <button
          (click)="filter.set('resolved')"
          class="px-3 py-1 rounded-lg font-medium transition-colors"
          [class.bg-indigo-600]="filter() === 'resolved'"
          [class.text-white]="filter() === 'resolved'"
          [class.text-slate-400]="filter() !== 'resolved'"
          [class.hover:text-slate-200]="filter() !== 'resolved'"
        >
          Resolved ({{ resolvedCount() }})
        </button>
      </div>

      <!-- New Comment Box -->
      <div class="p-4 border-b border-slate-800 bg-slate-950/20">
        <div class="relative">
          <textarea
            [(ngModel)]="newCommentText"
            (keydown.enter)="$event.ctrlKey && submitNewComment()"
            placeholder="Write a comment or feedback... (Ctrl+Enter to post)"
            rows="2"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
          ></textarea>
          <div class="flex items-center justify-between mt-2">
            <span class="text-[10px] text-slate-500">Ctrl+Enter to post</span>
            <button
              (click)="submitNewComment()"
              [disabled]="!newCommentText.trim() || isSubmitting()"
              class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Post Comment
            </button>
          </div>
        </div>
      </div>

      <!-- Comments List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        @if (commentService.loading()) {
          <div class="flex items-center justify-center py-12 text-slate-500 text-xs">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading discussions...
          </div>
        } @else if (filteredComments().length === 0) {
          <div class="text-center py-12 text-slate-500 text-xs space-y-1">
            <p class="font-medium text-slate-400">No comments yet</p>
            <p>Use the comment pin tool (C) or write in the box above.</p>
          </div>
        } @else {
          @for (cmt of filteredComments(); track cmt.id) {
            <div
              class="bg-slate-950/60 border rounded-xl p-3.5 space-y-3 transition-colors text-xs"
              [class.border-slate-800]="!cmt.resolved"
              [class.border-emerald-900/40]="cmt.resolved"
              [class.bg-emerald-950/10]="cmt.resolved"
            >
              <!-- Author Row -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                    {{ (cmt.authorName || 'U').charAt(0) }}
                  </div>
                  <div>
                    <span class="font-semibold text-slate-200">{{ cmt.authorName || 'Collaborator' }}</span>
                    <span class="text-[10px] text-slate-500 ml-2">{{ formatDate(cmt.createdAt) }}</span>
                  </div>
                </div>

                <!-- Status & Action Menu -->
                <div class="flex items-center gap-1">
                  @if (cmt.posX !== undefined && cmt.posY !== undefined) {
                    <button
                      (click)="panToLocation.emit({ x: cmt.posX!, y: cmt.posY! })"
                      class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-indigo-300 hover:bg-indigo-900/60 transition-colors flex items-center gap-1"
                      title="Pan camera to comment location"
                    >
                      <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Pin
                    </button>
                  }

                  <button
                    (click)="toggleResolve(cmt)"
                    class="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    [title]="cmt.resolved ? 'Mark as Open' : 'Mark as Resolved'"
                  >
                    @if (cmt.resolved) {
                      <svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                    } @else {
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="12" cy="12" r="9" stroke-width="2"/>
                      </svg>
                    }
                  </button>
                </div>
              </div>

              <!-- Content Body -->
              <p class="text-slate-300 leading-relaxed whitespace-pre-wrap select-text">{{ cmt.content }}</p>

              <!-- Replies List -->
              @if (cmt.replies && cmt.replies.length > 0) {
                <div class="pl-3 border-l-2 border-slate-800 space-y-2 pt-1">
                  @for (reply of cmt.replies; track reply.id) {
                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="font-semibold text-slate-300">{{ reply.authorName || 'Collaborator' }}</span>
                        <span class="text-[10px] text-slate-500">{{ formatDate(reply.createdAt) }}</span>
                      </div>
                      <p class="text-slate-300 text-[11px] leading-relaxed whitespace-pre-wrap select-text">{{ reply.content }}</p>
                    </div>
                  }
                </div>
              }

              <!-- Inline Reply Input -->
              <div class="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  [(ngModel)]="replyTexts[cmt.id]"
                  (keydown.enter)="submitReply(cmt)"
                  placeholder="Write a reply..."
                  class="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  (click)="submitReply(cmt)"
                  [disabled]="!replyTexts[cmt.id]?.trim()"
                  class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Reply
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class CommentsDrawerComponent implements OnInit {
  readonly boardId = input.required<string>();
  readonly close = output<void>();
  readonly panToLocation = output<{ x: number; y: number }>();

  readonly commentService = inject(CommentService);
  readonly authService = inject(AuthService);

  readonly filter = signal<'all' | 'open' | 'resolved'>('all');
  newCommentText = '';
  replyTexts: Record<string, string> = {};
  readonly isSubmitting = signal(false);

  readonly openCount = computed(() => this.commentService.comments().filter((c) => !c.resolved).length);
  readonly resolvedCount = computed(() => this.commentService.comments().filter((c) => c.resolved).length);

  readonly filteredComments = computed(() => {
    const list = this.commentService.comments();
    const f = this.filter();
    if (f === 'open') return list.filter((c) => !c.resolved);
    if (f === 'resolved') return list.filter((c) => c.resolved);
    return list;
  });

  ngOnInit(): void {
    if (this.boardId()) {
      this.commentService.loadComments(this.boardId()).subscribe();
    }
  }

  submitNewComment(): void {
    const text = this.newCommentText.trim();
    if (!text || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.commentService.createComment(this.boardId(), { content: text }).subscribe({
      next: () => {
        this.newCommentText = '';
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }

  submitReply(parent: BoardComment): void {
    const text = this.replyTexts[parent.id]?.trim();
    if (!text) return;

    this.commentService
      .createComment(this.boardId(), {
        content: text,
        parentId: parent.id
      })
      .subscribe({
        next: () => {
          this.replyTexts[parent.id] = '';
        }
      });
  }

  toggleResolve(cmt: BoardComment): void {
    this.commentService
      .updateComment(this.boardId(), cmt.id, { resolved: !cmt.resolved })
      .subscribe();
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
