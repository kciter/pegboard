import * as CoreTypes from './types';
import { BlockExtension, AnyBlockExtension } from './BlockExtension';
import { Block } from './Block';
import { Grid } from './Grid';
import { DragManager } from './DragManager';
import { EventEmitter } from './EventEmitter';
import { generateId, createElement, deepClone } from './utils';

export class Pegboard extends EventEmitter {
  private container: HTMLElement;
  private grid: Grid;
  private dragManager!: DragManager;
  private blocks: Map<string, Block> = new Map();
  private plugins: Map<string, AnyBlockExtension> = new Map();
  private mode: 'editor' | 'viewer';
  private nextZIndex: number = 1;
  private allowOverlap: boolean;
  private autoArrange: boolean;
  private arrangeAnimationMs: number;

  constructor(config: CoreTypes.PegboardConfig) {
    super();

    this.container = config.container;
    this.grid = new Grid(config.grid);
    this.mode = config.mode;
    this.allowOverlap = !!config.allowOverlap;
    this.autoArrange = !!config.autoArrange;
    this.arrangeAnimationMs = config.arrangeAnimationMs ?? 220;

    this.setupContainer();
    this.setupDragManager();
    this.updateMode();
  }

  private setupContainer(): void {
    // 기존 스타일은 유지하면서 필요한 속성만 추가
    if (!this.container.classList.contains('pegboard-container')) {
      this.container.classList.add('pegboard-container');
    }
    if (!this.container.style.minHeight) {
      this.container.style.minHeight = '400px';
    }
    if (!this.container.style.position) {
      this.container.style.position = 'relative';
    }

    this.grid.applyGridStyles(this.container);
  }

  private setupDragManager(): void {
    this.dragManager = new DragManager(
      this.container,
      this.grid,
      (id: string) => this.blocks.get(id),
      () => Array.from(this.blocks.values()),
      () => this.allowOverlap,
      (type: string) => this.plugins.get(type),
    );

    this.dragManager.on('block:moved', ({ block, oldPosition }) => {
      this.emit('block:moved', { block, oldPosition });
      // 드롭 후 자동 정렬
      this.autoArrangeIfNeeded();
    });

    this.dragManager.on('block:resized', ({ block, oldSize }) => {
      this.emit('block:resized', { block, oldSize });
    });
    this.dragManager.on('block:selected', ({ block }) => {
      this.emit('block:selected', { block });
    });
    this.dragManager.on('selection:changed', ({ ids }) => {
      this.emit('selection:changed', { ids });
    });
  }

  private autoArrangeIfNeeded(): void {
    if (!this.autoArrange) return;
    const blocks = Array.from(this.blocks.values());
    if (blocks.length <= 1) return;

    // 현재 위치 기준 정렬(위->아래, 좌->우)
    const ordered = blocks.slice().sort((a, b) => {
      const ad = a.getData();
      const bd = b.getData();
      if (ad.gridPosition.row !== bd.gridPosition.row) {
        return ad.gridPosition.row - bd.gridPosition.row;
      }
      if (ad.gridPosition.column !== bd.gridPosition.column) {
        return ad.gridPosition.column - bd.gridPosition.column;
      }
      return 0;
    });

    // 순서대로 격자에 빈칸 없이 채우기
    const placed: {
      id: string;
      gridPosition: CoreTypes.GridPosition;
      gridSize: CoreTypes.GridSize;
    }[] = [];
    const targetPositions = new Map<string, CoreTypes.GridPosition>();
    for (const b of ordered) {
      const d = b.getData();
      const pos = this.grid.findAvailablePosition(d.gridSize, placed);
      const finalPos: CoreTypes.GridPosition = {
        column: pos.column,
        row: pos.row,
        zIndex: d.gridPosition.zIndex,
      };
      targetPositions.set(d.id, finalPos);
      placed.push({ id: d.id, gridPosition: finalPos, gridSize: d.gridSize });
    }

    // 애니메이션 적용(FLIP)
    const duration = this.arrangeAnimationMs;
    ordered.forEach((b) => {
      const d = b.getData();
      const to = targetPositions.get(d.id)!;
      if (to.column === d.gridPosition.column && to.row === d.gridPosition.row) return;
      this.flipMove(b, to, duration);
    });
  }

