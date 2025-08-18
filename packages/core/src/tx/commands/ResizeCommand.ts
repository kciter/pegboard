import type { Block } from '../../Block';
import type { GridPosition, GridSize } from '../../types';
import type { ICommand, ICommandContext, IPlanResult } from './types';

/**
 * ResizeCommand: 하나 또는 여러 블럭의 사이즈(및 필요 시 위치)를 변경.
 * 검증/충돌/제약 확인은 상위 레이어(전략)에서 수행하고, 이 커맨드는 적용을 캡슐화합니다.
 */
export class ResizeCommand implements ICommand {
  constructor(private items: Array<{ block: Block; toSize: GridSize; toPos?: GridPosition }>) {}

  plan(_ctx: ICommandContext): IPlanResult {
    // 상위에서 제약검증이 끝났다고 가정하고 변경 내용만 내보냄
    return {
      ok: true,
      changes: this.items.map(({ block, toSize, toPos }) => ({ block, toPos, toSize })),
    };
  }

  commit(_ctx: ICommandContext): IPlanResult {
    for (const { block, toSize, toPos } of this.items) {
      if (toPos) block.setPosition(toPos);
      block.setSize(toSize);
    }
    return {
      ok: true,
      changes: this.items.map(({ block, toSize, toPos }) => ({ block, toPos, toSize })),
    };
  }
}
