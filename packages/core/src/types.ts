export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GridPosition {
  x: number;
  y: number;
  zIndex: number;
}

export interface GridSize {
  width: number;
  height: number;
}

export interface GridSizeConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface BlockData<Attrs extends Record<string, any> = Record<string, any>> {
  id: string;
  type: string;
  position: GridPosition;
  constraints?: GridSizeConstraints;
  size: GridSize;
  attributes: Attrs;
  movable?: boolean;
  resizable?: boolean;
}

export interface GridConfig {
  columns: number;
  rows?: number;
  rowHeight: number;
  gap: number;
}

export type DragReflowStrategy = 'none' | 'axis-shift';
export type AutoArrangeStrategy = 'top-left' | 'masonry' | 'by-row' | 'by-column';
export type GridOverlayMode = 'always' | 'never' | 'active';

export interface PegboardConfig {
  container: HTMLElement;
  grid: GridConfig;
  editable?: boolean;
  allowOverlap?: boolean;
  // 다른 Pegboard로 블록을 드래그-아웃(이동) 허용 여부
  dragOut?: boolean;
  autoArrange?: boolean;
  autoArrangeStrategy?: AutoArrangeStrategy;
  arrangeAnimationMs?: number;
  dragReflow?: DragReflowStrategy;
  arrangePreview?: ArrangePreviewStrategy;
  lassoSelection?: boolean; // 라쏘 선택 허용 여부(기본 false)
  keyboardMove?: boolean; // 방향키 이동 허용 여부(기본 true)
  keyboardDelete?: boolean; // Delete/Backspace 삭제 허용 여부(기본 false)
  autoGrowRows?: boolean; // true면 컨텐츠 최하단에 맞춰 rows 자동 증감(초기 rows는 minRows)
  gridOverlayMode?: GridOverlayMode; // 'always' | 'never' | 'active'
}

export interface DragState {
  isDragging: boolean;
  dragType: 'move' | 'resize';
  startPosition: Position;
  startSize?: Size;
  targetBlockId?: string;
  resizeDirection?: string;
  columnWidth?: number; // 실질 column content width
  rowUnit?: number; // rowHeight + gap
  cellTotalWidth?: number; // columnWidth + gap
}

export type EventCallback<T = any> = (data: T) => void;

export interface EventMap {
  'block:added': { block: BlockData };
  'block:removed': { blockId: string };
  'block:moved': { block: BlockData; oldPosition: GridPosition };
  'block:resized': { block: BlockData; oldSize: GridSize };
  'block:updated': { block: BlockData };
  'editable:changed': { editable: boolean };
  'grid:changed': { grid: GridConfig };
  'overlap:changed': { allow: boolean };
  'block:selected': { block: BlockData | null };
  'selection:changed': { ids: string[] };
  'block:edit:entered': { block: BlockData };
  'block:edit:exited': { block: BlockData };
  'interaction:active': { mode: 'move' | 'resize' };
  'interaction:idle': {};
  'interaction:active:changed': { isActive: boolean };
  'visual:changed': { visual: any };
  'grid:autoGrowRows:changed': { enabled: boolean };
  // optional: emitted when a drag reflow is applied or fails
  'reflow:applied'?: {
    strategy: DragReflowStrategy;
    moved: Array<{ id: string; from: GridPosition; to: GridPosition }>;
    anchorId: string;
  };
  'reflow:failed'?: { strategy: DragReflowStrategy; reason?: string; anchorId: string };
  
}

export interface SerializedPegboardData {
  version: number;
  grid: GridConfig;
  blocks: BlockData[];
}

// 라이브 재배치 프리뷰 전략
export type ArrangePreviewStrategy = 'none' | 'push-down';
