import { GridConfig, Position, GridPosition, GridSize } from './types';

export class Grid {
  constructor(private config: GridConfig) {}

  getConfig(): GridConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<GridConfig>): void {
    this.config = { ...this.config, ...config };
  }

  applyGridStyles(container: HTMLElement): void {
    // 컨테이너에 이미 다른 스타일(overflow, minHeight 등)이 적용되어 있을 수 있으므로 지우지 않고 필요한 속성만 설정
    const gridStyles: Partial<CSSStyleDeclaration> = {
      display: 'grid',
      // repeat 사용 + 1fr 기반으로 column 나눔
      gridTemplateColumns: `repeat(${this.config.columns}, 1fr)`,
      gridAutoRows: `${this.config.rowHeight}px`,
      gap: `${this.config.gap}px`,
      gridAutoFlow: 'row dense',
      position: container.style.position || 'relative',
    } as any;

    Object.entries(gridStyles).forEach(([property, value]) => {
      const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      container.style.setProperty(cssProperty, value as string, 'important');
    });
  }

  // viewport 좌표(event.clientX/Y)를 받아 컨테이너 내부 그리드 좌표로 변환하도록 수정
  getGridPositionFromPixels(position: Position, container: HTMLElement): GridPosition {
    const rect = container.getBoundingClientRect();
    const containerStyles = getComputedStyle(container);

    const paddingLeft = parseInt(containerStyles.paddingLeft) || 0;
    const paddingTop = parseInt(containerStyles.paddingTop) || 0;

    const innerWidth = rect.width - paddingLeft - (parseInt(containerStyles.paddingRight) || 0);
    const columnWidth =
      (innerWidth - this.config.gap * (this.config.columns - 1)) / this.config.columns;
    const effectiveRowHeight = this.config.rowHeight + this.config.gap;

    const relativeX = position.x - rect.left - paddingLeft;
    const relativeY = position.y - rect.top - paddingTop;

    const column = Math.max(
      1,
      Math.min(this.config.columns, Math.round(relativeX / (columnWidth + this.config.gap)) + 1),
    );
    const row = Math.max(1, Math.round(relativeY / effectiveRowHeight) + 1);

    return { column, row, zIndex: 1 };
  }

  getPixelsFromGridPosition(gridPosition: GridPosition, container: HTMLElement): Position {
    const rect = container.getBoundingClientRect();
    const containerStyles = getComputedStyle(container);

    const paddingLeft = parseInt(containerStyles.paddingLeft) || 0;
    const paddingTop = parseInt(containerStyles.paddingTop) || 0;

    const innerWidth = rect.width - paddingLeft - (parseInt(containerStyles.paddingRight) || 0);
    const columnWidth =
      (innerWidth - this.config.gap * (this.config.columns - 1)) / this.config.columns;
    const effectiveRowHeight = this.config.rowHeight + this.config.gap;

    const x = rect.left + paddingLeft + (gridPosition.column - 1) * (columnWidth + this.config.gap);
    const y = rect.top + paddingTop + (gridPosition.row - 1) * effectiveRowHeight;

    return { x, y };
  }

  snapToGrid(position: Position, container: HTMLElement): GridPosition {
    return this.getGridPositionFromPixels(position, container);
  }

  isValidGridPosition(gridPosition: GridPosition, gridSize: GridSize): boolean {
    return (
      gridPosition.column >= 1 &&
      gridPosition.row >= 1 &&
      gridPosition.column + gridSize.columnSpan - 1 <= this.config.columns &&
      gridPosition.row >= 1
    );
  }

  getGridSizeFromPixels(size: { width: number; height: number }, container: HTMLElement): GridSize {
    const rect = container.getBoundingClientRect();
    const containerStyles = getComputedStyle(container);

    const paddingLeft = parseInt(containerStyles.paddingLeft) || 0;
    const paddingRight = parseInt(containerStyles.paddingRight) || 0;
    const innerWidth = rect.width - paddingLeft - paddingRight;
    const columnWidth =
      (innerWidth - this.config.gap * (this.config.columns - 1)) / this.config.columns;
    const effectiveRowHeight = this.config.rowHeight + this.config.gap;

    const columnSpan = Math.max(
      1,
      Math.min(this.config.columns, Math.round(size.width / (columnWidth + this.config.gap))),
    );
    const rowSpan = Math.max(1, Math.round(size.height / effectiveRowHeight));

    return { columnSpan, rowSpan };
  }

  checkGridCollision(
    newPosition: GridPosition,
    newSize: GridSize,
    excludeBlockId: string,
    existingBlocks: {
      id: string;
      gridPosition: GridPosition;
      gridSize: GridSize;
    }[],
  ): boolean {
    const newEndColumn = newPosition.column + newSize.columnSpan - 1;
    const newEndRow = newPosition.row + newSize.rowSpan - 1;

    for (const block of existingBlocks) {
      if (block.id === excludeBlockId) continue;

      const existingEndColumn = block.gridPosition.column + block.gridSize.columnSpan - 1;
      const existingEndRow = block.gridPosition.row + block.gridSize.rowSpan - 1;

      const horizontalOverlap = !(
        newPosition.column > existingEndColumn || newEndColumn < block.gridPosition.column
      );
      const verticalOverlap = !(
        newPosition.row > existingEndRow || newEndRow < block.gridPosition.row
      );

      if (horizontalOverlap && verticalOverlap) {
        return true;
      }
    }

    return false;
  }

  findAvailablePosition(
    gridSize: GridSize,
    existingBlocks: {
      id: string;
      gridPosition: GridPosition;
      gridSize: GridSize;
    }[],
  ): GridPosition {
    for (let row = 1; row <= 100; row++) {
      for (let column = 1; column <= this.config.columns - gridSize.columnSpan + 1; column++) {
        const position: GridPosition = { column, row, zIndex: 1 };

        if (!this.checkGridCollision(position, gridSize, '', existingBlocks)) {
          return position;
        }
      }
    }

    return { column: 1, row: 1, zIndex: 1 };
  }

  renderGridLines(container: HTMLElement): void {
    const existingOverlay = container.querySelector('.pegboard-grid-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    if (getComputedStyle(container).display !== 'grid') {
      this.applyGridStyles(container);
    }

    const overlay = document.createElement('div');
    overlay.className = 'pegboard-grid-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 0;
      display: grid;
      grid-template-columns: repeat(${this.config.columns}, 1fr);
      grid-auto-rows: ${this.config.rowHeight}px;
      gap: ${this.config.gap}px;
    `;

    const totalCells = this.config.columns * 20;
    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.style.cssText = `
        border: 1px dashed rgba(0, 0, 0, 0.1);
        box-sizing: border-box;
      `;
      overlay.appendChild(cell);
    }

    container.appendChild(overlay);
  }

  hideGridLines(container: HTMLElement): void {
    const overlay = container.querySelector('.pegboard-grid-overlay');
    if (overlay) {
      overlay.remove();
    }
  }
}
