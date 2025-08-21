import type * as CoreTypes from './types';
import type { BlockExtension } from './BlockExtension';
import { Block } from './Block';
import { Grid } from './Grid';
import { EventEmitter } from './EventEmitter';
import { generateId, deepClone } from './utils';
import { CrossBoardCoordinator } from './CrossBoardCoordinator';

// 새로운 Manager들
import { StateManager } from './state';
import { ConfigManager } from './config';
import { BlockManager } from './managers';
import { SelectionManager } from './managers';
import { PreviewManager } from './managers';
import { TransitionManager } from './managers';

// 새로운 Event 시스템
import {
  UIEventListener,
  SelectionHandler,
  KeyboardHandler,
  LassoHandler,
  DragHandler,
} from './events';

// 새로운 Operations & Commands 시스템
import { CommandRunner } from './operations/CommandRunner';
import {
  AddBlockCommand,
  DeleteSelectedCommand,
  DuplicateBlockCommand,
  MoveBlocksCommand,
  SelectByCriteriaCommand,
  ClearSelectionCommand,
  BringToFrontCommand,
  SendToBackCommand,
  SetZIndexCommand,
  ArrangeZOrderCommand,
  AutoArrangeCommand,
  ReflowCommand,
} from './operations/commands';

// Legacy imports removed - using new architecture

type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Pegboard: 오케스트레이터 패턴을 적용한 새로운 Pegboard 구현
 * 각 Manager들을 조율하여 복잡한 기능을 제공
 */
export class Pegboard extends EventEmitter {
  // Core Managers
  private stateManager: StateManager;
  private configManager: ConfigManager;
  private blockManager: BlockManager;
  private selectionManager: SelectionManager;
  private previewManager: PreviewManager;
  private transitionManager: TransitionManager;

  // Event System
  private uiEventListener: UIEventListener;
  private selectionHandler: SelectionHandler;
  private keyboardHandler: KeyboardHandler;
  private lassoHandler: LassoHandler;
  private dragHandler: DragHandler;

  // Command/Operation System
  private commandRunner: CommandRunner;

  // Core Grid (still used)
  private grid: Grid;

  // Convenience getters for external access
  private container: HTMLElement;

  // Auto grow rows 최적화를 위한 캐시
  private lastMaxUsedRow = 0;
  private gridUpdateTimeout: number | null = null;

  constructor(config: CoreTypes.PegboardConfig) {
    super();

    this.container = config.container;

    // 1. Grid 초기화 (기존 유지)
    this.grid = new Grid(config.grid);

    // 2. StateManager 초기화
    this.stateManager = new StateManager(
      config.grid, 
      undefined, 
      { editable: config.editable }
    );

    // 3. ConfigManager 초기화
    this.configManager = new ConfigManager(config);

    // 4. BlockManager 초기화
    this.blockManager = new BlockManager(
      this.container,
      this.grid,
      () => this.configManager.getInteractionConfig().allowOverlap,
    );

    // 5. SelectionManager 초기화
    this.selectionManager = new SelectionManager(
      (id: string) => this.blockManager.getBlockInstance(id),
      () => this.blockManager.getAllBlockInstances(),
    );

    // 6. PreviewManager 초기화
    this.previewManager = new PreviewManager(this.container);

    // 7. TransitionManager 초기화
    this.transitionManager = new TransitionManager(
      this.container,
      this.configManager.getVisualConfig().transitionConfig,
    );

    // 8. CommandRunner 초기화
    this.commandRunner = new CommandRunner({
      blockManager: this.blockManager,
      selectionManager: this.selectionManager,
      grid: this.grid,
    });

    // 9. UIEventListener 시스템 초기화 (생성자 내에서 직접 초기화)
    // 9-1. SelectionHandler 초기화
    this.selectionHandler = new SelectionHandler(this.selectionManager);

    // 9-2. KeyboardHandler 초기화
    this.keyboardHandler = new KeyboardHandler(this.selectionHandler, this.blockManager, () => ({
      keyboardMove: this.getKeyboardMove(),
      keyboardDelete: this.getKeyboardDelete(),
    }));

    // 9-3. LassoHandler 초기화
    this.lassoHandler = new LassoHandler(this.container, this.selectionHandler, () =>
      this.blockManager.getAllBlockInstances(),
    );

    // 9-4. DragHandler 초기화
    this.dragHandler = new DragHandler(
      this.container,
      this.blockManager,
      this.selectionHandler,
      this.grid,
      () => ({
        allowOverlap: this.getAllowOverlap(),
        dragReflow: this.configManager.getBehaviorConfig().dragReflow !== 'none',
      }),
      (anchorBlockId: string, newPosition: any, strategy?: any) =>
        this.reflow(anchorBlockId, newPosition, strategy),
      (blockId: string, from: any, to: any) => this.moveBlockWithTransition(blockId, from, to),
      (blockId: string, originalPosition: any) =>
        this.rollbackBlockWithTransition(blockId, originalPosition),
    );

    // 9-5. UIEventListener 초기화 및 핸들러 등록
    this.uiEventListener = new UIEventListener(
      this.container,
      (id: string) => this.blockManager.getBlockInstance(id),
      () => this.blockManager.getAllBlockInstances(),
      () => this.clearSelection(),
    );

    this.uiEventListener.setSelectionHandler(this.selectionHandler);
    this.uiEventListener.setKeyboardHandler(this.keyboardHandler);
    this.uiEventListener.setLassoHandler(this.lassoHandler);
    this.uiEventListener.setDragHandler(this.dragHandler);

    // 9-6. 이벤트 리스너 연결
    this.setupEventSystemListeners();

    // 9-7. 이벤트 시스템 활성화
    this.uiEventListener.enable();

    // 10. 컨테이너 초기 설정
    this.setupContainer();

    // 11. 이벤트 연결
    this.setupEventListeners();

    // 12. 초기 설정 적용
    this.applyInitialSettings();

    // 13. Cross-board 등록
    CrossBoardCoordinator.register(this as any);
  }

