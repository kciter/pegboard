import type { Block } from '../../Block';
import type { GridPosition } from '../../types';
import type { ICommand, ICommandContext, IPlanResult } from './types';

export class MoveCommand implements ICommand {
  constructor(private moves: Array<{ block: Block; to: GridPosition }>) {}

  plan(_ctx: ICommandContext): IPlanResult {
    const planned = this.moves.map(({ block, to }) => ({
      block,
      from: { ...block.getData().position },
      to,
    }));
    return { ok: true, moves: planned };
  }

  commit(_ctx: ICommandContext): IPlanResult {
    const committed = this.moves.map(({ block, to }) => ({
      block,
      from: { ...block.getData().position },
      to,
    }));
    for (const { block, to } of this.moves) block.setPosition(to);
    return { ok: true, moves: committed };
  }
}
