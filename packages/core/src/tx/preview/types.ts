import type { GridPosition, GridSize } from '../../types';

export interface IPreviewStrategy {
  showHint(pos: GridPosition, size: GridSize, valid: boolean): void;
  clearHint(): void;
}
