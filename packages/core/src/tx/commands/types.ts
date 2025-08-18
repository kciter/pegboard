import type { Block } from '../../Block';
import type { GridPosition, GridSize } from '../../types';

export interface ICommandContext {
  container: HTMLElement;
}

export interface IPlanResult {
  ok: boolean;
  reason?: string;
  moves?: Array<{ block: Block; from: GridPosition; to: GridPosition }>;
  // Generic changes (position and/or size), used by resize or combined mutations
  changes?: Array<{ block: Block; toPos?: GridPosition; toSize?: GridSize }>;
}

export interface ICommand {
  plan(ctx: ICommandContext): IPlanResult;
  commit(ctx: ICommandContext): IPlanResult;
  // Optional for future undo/redo
  // undo?(ctx: ICommandContext): void;
}
