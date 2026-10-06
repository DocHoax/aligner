import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

export interface CommandItem {
  id: string;
  category: 'Tools' | 'Canvas' | 'Arrange' | 'Panels' | 'Export' | 'Navigation';
  label: string;
  description?: string;
  hotkey?: string;
  icon?: string;
  action: () => void;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-in fade-in duration-100"
        (click)="close()"
        (keydown.escape)="close()"
      >
        <div
          class="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100 select-none text-slate-100"
          (click)="$event.stopPropagation()"
        >
          <!-- Search Header -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/90">
            <svg class="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              #searchInput
              type="text"
              [ngModel]="query()"
              (ngModelChange)="onQueryChange($event)"
              (keydown)="handleKeyDown($event)"
              placeholder="Type a command or search action..."
              class="w-full bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0"
            />
            <kbd class="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-slate-800 border border-slate-700 rounded text-slate-400">ESC</kbd>
          </div>

          <!-- Commands List -->
          <div class="max-h-80 overflow-y-auto p-2 space-y-1">
            @if (filteredCommands().length === 0) {
              <div class="p-8 text-center text-slate-500 text-sm">
                No matching commands found for "{{ query() }}"
              </div>
            } @else {
              @for (cmd of filteredCommands(); track cmd.id; let idx = $index) {
                <button
                  type="button"
                  (click)="executeCommand(cmd)"
                  (mouseenter)="selectedIndex.set(idx)"
                  class="w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs transition-colors"
                  [class.bg-indigo-600]="selectedIndex() === idx"
                  [class.text-white]="selectedIndex() === idx"
                  [class.text-slate-300]="selectedIndex() !== idx"
                  [class.hover:bg-slate-800]="selectedIndex() !== idx"
                >
                  <div class="flex items-center gap-3">
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                      [class.bg-indigo-700]="selectedIndex() === idx"
                      [class.text-indigo-200]="selectedIndex() === idx"
                      [class.bg-slate-800]="selectedIndex() !== idx"
                      [class.text-slate-400]="selectedIndex() !== idx"
                    >
                      {{ cmd.category }}
                    </span>
                    <span class="font-medium">{{ cmd.label }}</span>
                  </div>

                  @if (cmd.hotkey) {
                    <kbd
                      class="px-1.5 py-0.5 rounded font-mono text-[10px]"
                      [class.bg-indigo-700]="selectedIndex() === idx"
                      [class.text-indigo-200]="selectedIndex() === idx"
                      [class.bg-slate-800]="selectedIndex() !== idx"
                      [class.text-slate-400]="selectedIndex() !== idx"
                    >
                      {{ cmd.hotkey }}
                    </kbd>
                  }
                </button>
              }
            }
          </div>

