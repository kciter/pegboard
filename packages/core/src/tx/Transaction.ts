import type { Block } from '../Block';
import type { GridPosition, GridSize } from '../types';
import type { ICommand, ICommandContext, IPlanResult } from './commands/types';

type Move = { block: Block; from: GridPosition; to: GridPosition };
type Change = { block: Block; toPos?: GridPosition; toSize?: GridSize };

/**
 * Internal-only transaction for batching block mutations and committing with a visual strategy.
 * Not exported from public API; used by DragManager and other core internals.
 */
export class Transaction {
  private moves: Move[] = [];
  private commands: ICommand[] = [];
  private changes: Change[] = [];

  constructor(
    private container: HTMLElement,
    private easing = 'transform 160ms ease',
  ) {}

  addPreparedMoves(moves: Array<{ block: Block; to: GridPosition; from: GridPosition }>): void {
    for (const m of moves)
      this.moves.push({ block: m.block, from: { ...m.from }, to: { ...m.to } });
  }

  addPreparedChanges(
    changes: Array<{ block: Block; toPos?: GridPosition; toSize?: GridSize }>,
  ): void {
    for (const c of changes) this.changes.push({ ...c });
  }

  clear(): void {
    this.moves = [];
    this.commands = [];
    this.changes = [];
  }

  async commit(visual: 'flip' | 'none' = 'flip'): Promise<void> {
    // If commands queued, plan first and aggregate moves
    if (this.commands.length > 0) {
      const ctx: ICommandContext = { container: this.container };
      const aggregatedMoves: Move[] = [];
      const aggregatedChanges: Change[] = [];
      for (const cmd of this.commands) {
        const plan: IPlanResult = cmd.plan(ctx);
        if (!plan.ok) {
          this.rollback();
          return;
        }
        if (plan.moves) aggregatedMoves.push(...plan.moves);
        if (plan.changes) aggregatedChanges.push(...plan.changes);
      }
      if (aggregatedMoves.length === 0 && aggregatedChanges.length === 0) {
        this.clear();
        return;
      }
      if (visual === 'none') {
        for (const m of aggregatedMoves) m.block.setPosition(m.to);
        for (const ch of aggregatedChanges) {
          if (ch.toPos) ch.block.setPosition(ch.toPos);
          if (ch.toSize) ch.block.setSize(ch.toSize);
        }
      } else {
        if (aggregatedChanges.length > 0) {
          this.commitComplexWithFLIP(aggregatedMoves, aggregatedChanges);
        } else {
          this.commitWithFLIP(aggregatedMoves);
        }
      }
      this.clear();
      return;
    }

    // Legacy path using pending moves
    if (this.moves.length === 0 && this.changes.length === 0) return;
    if (visual === 'none') {
      this.applyDirect();
    } else {
      if (this.changes.length > 0) this.commitComplexWithFLIP(this.moves, this.changes);
      else this.commitWithFLIP(this.moves);
    }
    this.clear();
  }

  rollback(): void {
    // no-op: positions are only applied on commit; pending ops are just cleared
    this.clear();
  }

  private applyDirect(): void {
    for (const { block, to } of this.moves) block.setPosition(to);
    for (const ch of this.changes) {
      if (ch.toPos) ch.block.setPosition(ch.toPos);
      if (ch.toSize) ch.block.setSize(ch.toSize);
    }
  }

  // FLIP based commit: capture first, apply, capture last, invert transform, then play
  private commitWithFLIP(moves: Move[]): void {
    if (moves.length === 0) return;
    const firstRects = new Map<string, DOMRect>();
    for (const { block } of moves) {
      const el = block.getElement();
      el.classList.remove('pegboard-block-dragging');
      firstRects.set(block.getData().id, el.getBoundingClientRect());
    }
    // Apply positions
    for (const { block, to } of moves) block.setPosition(to);

    // Clear transforms and capture last
    const lastRects = new Map<string, DOMRect>();
    for (const { block } of moves) {
      const el = block.getElement();
      el.style.transition = 'none';
      el.style.transform = '';
      lastRects.set(block.getData().id, el.getBoundingClientRect());
    }
    // Invert
    for (const { block } of moves) {
      const id = block.getData().id;
      const el = block.getElement();
      const first = firstRects.get(id)!;
      const last = lastRects.get(id)!;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    // Play
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.container.offsetHeight;
    requestAnimationFrame(() => {
      for (const { block } of moves) {
        const el = block.getElement();
        el.style.transition = this.easing;
        el.style.transform = '';
        setTimeout(() => {
          if (!el.classList.contains('pegboard-block-dragging')) el.style.transition = '';
        }, 220);
      }
    });
  }

  // Complex FLIP supporting both position and size changes. Uses translate and scale.
  private commitComplexWithFLIP(moves: Move[], changes: Change[]): void {
    // Aggregate all affected blocks and their target states
    const map = new Map<string, { block: Block; toPos?: GridPosition; toSize?: GridSize }>();
    for (const m of moves) {
      const id = m.block.getData().id;
      const entry = map.get(id) || { block: m.block };
      entry.toPos = m.to;
      map.set(id, entry);
    }
    for (const c of changes) {
      const id = c.block.getData().id;
      const entry = map.get(id) || { block: c.block };
      if (c.toPos) entry.toPos = c.toPos;
      if (c.toSize) entry.toSize = c.toSize;
      map.set(id, entry);
    }
    if (map.size === 0) return;

    const items = Array.from(map.values());
    const firstRects = new Map<string, DOMRect>();
    for (const { block } of items) {
      const el = block.getElement();
      el.classList.remove('pegboard-block-dragging');
      firstRects.set(block.getData().id, el.getBoundingClientRect());
    }
    // Apply all target states
    for (const { block, toPos, toSize } of items) {
      if (toPos) block.setPosition(toPos);
      if (toSize) block.setSize(toSize);
    }
    // Clear transforms and capture last rects
    const lastRects = new Map<string, DOMRect>();
    for (const { block } of items) {
      const el = block.getElement();
      el.style.transition = 'none';
      el.style.transform = '';
      lastRects.set(block.getData().id, el.getBoundingClientRect());
    }
    // Invert: translate and scale
    for (const { block } of items) {
      const id = block.getData().id;
      const el = block.getElement();
      const first = firstRects.get(id)!;
      const last = lastRects.get(id)!;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = last.width !== 0 ? first.width / last.width : 1;
      const sy = last.height !== 0 ? first.height / last.height : 1;
      el.style.transformOrigin = 'top left';
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    }
    // Play
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.container.offsetHeight;
    requestAnimationFrame(() => {
      for (const { block } of items) {
        const el = block.getElement();
        el.style.transition = this.easing;
        el.style.transform = '';
        setTimeout(() => {
          if (!el.classList.contains('pegboard-block-dragging')) el.style.transition = '';
        }, 220);
      }
    });
  }
}

export function withCommands(container: HTMLElement, easing: string, commands: ICommand[]) {
  const tx = new Transaction(container, easing);
  (tx as any).commands = commands.slice();
  return tx;
}
