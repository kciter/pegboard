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

export interface BlockData {
  id: string;
  type: string;
  position: GridPosition;
  size: GridSize;
  attributes: Record<string, any>;
  movable?: boolean;
  resizable?: boolean;
}

export interface GridConfig {
  columns: number;
  rows?: number;
  rowHeight: number;
  gap: number;
}

export type DragReflowStrategy = 'none' | 'shift-down' | 'pack-top';

export interface PegboardConfig {
  container: HTMLElement;
  grid: GridConfig;
  editable?: boolean;
  allowOverlap?: boolean;
  autoArrange?: boolean;
  arrangeAnimationMs?: number;
  dragReflow?: DragReflowStrategy;
  arrangePreview?: ArrangePreviewStrategy;
  lassoSelection?: boolean; // 라쏘 선택 허용 여부(기본 false)
  keyboardMove?: boolean; // 방향키 이동 허용 여부(기본 true)
  keyboardDelete?: boolean; // Delete/Backspace 삭제 허용 여부(기본 false)
  autoGrowRows?: boolean; // true면 컨텐츠 최하단에 맞춰 rows 자동 증감(초기 rows는 minRows)
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
  'mode:changed': { mode: 'editor' | 'viewer' };
  'grid:changed': { grid: GridConfig };
  'overlap:changed': { allow: boolean };
  'block:selected': { block: BlockData | null };
  'selection:changed': { ids: string[] };
}

export interface SerializedPegboardData {
  version: number;
  grid: GridConfig;
  blocks: BlockData[];
}

// 라이브 재배치 프리뷰 전략
export type ArrangePreviewStrategy = 'none' | 'push-down';
