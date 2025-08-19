import type { Grid } from '../Grid';
import type { GridPosition, GridSize } from '../types';

export class LayoutController {
  constructor(private grid: Grid) {}

  isValid(pos: GridPosition, size: GridSize): boolean {
    return this.grid.isValidGridPosition(pos, size);
  }
  collides(
    pos: GridPosition,
    size: GridSize,
    selfId: string,
    existing: Array<{ id: string; position: GridPosition; size: GridSize }>,
  ) {
    return this.grid.checkGridCollision(pos, size, selfId, existing);
  }
  applyGridStyles(container: HTMLElement): void {
    this.grid.applyGridStyles(container);
  }
  getConfig() {
    return this.grid.getConfig();
  }
  updateConfig(cfg: Partial<ReturnType<Grid['getConfig']>>): void {
    this.grid.updateConfig(cfg as any);
  }
}
