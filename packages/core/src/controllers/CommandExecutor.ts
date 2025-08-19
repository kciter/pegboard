import type { ICommand, ICommandContext, IPlanResult } from '../tx/commands/types';
import { withCommands } from '../tx/Transaction';

/**
 * CommandExecutor: 중앙에서 커맨드를 계획/실행합니다.
 * - 비시각(시각적 변경 없음) 커맨드는 동기적으로 commit 결과를 반환합니다.
 * - 시각 커밋이 필요한 경우 Transaction을 통해 FLIP/none 전략으로 커밋합니다.
 */
export class CommandExecutor {
  constructor(private container: HTMLElement, private easing = 'transform 160ms ease') {}

  /**
   * 동기 실행: 시각적 변경이 없는 경우에만 결과 배열을 반환합니다. (그 외엔 null)
   */
  runSync(commands: ICommand[], visual: 'flip' | 'none' = 'flip'): IPlanResult[] | null {
    const ctx: ICommandContext = { container: this.container };
    const aggregated = { moves: 0, changes: 0 };
    for (const cmd of commands) {
      const plan = cmd.plan(ctx);
      if (!plan.ok) return [{ ok: false, reason: plan.reason }];
      aggregated.moves += plan.moves?.length || 0;
      aggregated.changes += plan.changes?.length || 0;
    }
    // 비시각: 각 커맨드를 직접 커밋하여 결과 반환
    if (aggregated.moves === 0 && aggregated.changes === 0) {
      const results: IPlanResult[] = [];
      for (const cmd of commands) results.push(cmd.commit(ctx));
      return results;
    }
    // 시각 필요: Transaction 경로로 위임(동기 반환 없음)
    const tx = withCommands(this.container, this.easing, commands);
    // best-effort: visual이 none이면 즉시 적용
    void (tx as any).commit(visual);
    return null;
  }

  /**
   * 비동기 실행: 시각 커밋은 await, 비시각은 결과 배열 반환
   */
  async run(commands: ICommand[], visual: 'flip' | 'none' = 'flip'): Promise<IPlanResult[] | null> {
    const ctx: ICommandContext = { container: this.container };
    const aggregated = { moves: 0, changes: 0 };
    for (const cmd of commands) {
      const plan = cmd.plan(ctx);
      if (!plan.ok) return [{ ok: false, reason: plan.reason }];
      aggregated.moves += plan.moves?.length || 0;
      aggregated.changes += plan.changes?.length || 0;
    }
    if (aggregated.moves === 0 && aggregated.changes === 0) {
      const results: IPlanResult[] = [];
      for (const cmd of commands) results.push(cmd.commit(ctx));
      return results;
    }
    const tx = withCommands(this.container, this.easing, commands);
    await (tx as any).commit(visual);
    return null;
  }
}
