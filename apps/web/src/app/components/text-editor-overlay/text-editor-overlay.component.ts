import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextObject, StickyNoteObject } from '@alignify/shared-types';
import { CanvasEngineBridgeService } from '../../services/canvas-engine-bridge.service';

@Component({
  selector: 'app-text-editor-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (activeObject(); as obj) {
      <div
        class="fixed z-40 pointer-events-auto"
        [style.left.px]="screenPos().x"
        [style.top.px]="screenPos().y"
        [style.width.px]="screenPos().width"
        [style.height.px]="screenPos().height"
      >
        <textarea
          #editorTextarea
          [ngModel]="textValue()"
          (ngModelChange)="textValue.set($event)"
          (blur)="commit()"
          (keydown.escape)="cancel()"
          (keydown.enter)="onEnterKey($event)"
          class="w-full h-full p-2 bg-slate-900/90 text-white rounded-lg border-2 border-blue-500 shadow-2xl resize-none focus:outline-none backdrop-blur-md"
          [style.fontSize.px]="screenFontSize()"
          [style.textAlign]="obj.align || 'left'"
          [style.color]="obj.type === 'sticky' ? '#0f172a' : obj.stroke || '#ffffff'"
          [style.backgroundColor]="obj.type === 'sticky' ? obj.fill : '#0f172a'"
          placeholder="Type something..."
        ></textarea>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `
  ]
})
export class TextEditorOverlayComponent {
  readonly bridge = inject(CanvasEngineBridgeService);

  readonly textValue = signal('');
  readonly activeObject = computed(() => {
    const obj = this.bridge.activeEditObject();
    if (obj && (obj.type === 'text' || obj.type === 'sticky')) {
      return obj as TextObject | StickyNoteObject;
    }
    return null;
  });

  @ViewChild('editorTextarea')
  textareaRef?: ElementRef<HTMLTextAreaElement>;

  readonly screenPos = computed(() => {
    const obj = this.activeObject();
    const cam = this.bridge.cameraState();
    if (!obj) return { x: -9999, y: -9999, width: 0, height: 0 };

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const screenX = (obj.x - cam.x) * cam.zoom + vw / 2;
    const screenY = (obj.y - cam.y) * cam.zoom + vh / 2;
    const screenW = Math.max(120, obj.width * cam.zoom);
    const screenH = Math.max(60, obj.height * cam.zoom);

    return {
      x: screenX,
      y: screenY,
      width: screenW,
      height: screenH
    };
  });

  readonly screenFontSize = computed(() => {
    const obj = this.activeObject();
    const cam = this.bridge.cameraState();
    const baseSize = obj?.fontSize || 16;
    return Math.max(10, Math.round(baseSize * cam.zoom));
  });

  constructor() {
    effect(() => {
      const obj = this.activeObject();
      if (obj) {
        this.textValue.set(obj.text || '');
        setTimeout(() => {
          this.textareaRef?.nativeElement.focus();
          this.textareaRef?.nativeElement.select();
        }, 50);
      }
    });
  }

  onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey && this.activeObject()?.type === 'text') {
      keyboardEvent.preventDefault();
      this.commit();
    }
  }

  commit(): void {
    this.bridge.finishEditing(this.textValue());
  }

  cancel(): void {
    this.bridge.cancelEditing();
  }
}