  private flipMove(block: Block, to: CoreTypes.GridPosition, duration: number) {
    const el = block.getElement();
    const first = el.getBoundingClientRect();
    // 최종 상태 적용
    block.setGridPosition(to);
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    // 역변환 적용
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    // 리플로우 강제
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (el as any).offsetWidth;
    el.style.transition = `transform ${duration}ms ease`;
    el.style.transform = 'translate(0px, 0px)';
    const cleanup = () => {
      el.style.transition = '';
      el.style.transform = '';
      el.removeEventListener('transitionend', cleanup);
    };
    el.addEventListener('transitionend', cleanup);
  }

  private updateMode(): void {
    this.container.classList.toggle('pegboard-editor-mode', this.mode === 'editor');
    this.container.classList.toggle('pegboard-viewer-mode', this.mode === 'viewer');

    this.blocks.forEach((block) => {
      block.setEditorMode(this.mode === 'editor');
    });

    if (this.mode === 'editor') {
      this.showGridLines();
    } else {
      this.hideGridLines();
      this.dragManager.selectBlock(null);
    }

    this.emit('mode:changed', { mode: this.mode });
  }

  private showGridLines(): void {
    this.grid.renderGridLines(this.container);
  }

  private hideGridLines(): void {
    this.grid.hideGridLines(this.container);
  }

  registerPlugin(plugin: AnyBlockExtension): void {
    this.plugins.set(plugin.type, plugin);
  }

  unregisterPlugin(type: string): void {
    this.plugins.delete(type);
  }

  setAutoArrange(allow: boolean) {
    const prev = this.autoArrange;
    this.autoArrange = !!allow;
    if (!prev && this.autoArrange) {
      // 켜는 즉시 현재 블럭들 정렬
      this.autoArrangeIfNeeded();
    }
  }

  getAutoArrange() {
    return this.autoArrange;
  }

  setArrangeAnimationMs(ms: number) {
    this.arrangeAnimationMs = Math.max(0, ms | 0);
  }

  addBlock(data: Partial<CoreTypes.BlockData>): string {
    const plugin = this.plugins.get(data.type || 'default');
    if (!plugin && data.type && data.type !== 'default') {
      throw new Error(`Plugin not found for block type: ${data.type}`);
    }

    // plugin.defaultLayout(x,y,width,height) -> gridPosition + gridSize 변환
    const layout = plugin?.defaultLayout;
    const defaultGridSize = layout
      ? { columnSpan: layout.width, rowSpan: layout.height }
      : { columnSpan: 2, rowSpan: 2 };

    const existingBlocks = Array.from(this.blocks.values()).map((b) => b.getData());

    const initialGridSize = data.gridSize || defaultGridSize;
    // defaultLayout 제약에 맞게 초기 size clamp
    let clampedGridSize = { ...initialGridSize };
    if (layout) {
      const clamp = (val: number, min?: number, max?: number) => {
        if (min !== undefined) val = Math.max(min, val);
        if (max !== undefined) val = Math.min(max, val);
        return val;
      };
      clampedGridSize.columnSpan = clamp(
        clampedGridSize.columnSpan,
        layout.minWidth,
        layout.maxWidth,
      );
      clampedGridSize.rowSpan = clamp(clampedGridSize.rowSpan, layout.minHeight, layout.maxHeight);
    }
    const gridPosition =
      data.gridPosition ||
      (layout
        ? { column: layout.x, row: layout.y, zIndex: this.nextZIndex }
        : this.grid.findAvailablePosition(clampedGridSize, existingBlocks));

    const blockData: CoreTypes.BlockData = {
      id: data.id || generateId(),
      type: data.type || 'default',
      gridPosition: {
        column: gridPosition.column,
        row: gridPosition.row,
        zIndex: gridPosition.zIndex ?? this.nextZIndex++,
      },
      gridSize: clampedGridSize,
      attributes: { ...(plugin?.defaultAttributes || {}), ...(data.attributes || {}) },
      groupId: data.groupId,
      movable: data.movable,
      resizable: data.resizable,
    };

    const block = new Block(blockData);
    block.setEditorMode(this.mode === 'editor');

    this.blocks.set(blockData.id, block);
    this.container.appendChild(block.getElement());

    if (plugin) {
      plugin.onCreate?.(blockData as any, block.getContentElement(), this.mode === 'editor');
      plugin.onBeforeRender?.(blockData as any, block.getContentElement(), this.mode === 'editor');
      plugin.render(blockData as any, block.getContentElement(), this.mode === 'editor');
      plugin.onAfterRender?.(blockData as any, block.getContentElement(), this.mode === 'editor');
    }

    this.emit('block:added', { block: blockData });
    // 자동 정렬 모드에서는 블록 추가 시에도 패킹
    this.autoArrangeIfNeeded();
    return blockData.id;
  }

