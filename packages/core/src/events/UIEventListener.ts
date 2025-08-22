import { EventEmitter } from '../EventEmitter';
import type {
  IUIEventListener,
  IDragHandler,
  ISelectionHandler,
  ILassoHandler,
  IKeyboardHandler,
  PointerEvent,
  KeyboardEvent,
  InteractionContext,
  DragContext,
  LassoContext,
  SelectionContext,
  EventDelegationResult,
} from './types';
import type { Block } from '../Block';

/**
 * UIEventListener 생성자 파라미터 인터페이스
 */
export interface UIEventListenerConfig {
  container: HTMLElement;
  getBlockInstance: (id: string) => Block | null;
  getAllBlockInstances: () => Block[];
  clearSelectionCallback?: () => Promise<boolean>;
}

/**
 * UIEventListener: 모든 DOM 이벤트를 캡처하고 적절한 핸들러에 위임
 * - 이벤트 캡처 및 정규화
 * - 상호작용 컨텍스트 분석
 * - 핸들러 위임 및 우선순위 관리
 */
export class UIEventListener extends EventEmitter implements IUIEventListener {
  private container: HTMLElement;
  private isEnabled = false;
  private editorMode = true;
  private lassoEnabled = true;
  private keyboardEnabled = true;

  // Handler instances
  private dragHandler: IDragHandler | null = null;
  private selectionHandler: ISelectionHandler | null = null;
  private lassoHandler: ILassoHandler | null = null;
  private keyboardHandler: IKeyboardHandler | null = null;

  // Interaction state
  private currentInteraction: 'drag' | 'lasso' | 'selection' | null = null;
  private dragContext: DragContext | null = null;
  private lassoContext: LassoContext | null = null;

  // Drag threshold state
  private potentialDrag: {
    blockId: string;
    startEvent: PointerEvent;
    context: InteractionContext;
    dragType: 'move' | 'resize';
  } | null = null;
  private readonly DRAG_THRESHOLD = 3; // pixels

  // Callback functions
  private getBlockInstance: (id: string) => Block | null;
  private getAllBlockInstances: () => Block[];
  private clearSelectionCallback?: () => Promise<boolean>;

  // Event listeners (bound methods for proper cleanup)
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundDoubleClick: (e: MouseEvent) => void;
  private boundKeyDown: (e: globalThis.KeyboardEvent) => void;
  private boundKeyUp: (e: globalThis.KeyboardEvent) => void;

  constructor(config: UIEventListenerConfig) {
    super();
    this.container = config.container;
    this.getBlockInstance = config.getBlockInstance;
    this.getAllBlockInstances = config.getAllBlockInstances;
    this.clearSelectionCallback = config.clearSelectionCallback;

    // Bind event handlers
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundDoubleClick = this.handleDoubleClick.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
  }

  // Handler registration
  setDragHandler(handler: IDragHandler): void {
    this.dragHandler = handler;
  }

  setSelectionHandler(handler: ISelectionHandler): void {
    this.selectionHandler = handler;
  }

  setLassoHandler(handler: ILassoHandler): void {
    this.lassoHandler = handler;
  }

  setKeyboardHandler(handler: IKeyboardHandler): void {
    this.keyboardHandler = handler;
  }

  // State queries
  isDragging(): boolean {
    return this.currentInteraction === 'drag';
  }

  isLassoSelecting(): boolean {
    return this.currentInteraction === 'lasso';
  }

  getActiveInteraction(): 'drag' | 'lasso' | 'selection' | null {
    return this.currentInteraction;
  }

  // Configuration
  setEditorMode(enabled: boolean): void {
    this.editorMode = enabled;
  }

  setLassoEnabled(enabled: boolean): void {
    this.lassoEnabled = enabled;
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
  }

  // Lifecycle
  enable(): void {
    if (this.isEnabled) return;

    this.container.addEventListener('mousedown', this.boundMouseDown);
    this.container.addEventListener('dblclick', this.boundDoubleClick);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);