  // =============================================================================
  // Public API - 기존 Pegboard와 호환성 유지
  // =============================================================================

  // 블록 관리 - Command/Operation 시스템 사용
  async addBlock<Attrs extends Record<string, any>>(
    data: PartialKeys<CoreTypes.BlockData<Attrs>, 'id' | 'attributes'>,
  ): Promise<string> {
    const command = new AddBlockCommand(data);
    const result = await this.commandRunner.execute(command);

    if (!result.success) {
      throw new Error(result.error || 'Add block failed');
    }

    // Auto arrange 트리거 (활성화된 경우)
    const behaviorConfig = this.configManager.getBehaviorConfig();
    if (behaviorConfig.autoArrange) {
      setTimeout(() => {
        this.autoArrange(behaviorConfig.autoArrangeStrategy).catch((error) => {
          console.warn('Auto arrange after add block failed:', error);
        });
      }, 0);
    }

    // Command 결과에서 생성된 블록 ID 추출
    return result.data?.blockId || '';
  }

  async removeBlock(id: string): Promise<boolean> {
    // 해당 블록을 먼저 선택한 후 DeleteSelectedCommand 사용
    this.selectionManager.selectSingle(id);

    const command = new DeleteSelectedCommand();
    const result = await this.commandRunner.execute(command);

    // Auto arrange 트리거 (활성화된 경우)
    if (result.success) {
      const behaviorConfig = this.configManager.getBehaviorConfig();
      if (behaviorConfig.autoArrange) {
        setTimeout(() => {
          this.autoArrange(behaviorConfig.autoArrangeStrategy).catch((error) => {
            console.warn('Auto arrange after remove block failed:', error);
          });
        }, 0);
      }
    }

    return result.success;
  }

  updateBlock(id: string, updates: Partial<CoreTypes.BlockData>): boolean {
    const result = this.blockManager.updateBlock(id, updates);
    return result.success;
  }

  /**
   * 단일 블록 데이터 조회 (읽기 전용)
   * ⚠️ 반환된 객체를 수정하지 마세요! 성능을 위해 원본을 반환합니다.
   */
  getBlock(id: string): Readonly<CoreTypes.BlockData> | null {
    return this.blockManager.getBlock(id);
  }

  /**
   * 모든 블록 데이터 조회 (읽기 전용)
   * ⚠️ 반환된 배열/객체를 수정하지 마세요! 성능을 위해 원본을 반환합니다.
   */
  getAllBlocks(): ReadonlyArray<Readonly<CoreTypes.BlockData>> {
    return this.blockManager.getAllBlocks();
  }

  /**
   * 수정 가능한 블록 데이터 복사본 조회 (성능 비용 높음 - 필요시에만 사용)
   */
  getBlockCopy(id: string): CoreTypes.BlockData | null {
    return this.blockManager.getBlockCopy(id);
  }

  getAllBlocksCopy(): CoreTypes.BlockData[] {
    return this.blockManager.getAllBlocksCopy();
  }

