/**
 * Event handling types for UIEventListener system
 */

export interface PointerPosition {
  x: number;
  y: number;
}

export interface PointerEvent {
  position: PointerPosition;
  target: HTMLElement;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
  };
  native: MouseEvent;
}

export interface KeyboardEvent {
  key: string;
  code: string;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
  };
  native: globalThis.KeyboardEvent;
}

export interface InteractionContext {
  blockId?: string;
  isResizeHandle: boolean;
  resizeDirection?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
  isContentEditable: boolean;
  allowDrag: boolean;
  allowResize: boolean;
}

export interface DragContext {
  blockId: string;
  type: 'move' | 'resize';
  resizeDirection?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
  startPosition: PointerPosition;
  startGridPosition: { x: number; y: number; zIndex: number };
  startGridSize: { width: number; height: number };
  offset: { dx: number; dy: number };
  isGroupDrag: boolean;
  selectedIds: string[];
  // 그룹 드래그 시 각 블록의 시작 위치 저장 (rollback용)
  startGroupPositions?: Map<string, { x: number; y: number; zIndex: number }>;
  // 리사이즈 시 최종 계산된 위치와 크기 저장
  finalPosition?: { x: number; y: number; zIndex: number };
  finalSize?: { width: number; height: number };
}

export interface LassoContext {
  startPosition: PointerPosition;
  currentPosition: PointerPosition;
  bounds: DOMRect;
  isAdditive: boolean;
  baseSelection: Set<string>;
}

export interface SelectionContext {
  blockId: string;
  isToggle: boolean;
  isRange: boolean;
  fromBlockId?: string;
}

/**
 * Event handler interfaces
 */
export interface IPointerHandler {
  onPointerDown(event: PointerEvent, context: InteractionContext): boolean;
  onPointerMove(event: PointerEvent): boolean;
  onPointerUp(event: PointerEvent): boolean;
}

export interface IKeyboardHandler {
  onKeyDown(event: KeyboardEvent): boolean;
  onKeyUp(event: KeyboardEvent): boolean;
}

export interface IDragHandler extends IPointerHandler {
  startDrag(event: PointerEvent, context: DragContext): void;
  updateDrag(event: PointerEvent, context: DragContext): void;
  endDrag(event: PointerEvent, context: DragContext): void;
  cancelDrag(): void;
}

export interface ISelectionHandler {
  selectBlock(context: SelectionContext): void;
  clearSelection(): void;
  toggleSelection(blockId: string): void;
  selectRange(fromId: string, toId: string): void;
  selectAll(): void;
  
  // State queries for drag handler
  getSelectedIds(): string[];
  getPrimaryId(): string | null;
  isSelected(blockId: string): boolean;
  getSelectionCount(): number;
  isMultipleSelection(): boolean;
}

export interface ILassoHandler extends IPointerHandler {
  startLasso(event: PointerEvent, context: LassoContext): void;
  updateLasso(event: PointerEvent, context: LassoContext): void;
  endLasso(event: PointerEvent, context: LassoContext): void;
  cancelLasso(): void;
}

/**
 * Main UIEventListener interface
 */
export interface IUIEventListener {
  // Handler registration
  setDragHandler(handler: IDragHandler): void;
  setSelectionHandler(handler: ISelectionHandler): void;
  setLassoHandler(handler: ILassoHandler): void;
  setKeyboardHandler(handler: IKeyboardHandler): void;

  // State queries
  isDragging(): boolean;
  isLassoSelecting(): boolean;
  getActiveInteraction(): 'drag' | 'lasso' | 'selection' | null;

  // Configuration
  setEditorMode(enabled: boolean): void;
  setLassoEnabled(enabled: boolean): void;
  setKeyboardEnabled(enabled: boolean): void;

  // Lifecycle
  enable(): void;
  disable(): void;
  destroy(): void;
}

/**
 * Event delegation result
 */
export interface EventDelegationResult {
  handled: boolean;
  preventDefault: boolean;
  stopPropagation: boolean;
}