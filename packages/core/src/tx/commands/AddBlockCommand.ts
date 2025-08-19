import type { ICommand, ICommandContext, IPlanResult } from './types';

/**
 * AddBlockCommand: 외부에서 제공한 실행 클로저를 통해 블록 추가를 수행합니다.
 * plan 단계에서는 시각적 변경 집계가 없으므로 Transaction은 그대로 commit만 호출하면 됩니다.
 */
export class AddBlockCommand implements ICommand {
  constructor(private execute: () => string) {}

  plan(_ctx: ICommandContext): IPlanResult {
    return { ok: true };
  }

  commit(_ctx: ICommandContext): IPlanResult {
    const id = this.execute();
    return { ok: true, reason: id };
  }
}
