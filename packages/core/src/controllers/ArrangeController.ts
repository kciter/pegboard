import type { Grid } from '../Grid';
import type { GridPosition, GridSize } from '../types';

export type ArrangeStrategy = 'top-left' | 'masonry' | 'by-row' | 'by-column';

export class ArrangeController {
  constructor(private grid: Grid) {}

  autoArrangeEnabled = false;
  strategy: ArrangeStrategy = 'top-left';
  animateMs = 160;

  setConfig(enabled: boolean, strategy: ArrangeStrategy, animateMs: number) {
    this.autoArrangeEnabled = enabled;
    this.strategy = strategy;
    this.animateMs = animateMs;
  }

  // placeholder; real strategies already live elsewhere
  run(_blocks: Array<{ id: string; position: GridPosition; size: GridSize }>): void {
    // no-op here; integrate with existing strategy code incrementally
  }
}
