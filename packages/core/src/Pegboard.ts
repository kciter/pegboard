import * as CoreTypes from './types';
import { BlockExtension } from './BlockExtension';
import { Block } from './Block';
import { Grid } from './Grid';
import { DragManager } from './DragManager';
import { EventEmitter } from './EventEmitter';
import { generateId, deepClone } from './utils';
import { CrossBoardCoordinator } from './CrossBoardCoordinator';

type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export class Pegboard extends EventEmitter {
  private container: HTMLElement;
  private grid: Grid;
  private dragManager!: DragManager;
  private blocks: Map<string, Block> = new Map();
  private extensions: Map<string, BlockExtension<any>> = new Map();
  private editable: boolean = true;
  private nextZIndex: number = 1;
  private allowOverlap: boolean;
  private lassoSelection: boolean = false;
  private keyboardMove: boolean = true;
  private keyboardDelete: boolean = false;
  private autoGrowRows: boolean = false;
  private minRows: number | undefined;
  private editingBlockId: string | null = null;
  private gridOverlayMode: CoreTypes.GridOverlayMode = 'always';
  private isInteractionActive: boolean = false; // move/resize 중 여부
  private dragReflow: CoreTypes.DragReflowStrategy = 'none';
  private autoArrange: boolean = false;
  private autoArrangeStrategy: CoreTypes.AutoArrangeStrategy = 'top-left';
  private arrangeAnimationMs: number = 160;
  private isArranging: boolean = false;
  private dragOut: boolean = false;

  constructor(config: CoreTypes.PegboardConfig) {
    super();

    this.container = config.container;
    this.grid = new Grid(config.grid);
    // this.editable = config.editable ?? true;
    this.allowOverlap = config.allowOverlap ?? false;
    this.lassoSelection = config.lassoSelection ?? false;
    this.keyboardMove = config.keyboardMove ?? false;
    this.keyboardDelete = config.keyboardDelete ?? false;
    this.autoGrowRows = config.autoGrowRows ?? false;
    this.minRows = config.grid.rows; // 지정되었으면 최소로 기억
    this.gridOverlayMode = config.gridOverlayMode ?? 'always';
    this.dragReflow = config.dragReflow ?? 'none';
    this.autoArrange = config.autoArrange ?? false;
    this.autoArrangeStrategy = config.autoArrangeStrategy ?? 'top-left';
    this.arrangeAnimationMs = config.arrangeAnimationMs ?? 160;
    // cross-board drag option
    this.dragOut = !!(config as any).dragOut;

    // autoGrowRows일 때는 검증 단계에서 rows 상한을 넘는 배치도 임시 허용하도록 Grid에 힌트
    (this.grid as any).setUnboundedRows?.(this.autoGrowRows);

    this.setupContainer();
    this.setupDragManager();
    this.setupEditModeHandlers();
    this.setEditable(config.editable ?? true);

    // 초기 rows 자동 보정(초기 블록이 있다면)
    this.recomputeRowsIfNeeded();
    // 초기 자동 배치
    this.autoArrangeIfEnabled();
    // Register to cross-board coordinator
    CrossBoardCoordinator.register(this as any);
  }

  private setupContainer(): void {
    // 기존 스타일은 유지하면서 필요한 클래스만 추가
    if (!this.container.classList.contains('pegboard-container')) {
      this.container.classList.add('pegboard-container');
    }

    // 기본 스타일은 JS에서 강제하지 않음 (headless)
    this.grid.applyGridStyles(this.container);
  }

  private setupDragManager(): void {
    this.dragManager = new DragManager(
      this.container,
      this.grid,
      (id: string) => this.blocks.get(id),
      () => Array.from(this.blocks.values()),
      () => this.allowOverlap,
      () => this.lassoSelection,
      () => this.keyboardMove,
      () => this.keyboardDelete,
      (ids: string[]) => ids.forEach((id) => this.removeBlock(id)),
      () => this.autoGrowRows,
      (rows: number) => {
        if (!this.autoGrowRows) return;
        const cfg = this.grid.getConfig();
        // baseline: 최초 입력 받은 rows(=this.minRows)와 현재 설정 rows 중 큰 값을 최소로 유지
        const minBase = Math.max(this.minRows || 0, cfg.rows || 0);
        const next = Math.max(rows | 0, minBase);
        if (!cfg.rows || cfg.rows < next) {
          this.grid.updateConfig({ rows: next });
          this.grid.applyGridStyles(this.container);
          if (this.editable) this.showGridLines();
          this.emit('grid:changed', { grid: this.grid.getConfig() });
        }
      },
      () => this.dragReflow,
    );

    this.dragManager.on('block:moved', ({ block, oldPosition }) => {
      this.emit('block:moved', { block, oldPosition });
      // 드래그 종료 후 다음 프레임에 자동 정렬 및 rows 보정 실행
      requestAnimationFrame(() => {
        this.autoArrangeIfEnabled();
        this.recomputeRowsIfNeeded();
        // 드래그 종료로 간주: 인터랙션 비활성화, overlay 갱신
        this.isInteractionActive = false;
        this.showGridLines();
      });
    });

    this.dragManager.on('block:resized', ({ block, oldSize }) => {
      this.emit('block:resized', { block, oldSize });
      requestAnimationFrame(() => {
        this.autoArrangeIfEnabled();
        this.recomputeRowsIfNeeded();
        this.isInteractionActive = false;
        this.showGridLines();
      });
    });
    this.dragManager.on('block:selected', ({ block }) => {
      this.emit('block:selected', { block });
    });
    this.dragManager.on('selection:changed', ({ ids }) => {
      this.emit('selection:changed', { ids });
    });

    // 인터랙션 시작/종료에 따라 overlay 토글 (active 모드 전용)
    this.dragManager.on('interaction:active', () => {
      if (!this.editable) return;
      if (this.gridOverlayMode !== 'active') return;
      this.isInteractionActive = true;
      this.showGridLines();
    });
    this.dragManager.on('interaction:idle', () => {
      if (!this.editable) return;
      if (this.gridOverlayMode !== 'active') return;
      this.isInteractionActive = false;
      this.showGridLines();
    });
  }

  // Edit mode: enter via double-click, exit via outside click or API
  private setupEditModeHandlers(): void {
    // delegate dblclick on block
    this.container.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      const blockEl = target.closest('.pegboard-block') as HTMLElement | null;
      if (!blockEl) return;
      const id = blockEl.dataset.blockId;
      if (!id) return;
      const block = this.blocks.get(id);
      if (!block) return;
      const ext = this.extensions.get(block.getData().type);
      if (!ext || !(ext as any).allowEditMode) return; // not opt-in
      this.enterBlockEditMode(id);
    });

    // click outside exits edit mode (capture to run before container handlers)
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!this.editingBlockId) return;
        const target = e.target as HTMLElement;
        const block = this.blocks.get(this.editingBlockId!);
        if (!block) return;
        const blockEl = block.getElement();
        if (blockEl.contains(target)) return; // inside
        this.exitBlockEditMode();
      },
      true,
    );
  }

  getEditingBlockId(): string | null {
    return this.editingBlockId;
  }

  enterBlockEditMode(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;
    const ext = this.extensions.get(block.getData().type) as any;
    if (!ext || !ext.allowEditMode) return false;
    // 이미 편집 중이면 동일 id면 OK, 다르면 교체
    if (this.editingBlockId && this.editingBlockId !== id) {
      this.exitBlockEditMode();
    }
    this.editingBlockId = id;
    // 편집 모드 동안 이동/리사이즈를 사실상 비활성화 (키보드 등 포함)
    block.setEditing(true);
    this.dragManager.selectBlock(block); // 포커스 동기화
    // notify extension
    ext.onEnterEditMode?.(block.getData() as any, block.getContentElement());
    this.emit('block:edit:entered', { block: block.getData() });
    return true;
  }

  exitBlockEditMode(): boolean {
    if (!this.editingBlockId) return false;
    const block = this.blocks.get(this.editingBlockId);
    if (!block) {
      this.editingBlockId = null;
      return false;
    }
    const ext = this.extensions.get(block.getData().type) as any;
    block.setEditing(false);
    ext?.onExitEditMode?.(block.getData() as any, block.getContentElement());
    this.emit('block:edit:exited', { block: block.getData() });
    this.editingBlockId = null;
    return true;
  }

  toggleBlockEditMode(id: string): boolean {
    if (this.editingBlockId === id) return this.exitBlockEditMode();
    return this.enterBlockEditMode(id);
  }

  private showGridLines(): void {
    // editable=false면 표시 금지
    if (!this.editable) return;
    // 'never' 모드는 표시 안 함
    if (this.gridOverlayMode === 'never') {
      this.grid.hideGridLines(this.container);
      return;
    }
    // 'active' 모드는 move/resize 중에만 표시
    if (this.gridOverlayMode === 'active') {
      if (this.isInteractionActive) {
        this.grid.renderGridLines(this.container);
      } else {
        this.grid.hideGridLines(this.container);
      }
      return;
    }
    // 'always'
    this.grid.renderGridLines(this.container);
  }

  private hideGridLines(): void {
    this.grid.hideGridLines(this.container);
  }

  registerExtension(extension: BlockExtension<any>): void {
    this.extensions.set(extension.type, extension);
    // If blocks of this type already exist, mark them as supporting edit mode when opted-in
    const allow = extension.allowEditMode;
    if (allow) {
      for (const b of this.blocks.values()) {
        if (b.getData().type === extension.type) b.setSupportsEditMode(true);
      }
    }
  }

  unregisterExtension(type: string): void {
    this.extensions.delete(type);
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

  addBlock<Attrs extends Record<string, any>>(
    data: PartialKeys<CoreTypes.BlockData<Attrs>, 'id' | 'attributes'>,
  ): string {
    const extension = this.extensions.get(data.type);
    if (!extension) {
      throw new Error(`Extension not found for block type: ${data.type}`);
    }

    const existingBlocks = Array.from(this.blocks.values()).map((b) => b.getData());

    const layout = data.constraints;
    const initialSize = data.size;
    let clampedSize = { ...initialSize };
    // 1) 플러그인 제약(min/max) 우선 적용
    if (layout) {
      const clamp = (val: number, min?: number, max?: number) => {
        if (min !== undefined) val = Math.max(min, val);
        if (max !== undefined) val = Math.min(max, val);
        return val;
      };
      clampedSize.width = clamp(clampedSize.width, layout.minWidth, layout.maxWidth);
      clampedSize.height = clamp(clampedSize.height, layout.minHeight, layout.maxHeight);
    }
    // 2) 그리드 경계에 맞춰 추가 클램프 (너비는 columns, 높이는 rows cap이 있는 경우에 한해)
    const cfg = this.grid.getConfig();
    clampedSize.width = Math.max(1, Math.min(clampedSize.width, cfg.columns));
    if (cfg.rows && cfg.rows > 0) {
      clampedSize.height = Math.max(1, Math.min(clampedSize.height, cfg.rows));
    }

    // 요청된/기본 시작 위치 결정
    const requestedPosition = {
      x: data.position.x,
      y: data.position.y,
      zIndex: data.position.zIndex ?? this.nextZIndex,
    };

    let finalPosition: CoreTypes.GridPosition;

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

    const blockData: CoreTypes.BlockData = {
      id: data.id || generateId(),
      type: data.type || 'default',
      position: {
        x: finalPosition.x,
        y: finalPosition.y,
        zIndex:
          data.position && data.position.zIndex !== undefined
            ? data.position.zIndex
            : this.nextZIndex++,
      },
      size: clampedSize,
      constraints: data.constraints,
      attributes: { ...(extension?.defaultAttributes || {}), ...(data.attributes || {}) },
      movable: data.movable,
      resizable: data.resizable,
    };

    const block = new Block(blockData);
    block.setEditable(this.editable);
    // Opt-in edit mode support (stored on block for quick checks)
    const ext = this.extensions.get(blockData.type) as any;
    block.setSupportsEditMode(!!ext?.allowEditMode);

    this.blocks.set(blockData.id, block);
    this.container.appendChild(block.getElement());

    if (extension) {
      extension.onCreate?.(blockData as any, block.getContentElement(), this.editable);
      extension.onBeforeRender?.(blockData as any, block.getContentElement(), this.editable);
      extension.render(blockData as any, block.getContentElement(), this.editable);
      extension.onAfterRender?.(blockData as any, block.getContentElement(), this.editable);
    }

    this.emit('block:added', { block: blockData });
    // rows 자동 재계산
    this.autoArrangeIfEnabled();
    this.recomputeRowsIfNeeded();
    return blockData.id;
  }

  removeBlock(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    // If currently editing this block, exit edit mode first
    if (this.editingBlockId === id) {
      this.exitBlockEditMode();
    }

    if (this.dragManager.getSelectedBlock() === block) {
      this.dragManager.selectBlock(null);
    }

    const extension = this.extensions.get(block.getData().type);
    if (extension) {
      extension.onDestroy?.(block.getData() as any);
    }

    block.destroy();
    this.blocks.delete(id);

    this.emit('block:removed', { blockId: id });
    this.autoArrangeIfEnabled();
    this.recomputeRowsIfNeeded();
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

      const layout = updates.constraints ?? currentData.constraints;
      let candidateSize = { ...updates.size };
      // 1) 플러그인 제약(min/max)
      if (layout) {
        if (layout.minWidth !== undefined)
          candidateSize.width = Math.max(layout.minWidth, candidateSize.width);
        if (layout.minHeight !== undefined)
          candidateSize.height = Math.max(layout.minHeight, candidateSize.height);
        if (layout.maxWidth !== undefined)
          candidateSize.width = Math.min(layout.maxWidth, candidateSize.width);
        if (layout.maxHeight !== undefined)
          candidateSize.height = Math.min(layout.maxHeight, candidateSize.height);
      }
      // 2) 그리드 경계 클램프
      const cfg = this.grid.getConfig();
      candidateSize.width = Math.max(1, Math.min(candidateSize.width, cfg.columns));
      if (cfg.rows && cfg.rows > 0) {
        candidateSize.height = Math.max(1, Math.min(candidateSize.height, cfg.rows));
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

    if (updates.constraints !== undefined) {
      block.setConstraints(updates.constraints as any);
    }

    if (updates.attributes) {
      block.setAttributes(updates.attributes);

      const extension = this.extensions.get(currentData.type);
      if (extension) {
        extension.onBeforeRender?.(newData as any, block.getContentElement(), this.editable);
        extension.render(newData as any, block.getContentElement(), this.editable);
        extension.onUpdateAttributes?.(newData as any, block.getContentElement(), this.editable);
        extension.onAfterRender?.(newData as any, block.getContentElement(), this.editable);
      }
    }

    this.emit('block:updated', { block: newData });
    if (updates.position || updates.size) {
      this.autoArrangeIfEnabled();
      this.recomputeRowsIfNeeded();
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
      // Leaving editor mode should end edit mode if active
      if (this.editingBlockId) this.exitBlockEditMode();
      this.hideGridLines();
      this.dragManager.selectBlock(null);
    }
  }

  getEditable(): boolean {
    return this.editable;
  }

  setGridConfig(config: Partial<CoreTypes.GridConfig>): void {
    // rows를 명시적으로 설정하면 baseline도 갱신
    if (config.rows !== undefined) {
      this.minRows = config.rows;
    }
    this.grid.updateConfig(config);
    // autoGrowRows 상태 유지 반영
    (this.grid as any).setUnboundedRows?.(this.autoGrowRows);
    this.grid.applyGridStyles(this.container);
    if (this.editable) this.showGridLines();

    // grid 변경 후에도 자동 rows 보정
    this.recomputeRowsIfNeeded();

    this.emit('grid:changed', { grid: this.grid.getConfig() });
  }

  getGridConfig(): CoreTypes.GridConfig {
    return this.grid.getConfig();
  }

  // Cross-board helpers
  getContainer(): HTMLElement {
    return this.container;
  }

  getDragOutEnabled(): boolean {
    return !!this.dragOut;
  }

  // Expose hint control for external previews (rendered within this board)
  showExternalHint(pos: CoreTypes.GridPosition, size: CoreTypes.GridSize, valid: boolean): void {
    (this.dragManager as any).showExternalHint?.(pos, size, valid);
  }
  clearExternalHint(): void {
    (this.dragManager as any).clearExternalHint?.();
  }

  // Convert viewport pixels to this board's grid position
  getGridPositionFromViewport(pt: { x: number; y: number }): CoreTypes.GridPosition {
    return this.grid.getGridPositionFromPixels({ x: pt.x, y: pt.y }, this.container);
  }

  // Validate a position/size against this board's grid bounds
  isValidPosition(pos: CoreTypes.GridPosition, size: CoreTypes.GridSize): boolean {
    return this.grid.isValidGridPosition(pos, size);
  }

  // Check collision at a position/size with existing blocks in this board
  wouldCollide(
    pos: CoreTypes.GridPosition,
    size: CoreTypes.GridSize,
    excludeId: string = '',
  ): boolean {
    const existing = this.getAllBlocks();
    return this.grid.checkGridCollision(pos, size, excludeId, existing as any);
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

    // import 후 rows 재계산
    this.autoArrangeIfEnabled();
    this.recomputeRowsIfNeeded();
  }

  clear(): void {
    this.blocks.forEach((_, id) => this.removeBlock(id));
    // clear 후에도 최소 rows 유지
    this.recomputeRowsIfNeeded();
  }

  bringToFront(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    block.setPosition({
      ...blockData.position,
      zIndex: this.nextZIndex++,
    });

    // nextZIndex 동기화
    this.syncNextZIndex();
    return true;
  }

  private syncNextZIndex() {
    const maxZ = this.getAllBlocks().reduce((m, d) => Math.max(m, d.position.zIndex), 0);
    this.nextZIndex = Math.max(this.nextZIndex, maxZ + 1);
  }

  // z-index 중복이 있으면 1..N으로 재배열해 유일하게 만듭니다(상대 순서는 유지)
  private normalizeZOrder() {
    const items = Array.from(this.blocks.values()).map((b) => ({
      b,
      z: b.getData().position.zIndex,
      id: b.getData().id,
    }));
    items.sort((a, b) => (a.z === b.z ? a.id.localeCompare(b.id) : a.z - b.z));
    let changed = false;
    items.forEach((it, idx) => {
      const desired = idx + 1;
      if (it.z !== desired) {
        const pos = it.b.getData().position;
        it.b.setPosition({ ...pos, zIndex: desired });
        changed = true;
      }
    });
    if (changed) this.syncNextZIndex();
  }

  private ensureUniqueZIndices() {
    const seen = new Set<number>();
    let dup = false;
    for (const b of this.blocks.values()) {
      const z = b.getData().position.zIndex;
      if (seen.has(z)) {
        dup = true;
        break;
      }
      seen.add(z);
    }
    if (dup) this.normalizeZOrder();
  }

  // 한 단계 앞으로 (z-index를 바로 위의 블록과 교환)
  bringForward(id: string): boolean {
    this.ensureUniqueZIndices();
    const list = Array.from(this.blocks.values());
    if (list.length <= 1) return false;
    const sorted = list
      .map((b) => ({ b, z: b.getData().position.zIndex }))
      .sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((e) => e.b.getData().id === id);
    if (idx === -1 || idx === sorted.length - 1) return false; // 이미 최상단
    const current = sorted[idx]!.b;
    const above = sorted[idx + 1]!.b;
    const cz = current.getData().position.zIndex;
    const az = above.getData().position.zIndex;
    // swap
    current.setPosition({ ...current.getData().position, zIndex: az });
    above.setPosition({ ...above.getData().position, zIndex: cz });

    this.syncNextZIndex();
    return true;
  }

  sendToBack(id: string): boolean {
    const block = this.blocks.get(id);
    if (!block) return false;

    const blockData = block.getData();
    const minZIndex = Math.min(...this.getAllBlocks().map((b) => b.position.zIndex));

    block.setPosition({
      ...blockData.position,
      zIndex: minZIndex - 1, // 음수 허용: 진짜 최하단으로
    });

    this.syncNextZIndex();
    return true;
  }

  // 한 단계 뒤로 (z-index를 바로 아래의 블록과 교환)
  sendBackward(id: string): boolean {
    this.ensureUniqueZIndices();
    const list = Array.from(this.blocks.values());
    if (list.length <= 1) return false;
    const sorted = list
      .map((b) => ({ b, z: b.getData().position.zIndex }))
      .sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((e) => e.b.getData().id === id);
    if (idx <= 0) return false; // 이미 최하단 또는 없음
    const current = sorted[idx]!.b;
    const below = sorted[idx - 1]!.b;
    const cz = current.getData().position.zIndex;
    const bz = below.getData().position.zIndex;
    // swap
    current.setPosition({ ...current.getData().position, zIndex: bz });
    below.setPosition({ ...below.getData().position, zIndex: cz });

    this.syncNextZIndex();
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

    const layout = block.getData().constraints;
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

  setLassoSelection(enabled: boolean) {
    this.lassoSelection = !!enabled;
  }

  getLassoSelection() {
    return this.lassoSelection;
  }

  setKeyboardMove(enabled: boolean) {
    this.keyboardMove = !!enabled;
  }

  getKeyboardMove() {
    return this.keyboardMove;
  }

  setKeyboardDelete(enabled: boolean) {
    this.keyboardDelete = !!enabled;
  }

  getKeyboardDelete() {
    return this.keyboardDelete;
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
    CrossBoardCoordinator.unregister(this as any);
  }

  // 새 기능: 블록 하단에 맞춰 rows 자동 증감
  private recomputeRowsIfNeeded(): void {
    if (!this.autoGrowRows) return;
    const cfg = this.grid.getConfig();
    // baseline: 최초/마지막 지정 rows를 최소로 유지(현재 rows 값에 의해 래칫되지 않도록)
    const minRows = this.minRows || 0;

    // 모든 블록의 y + height - 1 의 최대값을 계산
    let bottom = 0;
    for (const b of this.blocks.values()) {
      const d = b.getData();
      bottom = Math.max(bottom, d.position.y + d.size.height - 1);
    }

    const desired = Math.max(minRows, bottom);
    if (!cfg.rows || cfg.rows !== desired) {
      this.grid.updateConfig({ rows: desired });
      this.grid.applyGridStyles(this.container);
      if (this.editable) this.showGridLines();
      this.emit('grid:changed', { grid: this.grid.getConfig() });
    }
  }

  // Auto arrange
  private autoArrangeIfEnabled(): void {
    if (!this.autoArrange) return;
    if (this.isArranging) return;
    // 드래그/리사이즈 중에는 실행하지 않음
    if (this.dragManager && this.dragManager.isDragging()) return;
    if (this.autoArrangeStrategy === 'top-left') {
      this.arrangeTopLeft();
    } else if (this.autoArrangeStrategy === 'masonry') {
      this.arrangeMasonry();
    } else if (this.autoArrangeStrategy === 'by-row') {
      this.arrangeByRow();
    } else if (this.autoArrangeStrategy === 'by-column') {
      this.arrangeByColumn();
    }
  }

  private arrangeTopLeft(): void {
    const cfg = this.grid.getConfig();
    if (cfg.columns <= 0) return;
    // 중첩 허용이면 패킹 의미가 약함: 수행하지 않음
    if (this.allowOverlap) return;
    const blocks = Array.from(this.blocks.values());
    if (blocks.length === 0) return;

    this.isArranging = true;
    try {
      // 안정적 순서: 현재 위치 (y asc, x asc), 그 다음 id
      const items = blocks
        .map((b) => b)
        .sort((a, b) => {
          const ap = a.getData().position;
          const bp = b.getData().position;
          if (ap.y !== bp.y) return ap.y - bp.y;
          if (ap.x !== bp.x) return ap.x - bp.x;
          return a.getData().id.localeCompare(b.getData().id);
        });

      // Occupancy: placed proposals
      const proposed = new Map<string, CoreTypes.GridPosition>();
      let requiredBottom = 0;

      const collides = (
        pos: CoreTypes.GridPosition,
        size: CoreTypes.GridSize,
        excludeId?: string,
      ) => {
        // against proposed
        for (const [id, p] of proposed.entries()) {
          if (excludeId && id === excludeId) continue;
          const b = this.blocks.get(id)!;
          const s = b.getData().size;
          const endX = pos.x + size.width - 1;
          const endY = pos.y + size.height - 1;
          const oEndX = p.x + s.width - 1;
          const oEndY = p.y + s.height - 1;
          const h = !(pos.x > oEndX || endX < p.x);
          const v = !(pos.y > oEndY || endY < p.y);
          if (h && v) return true;
        }
        return false;
      };

      const isWithin = (pos: CoreTypes.GridPosition, size: CoreTypes.GridSize) => {
        // columns cap은 항상 적용, rows cap은 autoGrowRows일 때는 확장 허용
        const withinColumns = pos.x >= 1 && pos.x + size.width - 1 <= cfg.columns;
        if (!withinColumns) return false;
        if (this.autoGrowRows) return pos.y >= 1; // 하한만
        const rows = cfg.rows || Infinity;
        return pos.y >= 1 && pos.y + size.height - 1 <= rows;
      };

      const findSpot = (size: CoreTypes.GridSize): CoreTypes.GridPosition | null => {
        const maxRows = this.autoGrowRows ? Math.max(cfg.rows || 0, 1000) : cfg.rows || 1000;
        for (let y = 1; y <= maxRows; y++) {
          for (let x = 1; x <= cfg.columns - size.width + 1; x++) {
            const p = { x, y, zIndex: 1 } as CoreTypes.GridPosition;
            if (!isWithin(p, size)) continue;
            if (!collides(p, size)) return p;
          }
        }
        // no spot
        return null;
      };

      for (const b of items) {
        const d = b.getData();
        const spot = findSpot(d.size);
        if (spot) {
          proposed.set(d.id, { x: spot.x, y: spot.y, zIndex: d.position.zIndex });
          requiredBottom = Math.max(requiredBottom, spot.y + d.size.height - 1);
        } else {
          // keep original position and mark bottom for potential row growth
          proposed.set(d.id, { ...d.position });
          requiredBottom = Math.max(requiredBottom, d.position.y + d.size.height - 1);
        }
      }

      // autoGrowRows: 필요한 경우 rows 확장
      if (this.autoGrowRows && requiredBottom > (cfg.rows || 0)) {
        this.grid.updateConfig({ rows: requiredBottom });
        this.grid.applyGridStyles(this.container);
        if (this.editable) this.showGridLines();
        this.emit('grid:changed', { grid: this.grid.getConfig() });
      }

      // FLIP 애니메이션으로 커밋
      const firstRects = new Map<string, DOMRect>();
      for (const b of items) {
        firstRects.set(b.getData().id, b.getElement().getBoundingClientRect());
      }
      // set positions
      for (const b of items) {
        const id = b.getData().id;
        const to = proposed.get(id)!;
        const from = b.getData().position;
        if (from.x === to.x && from.y === to.y) continue; // unchanged
        b.setPosition(to);
      }
      // last rects and invert
      const lastRects = new Map<string, DOMRect>();
      for (const b of items) {
        lastRects.set(b.getData().id, b.getElement().getBoundingClientRect());
      }
      // apply transforms
      for (const b of items) {
        const id = b.getData().id;
        const fromRect = firstRects.get(id)!;
        const toRect = lastRects.get(id)!;
        const el = b.getElement();
        el.style.transition = 'none';
        el.style.transform = `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px)`;
      }
      // play
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.container.offsetHeight;
      for (const b of items) {
        const el = b.getElement();
        el.style.transition = `transform ${this.arrangeAnimationMs}ms ease`;
        el.style.transform = '';
        setTimeout(() => {
          el.style.transition = '';
        }, this.arrangeAnimationMs + 80);
      }
    } finally {
      this.isArranging = false;
    }
  }

  // By-row: 각 블록을 현재 세로 대역(y..y+height-1)에서 가능한 한 왼쪽으로만 당겨 정렬(행 고정 수평 컴팩션)
  private arrangeByRow(): void {
    const cfg = this.grid.getConfig();
    if (cfg.columns <= 0) return;
    if (this.allowOverlap) return;
    const blocks = Array.from(this.blocks.values());
    if (blocks.length === 0) return;

    this.isArranging = true;
    try {
      // 안정적 순서: 같은 행 대역부터 처리(y asc), 행 내에서는 x asc, 그다음 id
      const items = blocks
        .map((b) => b)
        .sort((a, b) => {
          const ap = a.getData().position,
            bp = b.getData().position;
          if (ap.y !== bp.y) return ap.y - bp.y;
          if (ap.x !== bp.x) return ap.x - bp.x;
          return a.getData().id.localeCompare(b.getData().id);
        });

      const proposed = new Map<string, CoreTypes.GridPosition>();

      const collidesWithProposed = (pos: CoreTypes.GridPosition, size: CoreTypes.GridSize) => {
        for (const [id, p] of proposed.entries()) {
          const b = this.blocks.get(id)!;
          const s = b.getData().size;
          const endX = pos.x + size.width - 1;
          const endY = pos.y + size.height - 1;
          const oEndX = p.x + s.width - 1;
          const oEndY = p.y + s.height - 1;
          const h = !(pos.x > oEndX || endX < p.x);
          const v = !(pos.y > oEndY || endY < p.y);
          if (h && v) return true;
        }
        return false;
      };

      for (const b of items) {
        const d = b.getData();
        const y = d.position.y; // 행 대역 고정
        const size = d.size;
        let bestX = d.position.x;
        for (let x = 1; x <= d.position.x; x++) {
          const candidate = { x, y, zIndex: d.position.zIndex } as CoreTypes.GridPosition;
          // 그리드 경계 확인
          const within = candidate.x >= 1 && candidate.x + size.width - 1 <= cfg.columns;
          if (!within) continue;
          if (!collidesWithProposed(candidate, size)) {
            bestX = x;
            break;
          }
        }
        proposed.set(d.id, { x: bestX, y, zIndex: d.position.zIndex });
      }

      this.commitArrangeWithFLIP(items, proposed);
    } finally {
      this.isArranging = false;
    }
  }

  // By-column: 각 블록을 현재 가로 대역(x..x+width-1)에서 가능한 한 위로만 당겨 정렬(열 고정 수직 컴팩션)
  private arrangeByColumn(): void {
    const cfg = this.grid.getConfig();
    if (cfg.columns <= 0) return;
    if (this.allowOverlap) return;
    const blocks = Array.from(this.blocks.values());
    if (blocks.length === 0) return;

    this.isArranging = true;
    try {
      // 안정적 순서(수직 안정성): 위에서 아래로(y asc), 동일 y에서는 x asc, 그다음 id
      // 이렇게 하면 아래에 있던 블록이 위의 블록을 뛰어넘어 올라가지 않음
      const items = blocks
        .map((b) => b)
        .sort((a, b) => {
          const ap = a.getData().position,
            bp = b.getData().position;
          if (ap.y !== bp.y) return ap.y - bp.y;
          if (ap.x !== bp.x) return ap.x - bp.x;
          return a.getData().id.localeCompare(b.getData().id);
        });

      const proposed = new Map<string, CoreTypes.GridPosition>();

      const collidesWithProposed = (pos: CoreTypes.GridPosition, size: CoreTypes.GridSize) => {
        for (const [id, p] of proposed.entries()) {
          const b = this.blocks.get(id)!;
          const s = b.getData().size;
          const endX = pos.x + size.width - 1;
          const endY = pos.y + size.height - 1;
          const oEndX = p.x + s.width - 1;
          const oEndY = p.y + s.height - 1;
          const h = !(pos.x > oEndX || endX < p.x);
          const v = !(pos.y > oEndY || endY < p.y);
          if (h && v) return true;
        }
        return false;
      };

      for (const b of items) {
        const d = b.getData();
        const x = d.position.x; // 열 대역 고정
        const size = d.size;
        let bestY = d.position.y;
        const rowsCap = this.autoGrowRows ? Infinity : (cfg.rows ?? Infinity);
        // 1) 위쪽으로만 스캔하며 가능한 가장 위(y가 작은) 위치 찾기
        for (let y = 1; y <= d.position.y; y++) {
          const candidate = { x, y, zIndex: d.position.zIndex } as CoreTypes.GridPosition;
          const within =
            candidate.y >= 1 &&
            candidate.y + size.height - 1 <=
              (rowsCap === Infinity ? Number.MAX_SAFE_INTEGER : (rowsCap as number));
          if (!within) continue;
          if (!collidesWithProposed(candidate, size)) {
            bestY = y;
            break;
          }
        }
        // 2) 위쪽에서 자리를 못 찾았고, 현재 위치가 이미 충돌한다면(겹침 방지)
        //    같은 대역에서 최소한으로 아래로 내리며 빈 위치를 탐색하는 폴백
        if (
          bestY === d.position.y &&
          collidesWithProposed(
            { x, y: bestY, zIndex: d.position.zIndex } as CoreTypes.GridPosition,
            size,
          )
        ) {
          const hardCap =
            rowsCap === Infinity ? cfg.rows || d.position.y + 2000 : (rowsCap as number);
          for (let y = d.position.y + 1; y <= hardCap; y++) {
            const candidate = { x, y, zIndex: d.position.zIndex } as CoreTypes.GridPosition;
            const within = candidate.y >= 1 && candidate.y + size.height - 1 <= hardCap;
            if (!within) continue;
            if (!collidesWithProposed(candidate, size)) {
              bestY = y;
              break;
            }
          }
        }
        proposed.set(d.id, { x, y: bestY, zIndex: d.position.zIndex });
      }

      this.commitArrangeWithFLIP(items, proposed);
    } finally {
      this.isArranging = false;
    }
  }

  // 공통 FLIP 커밋 헬퍼
  private commitArrangeWithFLIP(items: Block[], proposed: Map<string, CoreTypes.GridPosition>) {
    const firstRects = new Map<string, DOMRect>();
    for (const b of items) firstRects.set(b.getData().id, b.getElement().getBoundingClientRect());
    for (const b of items) {
      const id = b.getData().id;
      const to = proposed.get(id)!;
      const from = b.getData().position;
      if (to && !(from.x === to.x && from.y === to.y)) b.setPosition(to);
    }
    const lastRects = new Map<string, DOMRect>();
    for (const b of items) lastRects.set(b.getData().id, b.getElement().getBoundingClientRect());
    for (const b of items) {
      const id = b.getData().id;
      const fromRect = firstRects.get(id)!;
      const toRect = lastRects.get(id)!;
      const el = b.getElement();
      el.style.transition = 'none';
      el.style.transform = `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px)`;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.container.offsetHeight;
    for (const b of items) {
      const el = b.getElement();
      el.style.transition = `transform ${this.arrangeAnimationMs}ms ease`;
      el.style.transform = '';
      setTimeout(() => (el.style.transition = ''), this.arrangeAnimationMs + 80);
    }
  }

  // Masonry-style auto arrange: pack blocks column-wise minimizing column heights
  private arrangeMasonry(): void {
    const cfg = this.grid.getConfig();
    if (cfg.columns <= 0) return;
    // 중첩 허용이면 수행하지 않음
    if (this.allowOverlap) return;
    const blocks = Array.from(this.blocks.values());
    if (blocks.length === 0) return;

    this.isArranging = true;
    try {
      // 안정적 순서를 위해 현재 순서(추가된 순서에 가깝게): y asc, x asc, id asc
      const items = blocks
        .map((b) => b)
        .sort((a, b) => {
          const ap = a.getData().position;
          const bp = b.getData().position;
          if (ap.y !== bp.y) return ap.y - bp.y;
          if (ap.x !== bp.x) return ap.x - bp.x;
          return a.getData().id.localeCompare(b.getData().id);
        });

      // 각 column의 누적 높이(y 시작값). 1-indexed column 기준.
      const colHeights = new Array<number>(cfg.columns).fill(1);
      // 각 row 라인별 최대 높이 계산을 돕기 위해, 실제 Masonry는 column 단위로 쌓음.

      // 배치 제안 맵
      const proposed = new Map<string, CoreTypes.GridPosition>();
      let requiredBottom = 0;

      for (const b of items) {
        const d = b.getData();
        const w = Math.min(d.size.width, cfg.columns); // 보정

        const rowsCap = this.autoGrowRows ? Infinity : (cfg.rows ?? Infinity);
        // 가능한 모든 시작 column 범위에서 최소 최댓값 높이를 선택
        let bestX = -1;
        let bestY = Number.MAX_SAFE_INTEGER;
        for (let x = 1; x <= cfg.columns - w + 1; x++) {
          // 해당 구간의 현재 최대 높이(가장 높은 column)
          let segmentTop = 1;
          for (let i = 0; i < w; i++) {
            const idx = x - 1 + i;
            const h = colHeights[idx] ?? 1;
            segmentTop = Math.max(segmentTop, h);
          }
          // rows 상한을 넘기는 배치는 제외(상한이 있는 경우)
          const endY = segmentTop + d.size.height - 1;
          if (endY > rowsCap) continue;

          if (segmentTop < bestY) {
            bestY = segmentTop;
            bestX = x;
          }
        }

        // 배치 불가(상한 등) 시 현재 위치 유지 + 점유 상태 반영
        if (bestX === -1) {
          proposed.set(d.id, { ...d.position });
          const bottom = d.position.y + d.size.height; // 다음 시작선
          const x0 = Math.max(1, d.position.x);
          const w0 = Math.min(d.size.width, cfg.columns - x0 + 1);
          for (let i = 0; i < w0; i++) {
            const idx = x0 - 1 + i;
            colHeights[idx] = Math.max(colHeights[idx] ?? 1, bottom);
          }
          requiredBottom = Math.max(requiredBottom, d.position.y + d.size.height - 1);
          continue;
        }

        const placeY = bestY;
        proposed.set(d.id, { x: bestX, y: placeY, zIndex: d.position.zIndex });
        const newHeight = placeY + d.size.height; // 다음 블록이 쌓일 시작선
        for (let i = 0; i < w; i++) colHeights[bestX - 1 + i] = newHeight;
        requiredBottom = Math.max(requiredBottom, placeY + d.size.height - 1);
      }

      // autoGrowRows: 필요한 경우 rows 확장
      if (this.autoGrowRows && requiredBottom > (cfg.rows || 0)) {
        this.grid.updateConfig({ rows: requiredBottom });
        this.grid.applyGridStyles(this.container);
        if (this.editable) this.showGridLines();
        this.emit('grid:changed', { grid: this.grid.getConfig() });
      }

      // FLIP 애니메이션으로 커밋
      const firstRects = new Map<string, DOMRect>();
      for (const b of items) {
        firstRects.set(b.getData().id, b.getElement().getBoundingClientRect());
      }
      // set positions
      for (const b of items) {
        const id = b.getData().id;
        const to = proposed.get(id)!;
        const from = b.getData().position;
        if (from.x === to.x && from.y === to.y) continue; // unchanged
        b.setPosition(to);
      }
      // last rects and invert
      const lastRects = new Map<string, DOMRect>();
      for (const b of items) {
        lastRects.set(b.getData().id, b.getElement().getBoundingClientRect());
      }
      // apply transforms
      for (const b of items) {
        const id = b.getData().id;
        const fromRect = firstRects.get(id)!;
        const toRect = lastRects.get(id)!;
        const el = b.getElement();
        el.style.transition = 'none';
        el.style.transform = `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px)`;
      }
      // play
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this.container.offsetHeight;
      for (const b of items) {
        const el = b.getElement();
        el.style.transition = `transform ${this.arrangeAnimationMs}ms ease`;
        el.style.transform = '';
        setTimeout(() => {
          el.style.transition = '';
        }, this.arrangeAnimationMs + 80);
      }
    } finally {
      this.isArranging = false;
    }
  }
}
