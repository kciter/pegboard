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

    // rows 가 설정되면 컨테이너 높이를 고정
    if (this.config.rows && this.config.rows > 0) {
      const totalHeight =
        this.config.rows * this.config.rowHeight + this.config.gap * (this.config.rows - 1);
      (gridStyles as any).height = `${totalHeight}px`;
      // 내부 스크롤이 필요하면 overflow 설정(기본 hidden 유지)
      (gridStyles as any).overflow = container.style.overflow || 'hidden';
    }

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

    const x = Math.max(
      1,
      Math.min(this.config.columns, Math.round(relativeX / (columnWidth + this.config.gap)) + 1),
    );
    const y = Math.max(1, Math.round(relativeY / effectiveRowHeight) + 1);

    return { x, y, zIndex: 1 };
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

    const x = rect.left + paddingLeft + (gridPosition.x - 1) * (columnWidth + this.config.gap);
    const y = rect.top + paddingTop + (gridPosition.y - 1) * effectiveRowHeight;

    return { x, y };
  }

  snapToGrid(position: Position, container: HTMLElement): GridPosition {
    return this.getGridPositionFromPixels(position, container);
  }

  isValidGridPosition(position: GridPosition, size: GridSize): boolean {
    const withinColumns =
      position.x >= 1 && position.x + size.width - 1 <= this.config.columns;
    const hasRowCap = !!this.config.rows && this.config.rows > 0;
    const withinRows = hasRowCap
      ? position.y >= 1 && position.y + size.height - 1 <= (this.config.rows as number)
      : position.y >= 1; // rows 미지정 시 하한만 체크
    return withinColumns && withinRows;
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

    const width = Math.max(
      1,
      Math.min(this.config.columns, Math.round(size.width / (columnWidth + this.config.gap))),
    );
    const height = Math.max(1, Math.round(size.height / effectiveRowHeight));

    return { width, height };
  }

  checkGridCollision(
    newPosition: GridPosition,
    newSize: GridSize,
    excludeBlockId: string,
    existingBlocks: {
      id: string;
      position: GridPosition;
      size: GridSize;
    }[],
  ): boolean {
    const newEndX = newPosition.x + newSize.width - 1;
    const newEndY = newPosition.y + newSize.height - 1;

    for (const block of existingBlocks) {
      if (block.id === excludeBlockId) continue;

      const existingEndX = block.position.x + block.size.width - 1;
      const existingEndY = block.position.y + block.size.height - 1;

      const horizontalOverlap = !(newPosition.x > existingEndX || newEndX < block.position.x);
      const verticalOverlap = !(newPosition.y > existingEndY || newEndY < block.position.y);

      if (horizontalOverlap && verticalOverlap) {
        return true;
      }
    }

    return false;
  }

  findAvailablePosition(
    size: GridSize,
    existingBlocks: {
      id: string;
      position: GridPosition;
      size: GridSize;
    }[],
  ): GridPosition {
    const maxRows = this.config.rows && this.config.rows > 0 ? this.config.rows : 100;
    for (let row = 1; row <= (maxRows as number); row++) {
      for (let column = 1; column <= this.config.columns - size.width + 1; column++) {
        const position: GridPosition = { x: column, y: row, zIndex: 1 };

        if (
          (!this.config.rows || row + size.height - 1 <= (this.config.rows as number)) &&
          !this.checkGridCollision(position, size, '', existingBlocks)
        ) {
          return position;
        }
      }
    }

    return { x: 1, y: 1, zIndex: 1 };
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