  async duplicateBlock(id: string): Promise<string | null> {
    const command = new DuplicateBlockCommand(id);
    const result = await this.commandRunner.execute(command);
    return result.success ? result.data?.blockId || null : null;
  }

  // 선택 관리
  selectBlock(id: string | null): void {
    this.selectionManager.selectSingle(id);
  }

  async clearSelection(): Promise<boolean> {
    const command = new ClearSelectionCommand();
    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  getSelectedBlockId(): string | null {
    return this.selectionManager.getPrimaryId();
  }

  getSelectedBlockIds(): string[] {
    return this.selectionManager.getSelectedIds();
  }

  // Advanced selection methods using Commands
  async selectBlocksInRegion(
    bounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    },
    isAdditive: boolean = false,
  ): Promise<boolean> {
    const containerRect = this.container.getBoundingClientRect();
    const command = new SelectByCriteriaCommand({
      type: 'lasso',
      params: {
        bounds,
        isAdditive,
        containerBounds: containerRect,
      },
    });

    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async selectAllBlocks(): Promise<boolean> {
    const command = new SelectByCriteriaCommand({
      type: 'all',
    });

    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async selectBlocksByType(type: string): Promise<boolean> {
    const command = new SelectByCriteriaCommand({
      type: 'by-type',
      params: { type },
    });

    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async selectBlocksInPosition(
    minX?: number,
    maxX?: number,
    minY?: number,
    maxY?: number,
  ): Promise<boolean> {
    const command = new SelectByCriteriaCommand({
      type: 'by-position',
      params: { minX, maxX, minY, maxY },
    });

    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  // 편집 모드 관리
  setEditable(editable: boolean): void {
    console.log('🔧 Pegboard.setEditable() called with:', editable);
    
    this.stateManager.setEditableMode(editable);

    // UI 업데이트
    this.container.classList.toggle('pegboard-editor-mode', editable);
    this.container.classList.toggle('pegboard-viewer-mode', !editable);

    // 이벤트 시스템 설정
    this.uiEventListener?.setEditorMode(editable);
    console.log('🔧 UIEventListener.editorMode set to:', editable);

    // 블록들에 적용
    for (const block of this.blockManager.getAllBlockInstances()) {
      block.setEditable(editable);
    }

    // 그리드 라인 업데이트
    if (editable) {
      this.showGridLines();
      console.log('🔧 Grid lines shown');
    } else {
      this.hideGridLines();
      this.selectionManager.clearSelection();
      console.log('🔧 Grid lines hidden and selection cleared');
    }
  }

  getEditable(): boolean {
    return this.stateManager.getUIState().editable;
  }

  // 그리드 관리
  setGridConfig(config: Partial<CoreTypes.GridConfig>): void {
    // ConfigManager를 통해 설정 업데이트
    this.configManager.updateGridConfig(config as any);

    // Grid 인스턴스 업데이트
    this.grid.updateConfig(config);
    this.grid.applyGridStyles(this.container);

    // 그리드 라인 업데이트
    if (this.getEditable()) {
      this.showGridLines();
    }

    this.emit('grid:changed', { grid: this.grid.getConfig() });
  }

  getGridConfig(): CoreTypes.GridConfig {
    return this.grid.getConfig();
  }

  // Extension 관리
  registerExtension(extension: BlockExtension<any>): void {
    this.blockManager.registerExtension(extension);
  }

  unregisterExtension(type: string): void {
    this.blockManager.unregisterExtension(type);
  }

  // Z-index 관리 - Command 패턴 사용
  async bringToFront(id: string): Promise<boolean> {
    const command = new BringToFrontCommand(id);
    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async sendToBack(id: string): Promise<boolean> {
    const command = new SendToBackCommand(id);
    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async setZIndex(id: string, zIndex: number): Promise<boolean> {
    const command = new SetZIndexCommand(id, zIndex);
    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async arrangeZOrder(arrangement: 'front' | 'back' | 'forward' | 'backward'): Promise<boolean> {
    const command = new ArrangeZOrderCommand(arrangement);
    const result = await this.commandRunner.execute(command);
    return result.success;
  }

  async autoArrange(
    strategy?: CoreTypes.AutoArrangeStrategy,
    blockIds?: string[],
  ): Promise<boolean> {
    const finalStrategy = strategy || this.configManager.getBehaviorConfig().autoArrangeStrategy;

    console.log('🔧 AutoArrange 호출됨:', {
      strategy: finalStrategy,
      blockIds,
      totalBlocks: this.blockManager.getAllBlocks().length,
      behaviorConfig: this.configManager.getBehaviorConfig(),
    });

    const command = new AutoArrangeCommand(finalStrategy, blockIds);
    const result = await this.commandRunner.execute(command);

    console.log('🔧 AutoArrange 결과:', result);

    // Auto arrange 후 그리드 라인 업데이트
    if (result.success && this.getAutoGrowRows() && this.getEditable()) {
      this.showGridLines();
    }

    return result.success;
  }

  async reflow(
    anchorBlockId: string,
    newPosition: CoreTypes.GridPosition,
    strategy?: CoreTypes.DragReflowStrategy,
  ): Promise<boolean> {
    const finalStrategy = strategy || this.configManager.getBehaviorConfig().dragReflow;
    if (finalStrategy === 'none') {
      return true; // 리플로우 비활성화
    }

    const command = new ReflowCommand(anchorBlockId, newPosition, finalStrategy);
    const result = await this.commandRunner.execute(command);

    // Reflow 후 그리드 라인 업데이트
    if (result.success && this.getAutoGrowRows() && this.getEditable()) {
      this.showGridLines();
    }

    return result.success;
  }

  // Preview 관리
  showPreview(
    position: CoreTypes.GridPosition,
    size: CoreTypes.GridSize,
    valid: boolean = true,
  ): void {
    this.previewManager.showPreview(position, size, valid);
  }

  updatePreview(
    position: CoreTypes.GridPosition,
    size?: CoreTypes.GridSize,
    valid?: boolean,
  ): void {
    this.previewManager.updatePreview(position, size, valid);
  }

  hidePreview(): void {
    this.previewManager.hidePreview();
  }

  isPreviewActive(): boolean {
    return this.previewManager.isPreviewActive();
  }

  getCurrentPreview(): {
    position: CoreTypes.GridPosition;
    size: CoreTypes.GridSize;
    valid: boolean;
  } | null {
    return this.previewManager.getCurrentPreview();
  }

  // 블록 이동/리사이즈 (즉시 실행)
  moveBlockToPosition(id: string, gridPosition: CoreTypes.GridPosition): boolean {
    const result = this.blockManager.moveBlock(id, gridPosition);
    return result.success;
  }

  resizeBlock(id: string, gridSize: CoreTypes.GridSize): boolean {
    const result = this.blockManager.resizeBlock(id, gridSize);
    return result.success;
  }

  // 블록 이동/리사이즈 (트랜지션 적용)
  async moveBlockWithTransition(
    id: string,
    from: CoreTypes.GridPosition,
    to: CoreTypes.GridPosition,
  ): Promise<void> {
    const block = this.blockManager.getBlockInstance(id);
    if (!block) {
      throw new Error(`Block with id ${id} not found`);
    }

    await this.transitionManager.moveBlock(block, from, to);
  }

  // Rollback 전용 메서드 - 현재 transform 상태에서 원래 위치로 FLIP 애니메이션
  async rollbackBlockWithTransition(
    id: string,
    originalPosition: CoreTypes.GridPosition,
  ): Promise<void> {
    const block = this.blockManager.getBlockInstance(id);
    if (!block) {
      throw new Error(`Block with id ${id} not found`);
    }

    // TransitionManager의 rollback 메서드 사용
    const currentData = block.getData();
    console.log(originalPosition, currentData.position);
    await this.transitionManager.rollback(
      [block],
      [{ position: originalPosition, size: currentData.size }],
      'flip',
    );
  }

  async resizeBlockWithTransition(
    id: string,
    toSize: CoreTypes.GridSize,
    toPosition?: CoreTypes.GridPosition,
  ): Promise<void> {
    const block = this.blockManager.getBlockInstance(id);
    if (!block) {
      throw new Error(`Block with id ${id} not found`);
    }

    const blockData = block.getData();
    const fromPos = blockData.position;
    const toPos = toPosition || fromPos;
    const fromSize = blockData.size;

    await this.transitionManager.resizeBlock(block, fromPos, toPos, fromSize, toSize);
  }

  async moveBlocksWithTransition(
    moves: { id: string; to: CoreTypes.GridPosition }[],
  ): Promise<void> {
    const blockMoves = moves.map(({ id, to }) => {
      const block = this.blockManager.getBlockInstance(id);
      if (!block) {
        throw new Error(`Block with id ${id} not found`);
      }
      return {
        block,
        from: block.getData().position,
        to,
      };
    });

    await this.transitionManager.moveBlocks(blockMoves);
  }

  // Transition 제어
  cancelTransition(): void {
    this.transitionManager.cancel();
  }

  isTransitioning(): boolean {
    return this.transitionManager.isTransitioning();
  }

  // 설정 관리
  setAllowOverlap(allow: boolean): void {
    this.configManager.updateInteractionConfig({ allowOverlap: allow });
    this.emit('overlap:changed', { allow });
  }

  getAllowOverlap(): boolean {
    return this.configManager.getInteractionConfig().allowOverlap;
  }

  setLassoSelection(enabled: boolean): void {
    this.configManager.updateInteractionConfig({ lassoSelection: enabled });
    this.uiEventListener?.setLassoEnabled(enabled);
  }

  getLassoSelection(): boolean {
    return this.configManager.getInteractionConfig().lassoSelection;
  }

  setKeyboardMove(enabled: boolean): void {
    this.configManager.updateInteractionConfig({ keyboardMove: enabled });
    this.uiEventListener?.setKeyboardEnabled(enabled);
  }

  getKeyboardMove(): boolean {
    return this.configManager.getInteractionConfig().keyboardMove;
  }

  setKeyboardDelete(enabled: boolean): void {
    this.configManager.updateInteractionConfig({ keyboardDelete: enabled });
    this.uiEventListener?.setKeyboardEnabled(enabled);
  }

  getKeyboardDelete(): boolean {
    return this.configManager.getInteractionConfig().keyboardDelete;
  }

  setGridOverlayMode(mode: 'always' | 'active' | 'never'): void {
    this.configManager.updateVisualConfig({ gridOverlayMode: mode });
  }

  getGridOverlayMode(): 'always' | 'active' | 'never' {
    return this.configManager.getVisualConfig().gridOverlayMode;
  }

  setAutoGrowRows(enabled: boolean): void {
    this.grid.setUnboundedRows(enabled);
    this.grid.applyGridStyles(this.container);

    // 그리드 라인 즉시 업데이트
    if (this.getEditable()) {
      this.showGridLines();
    }

    this.emit('grid:autoGrowRows:changed', { enabled });
  }

  getAutoGrowRows(): boolean {
    return this.grid.getUnboundedRows();
  }

  // 직렬화
  exportData(): { blocks: CoreTypes.BlockData[]; grid: CoreTypes.GridConfig } {
    return {
      blocks: this.getAllBlocksCopy(), // 외부 노출용이므로 복사본 사용
      grid: this.getGridConfig(),
    };
  }

  exportJSON(pretty = false): string {
    const data: CoreTypes.SerializedPegboardData = {
      version: 1,
      grid: this.getGridConfig(),
      blocks: this.getAllBlocks() as CoreTypes.BlockData[], // JSON.stringify가 어차피 복사하므로 원본 사용 (성능 최적화)
    };
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  importJSON(json: string): void {
    let parsed: CoreTypes.SerializedPegboardData;
    try {
      parsed = JSON.parse(json);
    } catch (_e) {
      throw new Error('Invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid data');
    }

    // 현재 상태 초기화
    this.clear();

    // 그리드 설정 적용
    if (parsed.grid) {
      this.setGridConfig(parsed.grid);
    }

    // 블록 복원
    const blocks = parsed.blocks || [];
    for (const blockData of blocks) {
      this.addBlock({
        id: blockData.id,
        type: blockData.type,
        position: blockData.position,
        size: blockData.size,
        attributes: blockData.attributes,
        movable: blockData.movable,
        resizable: blockData.resizable,
      });
    }

    // nextZIndex 재계산
    this.stateManager.syncNextZIndex();
  }

  clear(): void {
    this.blockManager.clear();
    this.selectionManager.clearSelection();
  }

  // Undo/Redo 기능
  async undo(): Promise<boolean> {
    const result = await this.commandRunner.undo();

    // Undo 후 그리드 라인 업데이트
    if (result.success && this.getAutoGrowRows() && this.getEditable()) {
      this.showGridLines();
    }

    return result.success;
  }

  async redo(): Promise<boolean> {
    const result = await this.commandRunner.redo();

    // Redo 후 그리드 라인 업데이트
    if (result.success && this.getAutoGrowRows() && this.getEditable()) {
      this.showGridLines();
    }

    return result.success;
  }

  canUndo(): boolean {
    return this.commandRunner.canUndo();
  }

  canRedo(): boolean {
    return this.commandRunner.canRedo();
  }

  clearHistory(): void {
    this.commandRunner.clearHistory();
  }

  // 기타
  getContainer(): HTMLElement {
    return this.container;
  }

  destroy(): void {
    // Auto grow rows 타이머 정리
    if (this.gridUpdateTimeout) {
      cancelAnimationFrame(this.gridUpdateTimeout);
      this.gridUpdateTimeout = null;
    }

    this.blockManager.destroy();
    this.selectionManager.destroy();
    this.previewManager.destroy();
    this.transitionManager.destroy();
    this.uiEventListener?.destroy();
    this.hideGridLines();
    this.removeAllListeners();
    this.container.classList.remove(
      'pegboard-container',
      'pegboard-editor-mode',
      'pegboard-viewer-mode',
    );
    CrossBoardCoordinator.unregister(this as any);
  }

  // =============================================================================
  // Private 구현부
  // =============================================================================

  private setupContainer(): void {
    if (!this.container.classList.contains('pegboard-container')) {
      this.container.classList.add('pegboard-container');
    }
    this.grid.applyGridStyles(this.container);
  }

  private setupEventSystemListeners(): void {
    // SelectionHandler 이벤트
    this.selectionHandler.on('selection:changed', (event: any) => {
      (this as any).emit('selection:changed', { ids: event.newSelection || [] });
    });

    this.selectionHandler.on('block:selected', (event: any) => {
      (this as any).emit('block:selected', { block: event.block || null });
    });

    // KeyboardHandler 이벤트 - 커스텀 처리
    (this.keyboardHandler as any).on('blocks:deleted', () => {
      // 이미 KeyboardHandler 내부에서 삭제 처리됨
    });

    (this.keyboardHandler as any).on('blocks:moved', () => {
      // 이미 블록 이동 이벤트가 BlockManager에서 발생됨
    });

    // DragHandler 이벤트
    (this.dragHandler as any).on('drag:started', () => {
      this.stateManager.updateUIState({ isInteractionActive: true });
      (this as any).emit('interaction:active', { mode: 'move' });
    });

    (this.dragHandler as any).on('drag:ended', () => {
      this.stateManager.updateUIState({ isInteractionActive: false });
      (this as any).emit('interaction:idle', {});
    });

    // DragHandler에서 실제 블록 이동/리사이즈 이벤트는 BlockManager가 발생시킴

    // LassoHandler 이벤트
    (this.lassoHandler as any).on('lasso:started', () => {
      this.stateManager.updateUIState({ isInteractionActive: true });
      (this as any).emit('interaction:active', { mode: 'move' });
    });

    (this.lassoHandler as any).on('lasso:ended', () => {
      this.stateManager.updateUIState({ isInteractionActive: false });
      (this as any).emit('interaction:idle', {});
    });
  }

  private setupEventListeners(): void {
    // StateManager 이벤트
    (this.stateManager as any).on('ui:editable:changed', (event: any) => {
      (this as any).emit('editable:changed', { editable: event.newValue });
    });

    (this.stateManager as any).on('ui:isInteractionActive:changed', (event: any) => {
      // interaction 상태 변경 시 그리드 라인 업데이트 (active 모드에서만 표시)
      this.showGridLines();
      (this as any).emit('interaction:active:changed', { isActive: event.newValue });
    });

    // ConfigManager 이벤트
    (this.configManager as any).on('config:grid:changed', (event: any) => {
      (this as any).emit('grid:changed', { grid: event.newValue });
    });

    (this.configManager as any).on('config:visual:changed', (event: any) => {
      // gridOverlayMode 변경 시 그리드 라인 업데이트
      if (event.oldValue.gridOverlayMode !== event.newValue.gridOverlayMode) {
        this.showGridLines();
      }
      (this as any).emit('visual:changed', { visual: event.newValue });
    });

    // BlockManager 이벤트
    this.blockManager.on('block:added', (event) => {
      this.emit('block:added', event);
      // Auto grow rows가 활성화된 경우 그리드 라인 업데이트
      if (this.getAutoGrowRows()) {
        this.showGridLines();
      }
    });

    this.blockManager.on('block:removed', (event) => {
      this.emit('block:removed', event);
      // Auto grow rows가 활성화된 경우 그리드 라인 업데이트
      if (this.getAutoGrowRows()) {
        this.showGridLines();
      }
    });

    this.blockManager.on('block:updated', (event) => {
      this.emit('block:updated', event);
    });

    this.blockManager.on('block:moved', (event) => {
      this.emit('block:moved', event);
      // Auto grow rows가 활성화된 경우 그리드 라인 업데이트
      if (this.getAutoGrowRows()) {
        this.showGridLines();
      }
    });

    this.blockManager.on('block:resized', (event) => {
      this.emit('block:resized', event);
      // Auto grow rows가 활성화된 경우 그리드 라인 업데이트
      if (this.getAutoGrowRows()) {
        this.showGridLines();
      }
    });

    // SelectionManager 이벤트
    this.selectionManager.on('selection:changed', (event: any) => {
      this.emit('selection:changed', { ids: event.newSelection || [] });
    });

    this.selectionManager.on('block:selected', (event) => {
      this.emit('block:selected', event);
    });

    // DragHandler 이벤트 - PreviewManager와 연동
    let isDragActive = false;

    (this.dragHandler as any).on('drag:started', (event: any) => {
      isDragActive = true;
      (this as any).emit('drag:started', event);
    });

    (this.dragHandler as any).on('drag:preview', (event: any) => {
      // 실제 드래그가 활성화된 상태에서만 프리뷰 표시
      if (isDragActive) {
        this.previewManager.showPreview(event.position, event.size, event.valid);

        // Auto grow rows가 활성화된 경우 드래그 중에도 그리드 라인 동적 업데이트 (성능 최적화)
        if (this.getAutoGrowRows() && this.getEditable()) {
          this.updateGridDuringDrag(event);
        }
      }
    });

    (this.dragHandler as any).on('drag:ended', (event: any) => {
      // 드래그가 끝나면 미리보기 숨기기
      isDragActive = false;
      this.previewManager.hidePreview();

      // Auto grow rows 캐시 정리
      if (this.gridUpdateTimeout) {
        cancelAnimationFrame(this.gridUpdateTimeout);
        this.gridUpdateTimeout = null;
      }
      this.lastMaxUsedRow = 0; // 캐시 초기화

      (this as any).emit('drag:ended', event);
    });

    (this.dragHandler as any).on('drag:cancelled', (event: any) => {
      // 드래그가 취소되면 미리보기 숨기기
      isDragActive = false;
      this.previewManager.hidePreview();

      // Auto grow rows 캐시 정리
      if (this.gridUpdateTimeout) {
        cancelAnimationFrame(this.gridUpdateTimeout);
        this.gridUpdateTimeout = null;
      }
      this.lastMaxUsedRow = 0; // 캐시 초기화

      (this as any).emit('drag:cancelled', event);
    });
  }

  private applyInitialSettings(): void {
    // StateManager의 초기 editable 상태를 UI에 적용
    const initialEditable = this.stateManager.getUIState().editable;
    console.log('🔧 Applying initial editable state:', initialEditable);
    
    // UI 업데이트 (setEditable 로직과 동일하지만 StateManager는 이미 설정됨)
    this.container.classList.toggle('pegboard-editor-mode', initialEditable);
    this.container.classList.toggle('pegboard-viewer-mode', !initialEditable);
    this.uiEventListener?.setEditorMode(initialEditable);
    
    if (initialEditable) {
      this.showGridLines();
    } else {
      this.hideGridLines();
      this.selectionManager.clearSelection();
    }

    // 초기 설정 적용
    const gridConfig = this.configManager.getGridConfig();
    const behaviorConfig = this.configManager.getBehaviorConfig();
    const interactionConfig = this.configManager.getInteractionConfig();

    // Lasso selection 설정 적용
    this.uiEventListener?.setLassoEnabled(interactionConfig.lassoSelection);

    // Auto grow rows 설정 적용
    if (gridConfig.autoGrowRows) {
      this.setAutoGrowRows(true);
    }

    // Auto arrange 초기 실행 (활성화되어 있고 블록이 있는 경우)
    if (behaviorConfig.autoArrange) {
      // 초기 블록들이 추가된 후 자동 정렬 (비동기)
      setTimeout(() => {
        if (this.getAllBlocks().length > 0) {
          this.autoArrange(behaviorConfig.autoArrangeStrategy).catch((error) => {
            console.warn('Initial auto arrange failed:', error);
          });
        }
      }, 0);
    }

    // 그리드 라인 표시
    if (this.getEditable()) {
      this.showGridLines();
    }
  }

  private showGridLines(): void {
    const visualConfig = this.configManager.getVisualConfig();
    const uiState = this.stateManager.getUIState();

    if (!uiState.editable) return;

    if (visualConfig.gridOverlayMode === 'never') {
      this.grid.hideGridLines(this.container);
      return;
    }

    if (visualConfig.gridOverlayMode === 'active') {
      if (uiState.isInteractionActive) {
        const blocks = this.blockManager.getAllBlocks();
        this.grid.renderGridLines(this.container, blocks);
      } else {
        this.grid.hideGridLines(this.container);
      }
      return;
    }

    // 'always'
    const blocks = this.blockManager.getAllBlocks();
    this.grid.renderGridLines(this.container, blocks);
  }

  private hideGridLines(): void {
    this.grid.hideGridLines(this.container);
  }

  // Auto grow rows 드래그 중 그리드 업데이트 (성능 최적화)
  private updateGridDuringDrag(event: any): void {
    // 이미 예약된 업데이트가 있으면 취소
    if (this.gridUpdateTimeout) {
      cancelAnimationFrame(this.gridUpdateTimeout);
    }

    // requestAnimationFrame으로 쓰로틀링
    this.gridUpdateTimeout = requestAnimationFrame(() => {
      const newMaxRow = this.calculateMaxUsedRowFromDragEvent(event);

      // 최대 행 수가 변경되었을 때만 그리드 재렌더링
      if (newMaxRow !== this.lastMaxUsedRow) {
        this.lastMaxUsedRow = newMaxRow;

        // 빠른 업데이트: 기존 블록들과 새 최대 행 수로만 계산
        const currentBlocks = this.blockManager.getAllBlocks();
        this.grid.renderGridLines(this.container, currentBlocks);
      }

      this.gridUpdateTimeout = null;
    });
  }

  // 드래그 이벤트로부터 빠르게 최대 행 수 계산
  private calculateMaxUsedRowFromDragEvent(event: any): number {
    let maxRow = 0;

    // 기존 블록들의 최대 행 확인 (드래그 중인 블록 제외)
    const currentBlocks = this.blockManager.getAllBlocks();
    for (const block of currentBlocks) {
      if (
        block.id === event.blockId ||
        (event.selectedIds && event.selectedIds.includes(block.id))
      ) {
        continue; // 드래그 중인 블록들은 건너뛰기
      }
      maxRow = Math.max(maxRow, block.position.y + block.size.height - 1);
    }

    // 드래그 중인 주 블록의 새 위치 확인
    const dragEndRow = event.position.y + event.size.height - 1;
    maxRow = Math.max(maxRow, dragEndRow);

    // 그룹 드래그인 경우 다른 선택된 블록들도 확인
    if (event.isGroupDrag && event.selectedIds) {
      const mainBlock = (currentBlocks as any).find((b: any) => b.id === event.blockId);
      if (mainBlock) {
        const deltaY = event.position.y - mainBlock.position.y;

        for (const selectedId of event.selectedIds) {
          if (selectedId === event.blockId) continue;

          const selectedBlock = (currentBlocks as any).find((b: any) => b.id === selectedId);
          if (selectedBlock) {
            const newY = selectedBlock.position.y + deltaY;
            const selectedEndRow = newY + selectedBlock.size.height - 1;
            maxRow = Math.max(maxRow, selectedEndRow);
          }
        }
      }
    }

    return maxRow;
  }

  // =============================================================================
  // Manager 접근 메서드 (고급 사용자용)
  // =============================================================================

  getStateManager(): StateManager {
    return this.stateManager;
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  getBlockManager(): BlockManager {
    return this.blockManager;
  }

  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }

  getPreviewManager(): PreviewManager {
    return this.previewManager;
  }

  getTransitionManager(): TransitionManager {
    return this.transitionManager;
  }

  // 성능 진단 및 테스트 메서드들
  getSpatialIndexStats(): {
    totalCells: number;
    totalBlocks: number;
    averageBlocksPerCell: number;
  } {
    return this.blockManager.getSpatialIndexStats();
  }

  debugSpatialIndex(): void {
    console.log('🚀 Pegboard SpatialIndex Performance:');
    this.blockManager.debugSpatialIndex();
  }

  /**
   * 성능 벤치마크 실행 (개발/디버깅 용도)
   */
  async runPerformanceBenchmark(blockCount: number = 100): Promise<{
    speedup: string;
    legacyTime: number;
    optimizedTime: number;
  }> {
    const { PerformanceTest } = await import('./utils/PerformanceTest');
    const result = PerformanceTest.runBenchmark(blockCount);

    return {
      speedup: result.speedup,
      legacyTime: result.legacy.time,
      optimizedTime: result.optimized.time,
    };
  }
}
