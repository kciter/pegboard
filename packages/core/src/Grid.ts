import { GridConfig, Position, GridPosition, GridSize } from './types';

export class Grid {
  constructor(private config: GridConfig) {}

  private unboundedRows = false;

  setUnboundedRows(enabled: boolean) {
    this.unboundedRows = !!enabled;
  }

  getConfig(): GridConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<GridConfig>): void {
    this.config = { ...this.config, ...config };
  }

  applyGridStyles(container: HTMLElement): void {
    // 레이아웃 관련 속성은 inline style로 직접 적용
    const gridStyles: Partial<CSSStyleDeclaration> = {
      display: 'grid',
      gridTemplateColumns: `repeat(${this.config.columns}, 1fr)`,
      gridAutoRows: `${this.config.rowHeight}px`,
      gap: `${this.config.gap}px`,
      gridAutoFlow: 'row dense',
    } as any;

    // rows가 설정되면 컨테이너 높이를 고정하거나(min-height) 최소 높이로 유지
    if (this.config.rows && this.config.rows > 0 && !this.unboundedRows) {
      const totalHeight =
        this.config.rows * this.config.rowHeight + this.config.gap * (this.config.rows - 1);
      (gridStyles as any).height = `${totalHeight}px`;
      (gridStyles as any)['minHeight'] = '' as any; // 고정 높이일 때는 min-height 해제
      // 에디터 모드에서는 리사이즈 핸들이 잘리지 않도록 overflow를 visible로 설정,
      // 뷰어 모드에서는 레이아웃 누수 방지를 위해 hidden 유지
      const inEditor = container.classList.contains('pegboard-editor-mode');
      (gridStyles as any).overflow = inEditor ? 'visible' : 'hidden';
    } else {
      // 동적 높이(unboundedRows 포함): rows 값이 있으면 최소 높이로 유지
      (gridStyles as any).height = '' as any;
      if (this.config.rows && this.config.rows > 0) {
        const minTotalHeight =
          this.config.rows * this.config.rowHeight + this.config.gap * (this.config.rows - 1);
        (gridStyles as any)['minHeight'] = `${minTotalHeight}px`;
      } else {
        (gridStyles as any)['minHeight'] = '' as any;
      }
      (gridStyles as any).overflow = '';
    }

    Object.entries(gridStyles).forEach(([property, value]) => {
      const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      if (value !== undefined)
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
    const withinColumns = position.x >= 1 && position.x + size.width - 1 <= this.config.columns;
    const hasRowCap = !!this.config.rows && this.config.rows > 0 && !this.unboundedRows;
    const withinRows = hasRowCap
      ? position.y >= 1 && position.y + size.height - 1 <= (this.config.rows as number)
      : position.y >= 1; // rows 미지정 시 하한만 체크(또는 unboundedRows=true)
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
    const capped = !!this.config.rows && this.config.rows > 0 && !this.unboundedRows;
    const searchMaxRows = capped ? (this.config.rows as number) : 1000; // 넉넉히 검색
    for (let row = 1; row <= searchMaxRows; row++) {
      for (let column = 1; column <= this.config.columns - size.width + 1; column++) {
        const position: GridPosition = { x: column, y: row, zIndex: 1 };

        const withinRowBound = !capped || row + size.height - 1 <= (this.config.rows as number);
        if (withinRowBound && !this.checkGridCollision(position, size, '', existingBlocks)) {
          return position;
        }
      }
    }

    return { x: 1, y: 1, zIndex: 1 };
  }

  renderGridLines(container: HTMLElement): void {
    const existingOverlay = container.querySelector('.pegboard-grid-overlay');
    if (existingOverlay) existingOverlay.remove();

    if (getComputedStyle(container).display !== 'grid') {
      this.applyGridStyles(container);
    }

    const overlay = document.createElement('div');
    overlay.className = 'pegboard-grid-overlay';
    // 레이아웃은 inline style로 적용 (색/보더는 CSS에서)
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.pointerEvents = 'none';
    // Overlay must stay visually behind all blocks
    overlay.style.zIndex = '-1';
    overlay.style.display = 'grid';
    overlay.style.gridTemplateColumns = `repeat(${this.config.columns}, 1fr)`;
    overlay.style.gridAutoRows = `${this.config.rowHeight}px`;
    overlay.style.gap = `${this.config.gap}px`;

    // 렌더할 행 수 계산: rows가 지정되면 그만큼만, 아니면 컨테이너 높이에 맞춰 계산
    let rowsToRender = 20;
    if (this.config.rows && this.config.rows > 0) {
      rowsToRender = this.config.rows;
    } else {
      const rect = container.getBoundingClientRect();
      const styles = getComputedStyle(container);
      const paddingTop = parseInt(styles.paddingTop) || 0;
      const paddingBottom = parseInt(styles.paddingBottom) || 0;
      const innerHeight = Math.max(0, rect.height - paddingTop - paddingBottom);
      const unit = this.config.rowHeight + this.config.gap;
      if (unit > 0) {
        rowsToRender = Math.max(1, Math.floor((innerHeight + this.config.gap) / unit));
      }
    }

    const totalCells = this.config.columns * rowsToRender;
    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'pegboard-grid-cell';
      overlay.appendChild(cell);
    }

    // Place overlay at the very bottom of the container's children for paint order stability
    container.insertBefore(overlay, container.firstChild);
  }

  hideGridLines(container: HTMLElement): void {
    const overlay = container.querySelector('.pegboard-grid-overlay');
    if (overlay) {
      overlay.remove();
    }
  }
}