  removeBlock(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    if (this.dragManager.getSelectedBlock() === block) {
      this.dragManager.selectBlock(null);
    }

    const plugin = this.plugins.get(block.getData().type);
    if (plugin) {
      plugin.onDestroy?.(block.getData() as any);
    }

    block.destroy();
    this.blocks.delete(id);

    this.emit('block:removed', { blockId: id });
    this.autoArrangeIfNeeded();
    return true;
  }

  updateBlock(id: string, updates: Partial<CoreTypes.BlockData>): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const currentData = block.getData();
    const newData = { ...currentData, ...updates } as CoreTypes.BlockData;

    if (updates.gridPosition) {
      const existingBlocks = Array.from(this.blocks.values())
        .map((b) => b.getData())
        .filter((b) => b.id !== id);

      const noCollision =
        this.allowOverlap ||
        !this.grid.checkGridCollision(
          updates.gridPosition,
          currentData.gridSize,
          id,
          existingBlocks,
        );
      if (
        noCollision &&
        this.grid.isValidGridPosition(updates.gridPosition, currentData.gridSize)
      ) {
        block.setGridPosition({
          ...updates.gridPosition,
          zIndex: updates.gridPosition.zIndex ?? currentData.gridPosition.zIndex,
        });
      }
    }

    if (updates.gridSize) {
      const existingBlocks = Array.from(this.blocks.values())
        .map((b) => b.getData())
        .filter((b) => b.id !== id);

      const plugin = this.plugins.get(currentData.type);
      const layout = plugin?.defaultLayout;
      let candidateSize = { ...updates.gridSize };
      if (layout) {
        if (layout.minWidth)
          candidateSize.columnSpan = Math.max(layout.minWidth, candidateSize.columnSpan);
        if (layout.minHeight)
          candidateSize.rowSpan = Math.max(layout.minHeight, candidateSize.rowSpan);
        if (layout.maxWidth)
          candidateSize.columnSpan = Math.min(layout.maxWidth, candidateSize.columnSpan);
        if (layout.maxHeight)
          candidateSize.rowSpan = Math.min(layout.maxHeight, candidateSize.rowSpan);
      }

      const noCollision =
        this.allowOverlap ||
        !this.grid.checkGridCollision(currentData.gridPosition, candidateSize, id, existingBlocks);
      if (noCollision && this.grid.isValidGridPosition(currentData.gridPosition, candidateSize)) {
        block.setGridSize(candidateSize);
      }
    }

