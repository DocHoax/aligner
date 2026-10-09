import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ShortcutGroup {
  name: string;
  items: { key: string; description: string }[];
}

@Component({
  selector: 'app-shortcuts-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100"
        (click)="close()"
        (keydown.escape)="close()"
      >
        <div
          class="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100 text-slate-100"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                ?
              </div>
              <div>
                <h2 class="text-base font-semibold text-slate-100">Keyboard Shortcuts</h2>
                <p class="text-xs text-slate-400">Boost your design productivity with quick key combinations</p>
              </div>
            </div>
            <button
              (click)="close()"
              class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Shortcuts Grid Content -->
          <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            @for (group of shortcutGroups; track group.name) {
              <div class="space-y-3">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-indigo-400 px-1">{{ group.name }}</h3>
                <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
                  @for (item of group.items; track item.key) {
                    <div class="flex items-center justify-between text-xs py-1">
                      <span class="text-slate-300">{{ item.description }}</span>
                      <kbd class="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-800 border border-slate-700 text-slate-300 font-medium shadow-sm">
                        {{ item.key }}
                      </kbd>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Press <kbd class="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-800 border border-slate-700 text-slate-300">Esc</kbd> to close</span>
            <span class="text-[11px] text-slate-500 font-mono">Alignify Hotkey Reference</span>
          </div>
        </div>
      </div>
    }
  `
})
export class ShortcutsDialogComponent implements OnInit, OnDestroy {
  readonly isOpen = signal(false);

  readonly shortcutGroups: ShortcutGroup[] = [
    {
      name: 'Drawing Tools',
      items: [
        { key: 'V', description: 'Select & Transform Tool' },
        { key: 'H', description: 'Hand / Pan Tool' },
        { key: 'R', description: 'Rectangle Shape' },
        { key: 'O', description: 'Ellipse Shape' },
        { key: 'L', description: 'Line Segment' },
        { key: 'A', description: 'Arrow Tool' },
        { key: 'T', description: 'Text Tool' },
        { key: 'S', description: 'Sticky Note Tool' },
        { key: 'F', description: 'Frame Container' },
        { key: 'C', description: 'Comment Pin Tool' }
      ]
    },
    {
      name: 'Canvas Navigation',
      items: [
        { key: 'Space + Drag', description: 'Quick Pan Canvas' },
        { key: 'Scroll Wheel', description: 'Pan Vertical / Zoom' },
        { key: 'Ctrl + / -', description: 'Zoom In / Zoom Out' },
        { key: 'Ctrl + 0', description: 'Reset Zoom (100%)' },
        { key: 'Shift + 1', description: 'Fit View to Content' }
      ]
    },
    {
      name: 'Object & Selection Actions',
      items: [
        { key: 'Ctrl + A', description: 'Select All Objects' },
        { key: 'Del / Backspace', description: 'Delete Selected' },
        { key: 'Ctrl + Z', description: 'Undo Action' },
        { key: 'Ctrl + Shift + Z', description: 'Redo Action' },
        { key: 'Ctrl + L', description: 'Toggle Lock' },
        { key: 'Esc', description: 'Deselect / Cancel' }
      ]
    },
    {
      name: 'Arrangement & System',
      items: [
        { key: ']', description: 'Bring to Front' },
        { key: '[', description: 'Send to Back' },
        { key: 'Ctrl + Shift + A', description: 'AI Architecture Assistant' },
        { key: 'Ctrl + K', description: 'Command Palette' },
        { key: '?', description: 'Keyboard Shortcuts Sheet' }
      ]
    }
  ];

  private keyListener = (e: KeyboardEvent) => {
    // Only open if not typing in an input or textarea
    const target = e.target as HTMLElement;
    const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    if (!isEditing && e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.toggle();
    }
  };

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keyListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyListener);
    }
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }
}