    this.isEnabled = true;
  }

  disable(): void {
    if (!this.isEnabled) return;

    this.container.removeEventListener('mousedown', this.boundMouseDown);
    this.container.removeEventListener('dblclick', this.boundDoubleClick);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);

    this.isEnabled = false;
    this.currentInteraction = null;
    this.dragContext = null;
    this.lassoContext = null;
  }

  destroy(): void {
    this.disable();
    this.dragHandler = null;
    this.selectionHandler = null;
    this.lassoHandler = null;
    this.keyboardHandler = null;
    this.removeAllListeners();
  }

  // Private event handlers

  private handleMouseDown(event: MouseEvent): void {
    if (!this.editorMode) return;

    // 우클릭은 처리하지 않음
    if (event.button !== 0) return;

    const pointerEvent = this.normalizePointerEvent(event);
    const context = this.analyzeInteractionContext(event);

    // 📝 Edit 모드 확인: 블록이 편집 중이면 내부 이벤트 허용
    if (context.blockId) {
      const block = this.getBlockInstance(context.blockId);
      if (block?.isEditing()) {
        // Edit 모드 중에는 블록 내부 요소와의 상호작용 허용
        return;
      }
    }
    
    // Check if target is in content editing mode  
    if (context.isContentEditable) return;

    const result = this.delegatePointerDown(pointerEvent, context);

    if (result.preventDefault) {
      event.preventDefault();
    }
    if (result.stopPropagation) {
      event.stopPropagation();
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.editorMode) return;
    if (this.currentInteraction === null && !this.potentialDrag) return;

    const pointerEvent = this.normalizePointerEvent(event);
    const result = this.delegatePointerMove(pointerEvent);

    if (result.preventDefault) {
      event.preventDefault();
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.editorMode) return;

    const pointerEvent = this.normalizePointerEvent(event);
    let result = { handled: false, preventDefault: false, stopPropagation: false };

    // 실제 드래그 중인 경우만 delegatePointerUp 호출
    if (this.currentInteraction !== null) {
      result = this.delegatePointerUp(pointerEvent);
    }

    if (result.preventDefault) {
      event.preventDefault();
    }

    // Reset interaction state (potentialDrag만 있던 경우도 정리)
    this.currentInteraction = null;
    this.dragContext = null;
    this.lassoContext = null;
    this.potentialDrag = null;
  }

  private handleKeyDown(event: globalThis.KeyboardEvent): void {
    if (!this.editorMode || !this.keyboardEnabled) return;
    if (this.isTypingTarget(event.target)) return;

    const keyboardEvent = this.normalizeKeyboardEvent(event);
    const result = this.delegateKeyDown(keyboardEvent);

    if (result.preventDefault) {
      event.preventDefault();
    }
  }

  private handleKeyUp(event: globalThis.KeyboardEvent): void {
    if (!this.editorMode || !this.keyboardEnabled) return;
    if (this.isTypingTarget(event.target)) return;

    const keyboardEvent = this.normalizeKeyboardEvent(event);
    const result = this.delegateKeyUp(keyboardEvent);

    if (result.preventDefault) {
      event.preventDefault();
    }
  }

  private handleDoubleClick(event: MouseEvent): void {
    if (!this.editorMode) return;

    const pointerEvent = this.normalizePointerEvent(event);
    const context = this.analyzeInteractionContext(event);
    
    // 블록 더블클릭 시 edit 모드 토글
    if (context.blockId) {
      const result = this.delegateDoubleClick(pointerEvent, context);
      
      if (result.preventDefault) {
        event.preventDefault();
      }
      if (result.stopPropagation) {
        event.stopPropagation();
      }
    }
  }

  // Event delegation

  private delegatePointerDown(
    event: PointerEvent,
    context: InteractionContext,
  ): EventDelegationResult {
    // 📝 Edit 모드 자동 해제: 다른 블록 클릭시 현재 편집 중인 블록 해제
    this.handleEditModeAutoExit(context.blockId);
    
    // Priority 1: Block interaction (drag/selection)
    if (context.blockId) {
      // 편집 모드가 아닌 경우 블럭 상호작용 차단
      if (!this.editorMode) {
        return { handled: false, preventDefault: false, stopPropagation: false };
      }
      if (context.isResizeHandle && context.allowResize && this.dragHandler) {
        // 리사이즈는 바로 드래그 시작 (핸들을 클릭했으므로 의도가 명확함)
        this.startDragInteraction(event, context, 'resize');
        return { handled: true, preventDefault: true, stopPropagation: true };
      } else if (context.allowDrag && this.dragHandler) {
        // Check for selection modifier
        if (event.modifiers.ctrl || event.modifiers.meta) {
          this.handleToggleSelection(context.blockId);
          return { handled: true, preventDefault: true, stopPropagation: false };
        } else {
          // 이동 가능한 블록 - 잠재적 드래그로 설정
          this.potentialDrag = {
            blockId: context.blockId,
            startEvent: event,
            context: context,
            dragType: 'move',
          };

          // 🔧 그룹 드래그 보존: 이미 선택된 블록이고 여러 블록이 선택된 경우 선택 상태 유지
          const isAlreadySelected = this.selectionHandler?.isSelected(context.blockId) || false;
          const selectedCount = this.selectionHandler?.getSelectionCount() || 0;
          const shouldPreserveSelection = isAlreadySelected && selectedCount > 1;

          if (!shouldPreserveSelection) {
            // 새 블록 선택이거나 단일 선택인 경우에만 선택 변경
            this.handleBlockSelection(context.blockId, false);
          }

          return { handled: true, preventDefault: true, stopPropagation: false };
        }
      } else {
        // Selection only
        this.handleBlockSelection(context.blockId, event.modifiers.ctrl || event.modifiers.meta);
        return { handled: true, preventDefault: true, stopPropagation: false };
      }
    }

    // Priority 2: Lasso selection (empty area) 
    if (this.editorMode && this.lassoEnabled && this.lassoHandler) {
      this.startLassoInteraction(event);
      return { handled: true, preventDefault: false, stopPropagation: false };
    }

    // Priority 3: Clear selection on background click (editable mode only)
    if (this.editorMode && this.clearSelectionCallback) {
      this.clearSelectionCallback().catch(error => {
        console.warn('Clear selection failed:', error);
      });
      return { handled: true, preventDefault: false, stopPropagation: false };
    }

    return { handled: false, preventDefault: false, stopPropagation: false };
  }

  /**
   * Edit 모드 자동 해제 처리
   * - 빈 영역 클릭시: 현재 편집 중인 블록 해제
   * - 다른 블록 클릭시: 현재 편집 중인 블록 해제
   * - 같은 블록 클릭시: edit 모드 유지
   */
  private handleEditModeAutoExit(clickedBlockId?: string): void {
    // 현재 편집 중인 블록 찾기
    const editingBlockId = this.getCurrentEditingBlockId();
    if (!editingBlockId) {
      return; // 편집 중인 블록이 없으면 아무것도 하지 않음
    }

    // 같은 블록을 클릭한 경우 edit 모드 유지
    if (clickedBlockId && clickedBlockId === editingBlockId) {
      return;
    }

    // 다른 블록 클릭 또는 빈 영역 클릭시 edit 모드 해제
    (this as any).emit('block:edit-mode:auto-exit', { 
      blockId: editingBlockId,
      reason: clickedBlockId ? 'other-block-clicked' : 'empty-area-clicked'
    });
  }

  /**
   * 현재 편집 중인 블록 ID 반환
   */
  private getCurrentEditingBlockId(): string | null {
    const allBlocks = this.getAllBlockInstances();
    for (const block of allBlocks) {
      if (block.isEditing()) {
        return block.getData().id;
      }
    }
    return null;
  }

  private delegatePointerMove(event: PointerEvent): EventDelegationResult {
    // Check if we should start a drag from potential drag
    if (this.potentialDrag && this.currentInteraction === null) {
      const deltaX = event.position.x - this.potentialDrag.startEvent.position.x;
      const deltaY = event.position.y - this.potentialDrag.startEvent.position.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > this.DRAG_THRESHOLD) {
        // Start actual drag
        this.startDragInteraction(
          this.potentialDrag.startEvent,
          this.potentialDrag.context,
          this.potentialDrag.dragType,
        );
        this.potentialDrag = null;

        // Continue with the current move event
        if (this.dragHandler && this.dragContext) {
          this.dragHandler.updateDrag(event, this.dragContext);
          return { handled: true, preventDefault: true, stopPropagation: false };
        }
      }
      return { handled: false, preventDefault: false, stopPropagation: false };
    }

    switch (this.currentInteraction) {
      case 'drag':
        if (this.dragHandler && this.dragContext) {
          this.dragHandler.updateDrag(event, this.dragContext);
          return { handled: true, preventDefault: true, stopPropagation: false };
        }
        break;

      case 'lasso':
        if (this.lassoHandler && this.lassoContext) {
          this.updateLassoInteraction(event);
          return { handled: true, preventDefault: false, stopPropagation: false };
        }
        break;
    }

    return { handled: false, preventDefault: false, stopPropagation: false };
  }

  private delegatePointerUp(event: PointerEvent): EventDelegationResult {
    // Clear potential drag if it exists (click without drag)
    if (this.potentialDrag) {
      this.potentialDrag = null;
      return { handled: true, preventDefault: false, stopPropagation: false };
    }

    switch (this.currentInteraction) {
      case 'drag':
        if (this.dragHandler && this.dragContext) {
          this.dragHandler.endDrag(event, this.dragContext);
          return { handled: true, preventDefault: true, stopPropagation: false };
        }
        break;

      case 'lasso':
        if (this.lassoHandler && this.lassoContext) {
          this.endLassoInteraction(event);
          return { handled: true, preventDefault: false, stopPropagation: false };
        }
        break;
    }

    return { handled: false, preventDefault: false, stopPropagation: false };
  }

  private delegateKeyDown(event: KeyboardEvent): EventDelegationResult {
    if (this.keyboardHandler) {
      const handled = this.keyboardHandler.onKeyDown(event);
      return { handled, preventDefault: handled, stopPropagation: false };
    }
    return { handled: false, preventDefault: false, stopPropagation: false };
  }

  private delegateKeyUp(event: KeyboardEvent): EventDelegationResult {
    if (this.keyboardHandler) {
      const handled = this.keyboardHandler.onKeyUp(event);
      return { handled, preventDefault: handled, stopPropagation: false };
    }
    return { handled: false, preventDefault: false, stopPropagation: false };
  }

  private delegateDoubleClick(
    event: PointerEvent,
    context: InteractionContext
  ): EventDelegationResult {
    if (!context.blockId) {
      return { handled: false, preventDefault: false, stopPropagation: false };
    }

    const block = this.getBlockInstance(context.blockId);
    if (!block) {
      return { handled: false, preventDefault: false, stopPropagation: false };
    }

    // Edit 모드 지원 여부 확인
    if (!block.getSupportsEditMode()) {
      return { handled: false, preventDefault: false, stopPropagation: false };
    }

    // 현재 edit 모드 상태 토글
    const isCurrentlyEditing = block.isEditing();
    const newEditingState = !isCurrentlyEditing;
    
    // Edit 모드 변경 이벤트 발생 
    (this as any).emit('block:edit-mode:toggle', {
      blockId: context.blockId,
      editing: newEditingState,
      previousEditing: isCurrentlyEditing
    });

    return { handled: true, preventDefault: true, stopPropagation: true };
  }

  // Interaction starters

  private startDragInteraction(
    event: PointerEvent,
    context: InteractionContext,
    type: 'move' | 'resize',
  ): void {
    // 편집 모드가 아니면 드래그 시작 불가
    if (!this.editorMode) {
      return;
    }

    if (!context.blockId || !this.dragHandler) {
      return;
    }

    const block = this.getBlockInstance(context.blockId);
    if (!block) return;

    const blockData = block.getData();
    const blockRect = block.getElement().getBoundingClientRect();

    // 그룹 드래그 감지 - 선택된 블록이 여러 개이고 드래그하는 블록이 선택된 상태인 경우
    const isSelected = this.selectionHandler?.isSelected(context.blockId) || false;
    const selectedIds = this.selectionHandler?.getSelectedIds() || [context.blockId];
    const isGroupDrag = isSelected && selectedIds.length > 1;

    // 그룹 드래그 시 각 블록의 시작 위치 저장 (rollback용)
    let startGroupPositions: Map<string, { x: number; y: number; zIndex: number }> | undefined;
    if (isGroupDrag) {
      startGroupPositions = new Map();
      for (const blockId of selectedIds) {
        const selectedBlock = this.getBlockInstance(blockId);
        if (selectedBlock) {
          const selectedData = selectedBlock.getData();
          startGroupPositions.set(blockId, {
            x: selectedData.position.x,
            y: selectedData.position.y,
            zIndex: selectedData.position.zIndex || 1,
          });
        }
      }
    }

    this.dragContext = {
      blockId: context.blockId,
      type,
      resizeDirection: type === 'resize' ? context.resizeDirection : undefined,
      startPosition: event.position,
      startGridPosition: { x: blockData.position.x, y: blockData.position.y, zIndex: blockData.position.zIndex || 1 },
      startGridSize: { width: blockData.size.width, height: blockData.size.height },
      offset: {
        dx: event.position.x - blockRect.left,
        dy: event.position.y - blockRect.top,
      },
      isGroupDrag,
      selectedIds: isGroupDrag ? selectedIds : [context.blockId],
      startGroupPositions,
    };

    this.currentInteraction = 'drag';
    this.dragHandler.startDrag(event, this.dragContext);
  }

  private startLassoInteraction(event: PointerEvent): void {
    // 편집 모드가 아니면 라쏘 선택 불가
    if (!this.editorMode) return;
    if (!this.lassoHandler) return;

    this.lassoContext = {
      startPosition: event.position,
      currentPosition: event.position,
      bounds: new DOMRect(event.position.x, event.position.y, 0, 0),
      isAdditive: event.modifiers.shift,
      baseSelection: new Set(), // TODO: get from selection handler
    };

    this.currentInteraction = 'lasso';
    this.lassoHandler.startLasso(event, this.lassoContext);
  }

  private updateLassoInteraction(event: PointerEvent): void {
    if (!this.lassoHandler || !this.lassoContext) return;

    this.lassoContext.currentPosition = event.position;
    this.lassoContext.bounds = this.calculateLassoBounds(
      this.lassoContext.startPosition,
      event.position,
    );

    this.lassoHandler.updateLasso(event, this.lassoContext);
  }

  private endLassoInteraction(event: PointerEvent): void {
    if (!this.lassoHandler || !this.lassoContext) return;

    this.lassoHandler.endLasso(event, this.lassoContext);
  }

  // Selection helpers

  private handleBlockSelection(blockId: string, isToggle: boolean): void {
    if (!this.editorMode || !this.selectionHandler) return;

    const context: SelectionContext = {
      blockId,
      isToggle,
      isRange: false,
    };

    if (isToggle) {
      this.selectionHandler.toggleSelection(blockId);
    } else {
      this.selectionHandler.selectBlock(context);
    }
  }

  private handleToggleSelection(blockId: string): void {
    if (!this.editorMode || !this.selectionHandler) return;
    this.selectionHandler.toggleSelection(blockId);
  }

  // Utility methods

  private normalizePointerEvent(event: MouseEvent): PointerEvent {
    return {
      position: { x: event.clientX, y: event.clientY },
      target: event.target as HTMLElement,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
      },
      native: event,
    };
  }

  private normalizeKeyboardEvent(event: globalThis.KeyboardEvent): KeyboardEvent {
    return {
      key: event.key,
      code: event.code,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
      },
      native: event,
    };
  }

  private analyzeInteractionContext(event: MouseEvent): InteractionContext {
    const target = event.target as HTMLElement;
    const blockElement = target.closest('.pegboard-block') as HTMLElement;

    let blockId: string | undefined;
    let isResizeHandle = false;
    let resizeDirection: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | undefined;
    let allowDrag = true;
    let allowResize = true;

    if (blockElement) {
      blockId = blockElement.dataset.blockId;
      isResizeHandle =
        target.classList.contains('pegboard-resize-handle') ||
        target.className.includes('pegboard-resize-handle');

      // 리사이즈 방향 추출
      if (isResizeHandle) {
        const classList = target.className;
        const directions = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
        for (const dir of directions) {
          if (classList.includes(`pegboard-resize-handle-${dir}`)) {
            resizeDirection = dir as any;
            break;
          }
        }
      }

      if (blockId) {
        const block = this.getBlockInstance(blockId);
        if (block) {
          const blockData = block.getData();
          allowDrag = blockData.movable !== false;
          allowResize = blockData.resizable !== false && isResizeHandle;
        }
      }
    }

    return {
      blockId,
      isResizeHandle,
      resizeDirection,
      isContentEditable: this.isTypingTarget(target),
      allowDrag,
      allowResize,
    };
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private calculateLassoBounds(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): DOMRect {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    return new DOMRect(left, top, width, height);
  }
}
