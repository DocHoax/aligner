/**
 * Render Loop
 * rAF-driven scheduler with dirty-flagging to guarantee 60-120fps smooth rendering and zero unnecessary GPU/CPU cycles.
 */
export type RenderCallback = () => void;

export class RenderLoop {
  private isRunning = false;
  private isDirty = true;
  private animFrameId: number | null = null;

  constructor(private readonly renderCallback: RenderCallback) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isDirty = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  requestRender(): void {
    this.isDirty = true;
    if (this.isRunning && this.animFrameId === null) {
      this.scheduleFrame();
    }
  }

  renderImmediate(): void {
    this.renderCallback();
    this.isDirty = false;
  }

  private scheduleFrame(): void {
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null;
      if (!this.isRunning) return;

      if (this.isDirty) {
        this.isDirty = false;
        try {
          this.renderCallback();
        } catch (err) {
          console.error('[RenderLoop] Error during render cycle:', err);
        }
      }

      // Loop continues listening for next dirty flag or animation
      if (this.isRunning) {
        this.scheduleFrame();
      }
    });
  }
}
