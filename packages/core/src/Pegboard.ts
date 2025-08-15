import * as CoreTypes from './types';
import { BlockExtension, AnyBlockExtension } from './BlockExtension';
import { Block } from './Block';
import { Grid } from './Grid';
import { DragManager } from './DragManager';
import { EventEmitter } from './EventEmitter';
import { generateId, deepClone } from './utils';

export class Pegboard extends EventEmitter {
  private container: HTMLElement;
  private grid: Grid;
  private dragManager!: DragManager;
  private blocks: Map<string, Block> = new Map();
  private plugins: Map<string, AnyBlockExtension> = new Map();
  private editable: boolean = true;
  private nextZIndex: number = 1;
  private allowOverlap: boolean;
  private autoArrange: boolean;
  private arrangeAnimationMs: number;
  private arrangePreview: CoreTypes.ArrangePreviewStrategy = 'none';
  private livePreviewPositions: Map<string, CoreTypes.GridPosition> | null = null;
  private dragReflow: CoreTypes.DragReflowStrategy = 'none';
  private lassoSelection: boolean = false;

  constructor(config: CoreTypes.PegboardConfig) {
    super();

    this.container = config.container;
    this.grid = new Grid(config.grid);
    // this.editable = config.editable ?? true;
    this.allowOverlap = !!config.allowOverlap;
    this.autoArrange = !!config.autoArrange;
    this.arrangeAnimationMs = config.arrangeAnimationMs ?? 220;
    this.arrangePreview = config.arrangePreview ?? 'none';
    this.dragReflow = config.dragReflow ?? 'none';
    this.lassoSelection = !!config.lassoSelection; // 기본 false

    this.setupContainer();
    this.setupDragManager();
    this.setEditable(config.editable ?? true);
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
      () => this.dragReflow,
      () => this.lassoSelection,
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
      if (ad.position.y !== bd.position.y) {
        return ad.position.y - bd.position.y;
      }
      if (ad.position.x !== bd.position.x) {
        return ad.position.x - bd.position.x;
      }
      return 0;
    });

    // 순서대로 격자에 빈칸 없이 채우기
    const placed: {
      id: string;
      position: CoreTypes.GridPosition;
      size: CoreTypes.GridSize;
    }[] = [];
    const targetPositions = new Map<string, CoreTypes.GridPosition>();
    for (const b of ordered) {
      const d = b.getData();
      const pos = this.grid.findAvailablePosition(d.size, placed);
      const finalPos: CoreTypes.GridPosition = {
        x: pos.x,
        y: pos.y,
        zIndex: d.position.zIndex,
      };
      targetPositions.set(d.id, finalPos);
      placed.push({ id: d.id, position: finalPos, size: d.size });
    }

    // 애니메이션 적용(FLIP)
    const duration = this.arrangeAnimationMs;
    ordered.forEach((b) => {
      const d = b.getData();
      const to = targetPositions.get(d.id)!;
      if (to.x === d.position.x && to.y === d.position.y) return;
      this.flipMove(b, to, duration);
    });
  }

  private flipMove(block: Block, to: CoreTypes.GridPosition, duration: number) {
    const el = block.getElement();
    const first = el.getBoundingClientRect();
    // 최종 상태 적용
    block.setPosition(to);
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

  // 요청 위치 주변에서 가장 가까운 유효한 위치 탐색(없으면 null)
  private findNearestAvailablePosition(
    start: CoreTypes.GridPosition,
    size: CoreTypes.GridSize,
    existingBlocks: { id: string; position: CoreTypes.GridPosition; size: CoreTypes.GridSize }[],
  ): CoreTypes.GridPosition | null {
    const cfg = this.grid.getConfig();
    const maxRows = cfg.rows && cfg.rows > 0 ? cfg.rows : 100;

    const isFree = (pos: CoreTypes.GridPosition) => {
      return (
        this.grid.isValidGridPosition(pos, size) &&
        !this.grid.checkGridCollision(pos, size, '', existingBlocks)
      );
    };

    // r=0은 시작점
    if (isFree(start)) return { x: start.x, y: start.y, zIndex: 1 };

    const maxRadius = (cfg.columns + (maxRows as number)) * 2; // 충분히 큰 탐색 반경
    for (let r = 1; r <= maxRadius; r++) {
      // 상하 라인 스캔
      for (let dx = -r; dx <= r; dx++) {
        const top: CoreTypes.GridPosition = { x: start.x + dx, y: start.y - r, zIndex: 1 };
        const bottom: CoreTypes.GridPosition = { x: start.x + dx, y: start.y + r, zIndex: 1 };
        if (isFree(top)) return top;
        if (isFree(bottom)) return bottom;
      }
      // 좌우 라인 스캔 (코너 중복 제외 위해 dy는 -r+1..r-1)
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        const left: CoreTypes.GridPosition = { x: start.x - r, y: start.y + dy, zIndex: 1 };
        const right: CoreTypes.GridPosition = { x: start.x + r, y: start.y + dy, zIndex: 1 };
        if (isFree(left)) return left;
        if (isFree(right)) return right;
      }
    }
    return null;
  }

  addBlock(data: Partial<CoreTypes.BlockData>): string {
    const plugin = this.plugins.get(data.type || 'default');
    if (!plugin && data.type && data.type !== 'default') {
      throw new Error(`Plugin not found for block type: ${data.type}`);
    }

    // plugin.defaultLayout(x,y,width,height) -> gridPosition + gridSize 변환
    const layout = plugin?.defaultLayout;
    const defaultSize = layout
      ? { width: layout.width, height: layout.height }
      : { width: 2, height: 2 };

    const existingBlocks = Array.from(this.blocks.values()).map((b) => b.getData());

    const initialSize = data.size || defaultSize;
    // defaultLayout 제약에 맞게 초기 size clamp
    let clampedSize = { ...initialSize };
    if (layout) {
      const clamp = (val: number, min?: number, max?: number) => {
        if (min !== undefined) val = Math.max(min, val);
        if (max !== undefined) val = Math.min(max, val);
        return val;
      };
      clampedSize.width = clamp(clampedSize.width, layout.minWidth, layout.maxWidth);
      clampedSize.height = clamp(clampedSize.height, layout.minHeight, layout.maxHeight);
    }

    // 요청된/기본 시작 위치 결정
    const requestedPosition: CoreTypes.GridPosition | null = data.position
      ? { x: data.position.x, y: data.position.y, zIndex: data.position.zIndex ?? this.nextZIndex }
      : layout
        ? { x: layout.x, y: layout.y, zIndex: this.nextZIndex }
        : null;

    let finalPosition: CoreTypes.GridPosition;

    if (requestedPosition) {
      if (this.allowOverlap) {
        // 중첩 허용이면 그대로 배치(경계는 isValidGridPosition으로만 확인)
        if (!this.grid.isValidGridPosition(requestedPosition, clampedSize)) {
          // 요청 위치가 유효하지 않으면 주변 탐색
          const near = this.findNearestAvailablePosition(
            requestedPosition,
            clampedSize,
            existingBlocks,
          );
          if (!near) throw new Error('No available position');
          finalPosition = near;
        } else {
          finalPosition = requestedPosition;
        }
      } else {
        const noCollision =
          this.grid.isValidGridPosition(requestedPosition, clampedSize) &&
          !this.grid.checkGridCollision(requestedPosition, clampedSize, '', existingBlocks);
        if (noCollision) {
          finalPosition = requestedPosition;
        } else {
          const near = this.findNearestAvailablePosition(
            requestedPosition,
            clampedSize,
            existingBlocks,
          );
          if (!near) throw new Error('No available position');
          finalPosition = near;
        }
      }
    } else {
      // 요청 위치가 없으면, layout이 없을 경우 일반적 빈칸 탐색
      const startPos = layout ? { x: layout.x, y: layout.y, zIndex: this.nextZIndex } : null;
      if (startPos) {
        const canUseStart =
          (this.allowOverlap ||
            !this.grid.checkGridCollision(startPos, clampedSize, '', existingBlocks)) &&
          this.grid.isValidGridPosition(startPos, clampedSize);
        if (canUseStart) {
          finalPosition = startPos;
        } else {
          const near = this.findNearestAvailablePosition(startPos, clampedSize, existingBlocks);
          if (!near) throw new Error('No available position');
          finalPosition = near;
        }
      } else {
        const pos = this.grid.findAvailablePosition(clampedSize, existingBlocks);
        finalPosition = { x: pos.x, y: pos.y, zIndex: this.nextZIndex };
      }
    }

    const blockData: CoreTypes.BlockData = {
      id: data.id || generateId(),
      type: data.type || 'default',
      position: {
        x: finalPosition.x,
        y: finalPosition.y,
        zIndex: finalPosition.zIndex ?? this.nextZIndex++,
      },
      size: clampedSize,
      attributes: { ...(plugin?.defaultAttributes || {}), ...(data.attributes || {}) },
      movable: data.movable,
      resizable: data.resizable,
    };

    const block = new Block(blockData);
    block.setEditable(this.editable);

    this.blocks.set(blockData.id, block);
    this.container.appendChild(block.getElement());

    if (plugin) {
      plugin.onCreate?.(blockData as any, block.getContentElement(), this.editable);
      plugin.onBeforeRender?.(blockData as any, block.getContentElement(), this.editable);
      plugin.render(blockData as any, block.getContentElement(), this.editable);
      plugin.onAfterRender?.(blockData as any, block.getContentElement(), this.editable);
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

    if (updates.position) {
      const existingBlocks = Array.from(this.blocks.values())
        .map((b) => b.getData())
        .filter((b) => b.id !== id);

      const noCollision =
        this.allowOverlap ||
        !this.grid.checkGridCollision(updates.position, currentData.size, id, existingBlocks);
      if (noCollision && this.grid.isValidGridPosition(updates.position, currentData.size)) {
        block.setPosition({
          ...updates.position,
          zIndex: updates.position.zIndex ?? currentData.position.zIndex,
        });
      }
    }

    if (updates.size) {
      const existingBlocks = Array.from(this.blocks.values())
        .map((b) => b.getData())
        .filter((b) => b.id !== id);

      const plugin = this.plugins.get(currentData.type);
      const layout = plugin?.defaultLayout;
      let candidateSize = { ...updates.size };
      if (layout) {
        if (layout.minWidth) candidateSize.width = Math.max(layout.minWidth, candidateSize.width);
        if (layout.minHeight)
          candidateSize.height = Math.max(layout.minHeight, candidateSize.height);
        if (layout.maxWidth) candidateSize.width = Math.min(layout.maxWidth, candidateSize.width);
        if (layout.maxHeight)
          candidateSize.height = Math.min(layout.maxHeight, candidateSize.height);
      }

      const noCollision =
        this.allowOverlap ||
        !this.grid.checkGridCollision(currentData.position, candidateSize, id, existingBlocks);
      if (noCollision && this.grid.isValidGridPosition(currentData.position, candidateSize)) {
        block.setSize(candidateSize);
      }
    }

    // movable/resizable 플래그 업데이트
    if (updates.movable !== undefined || updates.resizable !== undefined) {
      block.setInteractionFlags({ movable: updates.movable, resizable: updates.resizable });
      // 에디터 모드인 경우 커서/핸들 UI가 최신 상태가 되도록 재적용
      block.setEditable(this.editable);
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
        plugin.onBeforeRender?.(newData as any, block.getContentElement(), this.editable);
        plugin.render(newData as any, block.getContentElement(), this.editable);
        plugin.onUpdateAttributes?.(newData as any, block.getContentElement(), this.editable);
        plugin.onAfterRender?.(newData as any, block.getContentElement(), this.editable);
      }
    }

    this.emit('block:updated', { block: newData });
    if (updates.position || updates.size) {
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

  selectBlock(id: string | null): void {
    if (!id) {
      this.dragManager.selectBlock(null);
      return;
    }

    const block = this.blocks.get(id);
    if (block && this.editable) {
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
    const newPosition = this.grid.findAvailablePosition(blockData.size, existingBlocks);

    const duplicateData = {
      ...blockData,
      id: generateId(),
      position: {
        ...newPosition,
        zIndex: this.nextZIndex++,
      },
    };

    return this.addBlock(duplicateData);
  }

  setEditable(editable: boolean): void {
    this.editable = editable;

    this.container.classList.toggle('pegboard-editor-mode', this.editable);
    this.container.classList.toggle('pegboard-viewer-mode', !this.editable);

    this.blocks.forEach((block) => {
      block.setEditable(this.editable);
    });

    if (this.editable) {
      this.showGridLines();
    } else {
      this.hideGridLines();
      this.dragManager.selectBlock(null);
    }
  }

  getEditable(): boolean {
    return this.editable;
  }

  setGridConfig(config: Partial<CoreTypes.GridConfig>): void {
    this.grid.updateConfig(config);
    this.grid.applyGridStyles(this.container);

    if (this.editable) {
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
        position: b.position,
        size: b.size,
        attributes: b.attributes,
        movable: b.movable,
        resizable: b.resizable,
      });
    });

    // nextZIndex 재계산: 현재 블록들 중 최대값 + 1
    const maxZ = this.getAllBlocks().reduce((m, d) => Math.max(m, d.position.zIndex), 0);
    (this as any).nextZIndex = Math.max(this.nextZIndex, maxZ + 1);
  }

  clear(): void {
    this.blocks.forEach((_, id) => this.removeBlock(id));
  }

  bringToFront(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    block.setPosition({
      ...blockData.position,
      zIndex: this.nextZIndex++,
    });

    return true;
  }

  sendToBack(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    const minZIndex = Math.min(...this.getAllBlocks().map((b) => b.position.zIndex));

    block.setPosition({
      ...blockData.position,
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
      !this.grid.checkGridCollision(gridPosition, blockData.size, id, existingBlocks);
    if (noCollision && this.grid.isValidGridPosition(gridPosition, blockData.size)) {
      block.setPosition(gridPosition);
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
      if (layout.minWidth) candidateSize.width = Math.max(layout.minWidth, candidateSize.width);
      if (layout.minHeight) candidateSize.height = Math.max(layout.minHeight, candidateSize.height);
      if (layout.maxWidth) candidateSize.width = Math.min(layout.maxWidth, candidateSize.width);
      if (layout.maxHeight) candidateSize.height = Math.min(layout.maxHeight, candidateSize.height);
    }

    const noCollision =
      this.allowOverlap ||
      !this.grid.checkGridCollision(blockData.position, candidateSize, id, existingBlocks);
    if (noCollision && this.grid.isValidGridPosition(blockData.position, candidateSize)) {
      block.setSize(candidateSize);
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

  setDragReflow(strategy: CoreTypes.DragReflowStrategy) {
    this.dragReflow = strategy;
  }

  getDragReflow() {
    return this.dragReflow;
  }

  setLassoSelection(enabled: boolean) {
    this.lassoSelection = !!enabled;
  }

  getLassoSelection() {
    return this.lassoSelection;
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