    // movable/resizable 플래그 업데이트
    if (updates.movable !== undefined || updates.resizable !== undefined) {
      block.setInteractionFlags({ movable: updates.movable, resizable: updates.resizable });
      // 에디터 모드인 경우 커서/핸들 UI가 최신 상태가 되도록 재적용
      block.setEditorMode(this.mode === 'editor');
      // 현재 선택 중이면 핸들을 재생성하기 위해 재선택 처리
      const selected = this.dragManager.getSelectedBlock();
      if (selected && selected.getData().id === id) {
        this.dragManager.selectBlock(block);
      }
    }

    if (updates.attributes) {
      block.setAttributes(updates.attributes);

      const plugin = this.plugins.get(currentData.type);
      if (plugin) {
        plugin.onBeforeRender?.(newData as any, block.getContentElement(), this.mode === 'editor');
        plugin.render(newData as any, block.getContentElement(), this.mode === 'editor');
        plugin.onUpdateAttributes?.(
          newData as any,
          block.getContentElement(),
          this.mode === 'editor',
        );
        plugin.onAfterRender?.(newData as any, block.getContentElement(), this.mode === 'editor');
      }
    }

    this.emit('block:updated', { block: newData });
    if (updates.gridPosition || updates.gridSize) {
      this.autoArrangeIfNeeded();
    }
    return true;
  }

  getBlock(id: string): CoreTypes.BlockData | null {
    const block = this.blocks.get(id);
    return block ? deepClone(block.getData()) : null;
  }

  getAllBlocks(): CoreTypes.BlockData[] {
    return Array.from(this.blocks.values()).map((block) => deepClone(block.getData()));
  }

  getBlocksByGroup(groupId: string): CoreTypes.BlockData[] {
    return this.getAllBlocks().filter((block) => block.groupId === groupId);
  }

  selectBlock(id: string | null): void {
    if (!id) {
      this.dragManager.selectBlock(null);
      return;
    }

    const block = this.blocks.get(id);
    if (block && this.mode === 'editor') {
      this.dragManager.selectBlock(block);
    }
  }

  getSelectedBlockId(): string | null {
    const selectedBlock = this.dragManager.getSelectedBlock();
    return selectedBlock ? selectedBlock.getData().id : null;
  }

  duplicateBlock(id: string): string | null {
    const blockData = this.getBlock(id);
    if (!blockData) return null;

    const existingBlocks = Array.from(this.blocks.values()).map((b) => b.getData());
    const newGridPosition = this.grid.findAvailablePosition(blockData.gridSize, existingBlocks);

    const duplicateData = {
      ...blockData,
      id: generateId(),
      gridPosition: {
        ...newGridPosition,
        zIndex: this.nextZIndex++,
      },
    };

    return this.addBlock(duplicateData);
  }

  setMode(mode: 'editor' | 'viewer'): void {
    if (this.mode === mode) return;

    this.mode = mode;
    this.updateMode();
  }

  getMode(): 'editor' | 'viewer' {
    return this.mode;
  }

  setGridConfig(config: Partial<CoreTypes.GridConfig>): void {
    this.grid.updateConfig(config);
    this.grid.applyGridStyles(this.container);

    if (this.mode === 'editor') {
      this.showGridLines();
    }

    this.emit('grid:changed', { grid: this.grid.getConfig() });
  }

  getGridConfig(): CoreTypes.GridConfig {
    return this.grid.getConfig();
  }

  exportData(): { blocks: CoreTypes.BlockData[]; grid: CoreTypes.GridConfig } {
    return {
      blocks: this.getAllBlocks(),
      grid: this.getGridConfig(),
    };
  }

  // JSON 직렬화: 버전 포함
  exportJSON(pretty = false): string {
    const data: CoreTypes.SerializedPegboardData = {
      version: 1,
      grid: this.getGridConfig(),
      blocks: this.getAllBlocks(),
    };
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  // JSON 역직렬화: 현재 상태를 지우고 로드
  importJSON(json: string): void {
    let parsed: CoreTypes.SerializedPegboardData;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid JSON');
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid data');
    // 버전 체크(향후 확장 가능)
    const version = (parsed as any).version ?? 1;
    if (version !== 1) {
      // 호환 처리 여지를 남김
      // 현재는 동일 스키마만 허용
    }

    // 현재 상태 초기화
    this.blocks.forEach((_, id) => this.removeBlock(id));

    // 그리드 설정 적용
    if (parsed.grid) this.setGridConfig(parsed.grid);

    // 블록 복원: 입력 데이터의 zIndex를 존중
    const blocks = parsed.blocks || [];
    blocks.forEach((b) => {
      this.addBlock({
        id: b.id,
        type: b.type,
        gridPosition: b.gridPosition,
        gridSize: b.gridSize,
        attributes: b.attributes,
        groupId: b.groupId,
        movable: b.movable,
        resizable: b.resizable,
      });
    });

    // nextZIndex 재계산: 현재 블록들 중 최대값 + 1
    const maxZ = this.getAllBlocks().reduce((m, d) => Math.max(m, d.gridPosition.zIndex), 0);
    (this as any).nextZIndex = Math.max(this.nextZIndex, maxZ + 1);
  }

  clear(): void {
    this.blocks.forEach((_, id) => this.removeBlock(id));
  }

  bringToFront(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    block.setGridPosition({
      ...blockData.gridPosition,
      zIndex: this.nextZIndex++,
    });

    return true;
  }

  sendToBack(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    const minZIndex = Math.min(...this.getAllBlocks().map((b) => b.gridPosition.zIndex));

    block.setGridPosition({
      ...blockData.gridPosition,
      zIndex: Math.max(0, minZIndex - 1),
    });

    return true;
  }

  moveBlockToPosition(id: string, gridPosition: CoreTypes.GridPosition): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    const existingBlocks = Array.from(this.blocks.values())
      .map((b) => b.getData())
      .filter((b) => b.id !== id);
    const noCollision =
      this.allowOverlap ||
      !this.grid.checkGridCollision(gridPosition, blockData.gridSize, id, existingBlocks);
    if (noCollision && this.grid.isValidGridPosition(gridPosition, blockData.gridSize)) {
      block.setGridPosition(gridPosition);
      this.autoArrangeIfNeeded();
      return true;
    }
    return false;
  }

  resizeBlock(id: string, gridSize: CoreTypes.GridSize): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    const existingBlocks = Array.from(this.blocks.values())
      .map((b) => b.getData())
      .filter((b) => b.id !== id);

    const plugin = this.plugins.get(blockData.type);
    const layout = plugin?.defaultLayout;
    let candidateSize = { ...gridSize };
    if (layout) {
      if (layout.minWidth)
        candidateSize.columnSpan = Math.max(layout.minWidth, candidateSize.columnSpan);
      if (layout.minHeight)
        candidateSize.rowSpan = Math.max(layout.minHeight, candidateSize.rowSpan);
      if (layout.maxWidth)
        candidateSize.columnSpan = Math.min(layout.maxWidth, candidateSize.columnSpan);
      if (layout.maxHeight)
        candidateSize.rowSpan = Math.min(layout.maxHeight, candidateSize.rowSpan);
    }

    const noCollision =
      this.allowOverlap ||
      !this.grid.checkGridCollision(blockData.gridPosition, candidateSize, id, existingBlocks);
    if (noCollision && this.grid.isValidGridPosition(blockData.gridPosition, candidateSize)) {
      block.setGridSize(candidateSize);
      this.autoArrangeIfNeeded();
      return true;
    }
    return false;
  }

  setAllowOverlap(allow: boolean) {
    if (this.allowOverlap === allow) return;
    this.allowOverlap = allow;
    this.emit('overlap:changed', { allow });
  }

  getAllowOverlap() {
    return this.allowOverlap;
  }

  destroy(): void {
    this.dragManager.destroy();
    this.blocks.forEach((_, id) => this.removeBlock(id));
    this.hideGridLines();
    this.removeAllListeners();
    this.container.classList.remove(
      'pegboard-container',
      'pegboard-editor-mode',
      'pegboard-viewer-mode',
    );
  }
}
