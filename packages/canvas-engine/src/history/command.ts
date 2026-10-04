/**
 * Command Pattern Interfaces
 */

export interface ICommand {
  readonly id: string;
  readonly description: string;
  execute(): void;
  undo(): void;
  redo(): void;
}

export class CompoundCommand implements ICommand {
  readonly id: string;

  constructor(
    public readonly description: string,
    private readonly commands: ICommand[]
  ) {
    this.id = 'compound_' + Math.random().toString(36).substring(2, 9);
  }

  get count(): number {
    return this.commands.length;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i]!.undo();
    }
  }

  redo(): void {
    for (const cmd of this.commands) {
      cmd.redo();
    }
  }
}
