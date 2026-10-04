/**
 * Command Stack / Undo-Redo Manager
 * Manages reversible operations with transaction grouping and size limits.
 */
import { CompoundCommand, ICommand } from './command';

export type HistoryChangeListener = (state: HistoryState) => void;

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  lastCommandDescription?: string;
}

export class CommandStack {
  private readonly undoStack: ICommand[] = [];
  private readonly redoStack: ICommand[] = [];
  private readonly listeners = new Set<HistoryChangeListener>();

  private activeTransaction: {
    description: string;
    commands: ICommand[];
  } | null = null;

  constructor(public readonly maxStackSize = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0 && this.activeTransaction === null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && this.activeTransaction === null;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  getState(): HistoryState {
    const lastCmd = this.undoStack[this.undoStack.length - 1];
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      lastCommandDescription: lastCmd?.description
    };
  }

  /**
   * Executes a command and pushes it to the undo stack.
   * Clears the redo stack.
   */
  execute(command: ICommand): void {
    command.execute();

    if (this.activeTransaction) {
      this.activeTransaction.commands.push(command);
      return;
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.redoStack.length = 0;
    this.notify();
  }

  /**
   * Records a command that has ALREADY been executed (e.g. at the end of a drag).
   */
  record(command: ICommand): void {
    if (this.activeTransaction) {
      this.activeTransaction.commands.push(command);
      return;
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.redoStack.length = 0;
    this.notify();
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);
    this.notify();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const command = this.redoStack.pop();
    if (!command) return false;

    command.redo();
    this.undoStack.push(command);
    this.notify();
    return true;
  }

  startTransaction(description: string): void {
    if (this.activeTransaction) {
      // Already in transaction, commit previous
      this.commitTransaction();
    }
    this.activeTransaction = {
      description,
      commands: []
    };
  }

  commitTransaction(): void {
    if (!this.activeTransaction) return;

    const { description, commands } = this.activeTransaction;
    this.activeTransaction = null;

    if (commands.length === 0) return;

    const compound =
      commands.length === 1
        ? commands[0]!
        : new CompoundCommand(description, commands);

    this.undoStack.push(compound);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.redoStack.length = 0;
    this.notify();
  }

  rollbackTransaction(): void {
    if (!this.activeTransaction) return;

    const { commands } = this.activeTransaction;
    this.activeTransaction = null;

    // Undo whatever ran during this transaction
    for (let i = commands.length - 1; i >= 0; i--) {
      commands[i]!.undo();
    }
    this.notify();
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.activeTransaction = null;
    this.notify();
  }

  subscribe(listener: HistoryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
