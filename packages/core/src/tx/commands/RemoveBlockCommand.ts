import type { ICommand, ICommandContext, IPlanResult } from './types';

/**
 * RemoveBlockCommand: 외부에서 제공한 실행 클로저를 통해 블록 삭제를 수행합니다.
 */
export class RemoveBlockCommand implements ICommand {
  constructor(private execute: () => boolean) {}

  plan(_ctx: ICommandContext): IPlanResult {
    return { ok: true };
  }

  commit(_ctx: ICommandContext): IPlanResult {
    const ok = this.execute();
    return { ok };
  }
}