          <!-- Footer Hints -->
          <div class="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <div class="flex items-center gap-2">
              <span>↑↓ navigate</span>
              <span>•</span>
              <span>↵ select</span>
            </div>
            <span>Alignify Command Palette</span>
          </div>
        </div>
      </div>
    }
  `
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  private bridge = inject(CanvasEngineBridgeService);
  private router = inject(Router);

  readonly toggleComments = output<void>();
  readonly toggleActivity = output<void>();
  readonly toggleVersionHistory = output<void>();
  readonly toggleShare = output<void>();
  readonly toggleShortcuts = output<void>();
  readonly toggleLayers = output<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly selectedIndex = signal(0);

  private readonly allCommands: CommandItem[] = [
    // Tools
    { id: 'tool-select', category: 'Tools', label: 'Select & Transform Tool', hotkey: 'V', action: () => this.bridge.setTool('select') },
    { id: 'tool-pan', category: 'Tools', label: 'Pan / Hand Tool', hotkey: 'H', action: () => this.bridge.setTool('pan') },
    { id: 'tool-rect', category: 'Tools', label: 'Rectangle Shape', hotkey: 'R', action: () => this.bridge.setTool('rectangle') },
    { id: 'tool-ellipse', category: 'Tools', label: 'Ellipse Shape', hotkey: 'O', action: () => this.bridge.setTool('ellipse') },
    { id: 'tool-line', category: 'Tools', label: 'Line Segment', hotkey: 'L', action: () => this.bridge.setTool('line') },
    { id: 'tool-arrow', category: 'Tools', label: 'Arrow Connection', hotkey: 'A', action: () => this.bridge.setTool('arrow') },
    { id: 'tool-text', category: 'Tools', label: 'Text Block', hotkey: 'T', action: () => this.bridge.setTool('text') },
    { id: 'tool-sticky', category: 'Tools', label: 'Sticky Note', hotkey: 'S', action: () => this.bridge.setTool('sticky') },
    { id: 'tool-frame', category: 'Tools', label: 'Frame Container', hotkey: 'F', action: () => this.bridge.setTool('frame') },

    // Canvas & Navigation
    { id: 'canvas-zoom-in', category: 'Canvas', label: 'Zoom In', hotkey: 'Ctrl + +', action: () => this.bridge.zoomIn() },
    { id: 'canvas-zoom-out', category: 'Canvas', label: 'Zoom Out', hotkey: 'Ctrl + -', action: () => this.bridge.zoomOut() },
    { id: 'canvas-reset-zoom', category: 'Canvas', label: 'Reset Zoom (100%)', hotkey: 'Ctrl + 0', action: () => this.bridge.resetZoom() },
    { id: 'canvas-fit-content', category: 'Canvas', label: 'Fit View to Content', hotkey: 'Shift + 1', action: () => this.bridge.fitToContent() },
    { id: 'canvas-select-all', category: 'Canvas', label: 'Select All Objects', hotkey: 'Ctrl + A', action: () => this.bridge.selectAll() },
    { id: 'canvas-clear-selection', category: 'Canvas', label: 'Deselect All', hotkey: 'Esc', action: () => this.bridge.clearSelection() },
    { id: 'canvas-delete-selected', category: 'Canvas', label: 'Delete Selected Objects', hotkey: 'Del', action: () => this.bridge.deleteSelected() },
    { id: 'canvas-undo', category: 'Canvas', label: 'Undo Last Action', hotkey: 'Ctrl + Z', action: () => this.bridge.undo() },
    { id: 'canvas-redo', category: 'Canvas', label: 'Redo Action', hotkey: 'Ctrl + Shift + Z', action: () => this.bridge.redo() },

    // Arrange & Alignment
    { id: 'align-left', category: 'Arrange', label: 'Align Left', action: () => this.bridge.alignSelected('left') },
    { id: 'align-center', category: 'Arrange', label: 'Align Center', action: () => this.bridge.alignSelected('center') },
    { id: 'align-right', category: 'Arrange', label: 'Align Right', action: () => this.bridge.alignSelected('right') },
    { id: 'align-top', category: 'Arrange', label: 'Align Top', action: () => this.bridge.alignSelected('top') },
    { id: 'align-middle', category: 'Arrange', label: 'Align Middle', action: () => this.bridge.alignSelected('middle') },
    { id: 'align-bottom', category: 'Arrange', label: 'Align Bottom', action: () => this.bridge.alignSelected('bottom') },
    { id: 'distribute-h', category: 'Arrange', label: 'Distribute Horizontally', action: () => this.bridge.distributeSelected('horizontal') },
    { id: 'distribute-v', category: 'Arrange', label: 'Distribute Vertically', action: () => this.bridge.distributeSelected('vertical') },
    { id: 'order-front', category: 'Arrange', label: 'Bring to Front', hotkey: ']', action: () => this.bridge.reorderSelected('bringToFront') },
    { id: 'order-back', category: 'Arrange', label: 'Send to Back', hotkey: '[', action: () => this.bridge.reorderSelected('sendToBack') },
    { id: 'lock-toggle', category: 'Arrange', label: 'Toggle Lock on Selected', hotkey: 'Ctrl + L', action: () => this.bridge.toggleSelectedLock() },

    // Panels & Drawers
    { id: 'panel-layers', category: 'Panels', label: 'Toggle Layers Panel', action: () => this.toggleLayers.emit() },
    { id: 'panel-comments', category: 'Panels', label: 'Toggle Comments Drawer', hotkey: 'C', action: () => this.toggleComments.emit() },
    { id: 'panel-activity', category: 'Panels', label: 'Toggle Activity Audit Feed', action: () => this.toggleActivity.emit() },
    { id: 'panel-version-history', category: 'Panels', label: 'Toggle Version History', action: () => this.toggleVersionHistory.emit() },
    { id: 'panel-share', category: 'Panels', label: 'Share Board Dialog', action: () => this.toggleShare.emit() },
    { id: 'panel-shortcuts', category: 'Panels', label: 'Keyboard Shortcuts Cheat Sheet', hotkey: '?', action: () => this.toggleShortcuts.emit() },

    // Export
    { id: 'export-png', category: 'Export', label: 'Export High-Resolution PNG', action: () => this.bridge.exportPNG() },
    { id: 'export-svg', category: 'Export', label: 'Export Vector SVG', action: () => this.bridge.exportSVG() },
    { id: 'export-json', category: 'Export', label: 'Export Alignify Document JSON', action: () => this.bridge.exportJSON() },

    // Navigation
    { id: 'nav-workspaces', category: 'Navigation', label: 'Go to Workspaces Dashboard', action: () => this.router.navigate(['/workspaces']) }
  ];

  readonly filteredCommands = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return this.allCommands;
    return this.allCommands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.hotkey && c.hotkey.toLowerCase().includes(q))
    );
  });

  private keyListener = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
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
    this.query.set('');
    this.selectedIndex.set(0);
    this.isOpen.set(true);
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 50);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  onQueryChange(val: string): void {
    this.query.set(val);
    this.selectedIndex.set(0);
  }

  handleKeyDown(e: KeyboardEvent): void {
    const list = this.filteredCommands();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex.update((idx) => (idx + 1) % Math.max(1, list.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex.update((idx) => (idx - 1 + list.length) % Math.max(1, list.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = list[this.selectedIndex()];
      if (selected) {
        this.executeCommand(selected);
      }
    }
  }

  executeCommand(cmd: CommandItem): void {
    this.close();
    cmd.action();
  }
}
