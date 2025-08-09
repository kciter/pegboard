export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GridPosition {
  column: number;
  row: number;
  zIndex: number;
}

export interface GridSize {
  columnSpan: number;
  rowSpan: number;
}

export interface BlockData {
  id: string;
  type: string;
  gridPosition: GridPosition;
  gridSize: GridSize;
  attributes: Record<string, any>;
  groupId?: string;
  // per-block interaction flags (undefined => allowed)
  movable?: boolean;
  resizable?: boolean;
}

export interface GridConfig {
  columns: number;
  rowHeight: number;
  gap: number;
}

export interface PegboardConfig {
  container: HTMLElement;
  grid: GridConfig;
  mode: 'editor' | 'viewer';
  allowOverlap?: boolean; // 블럭 겹침 허용 여부 (기본 false)
  autoArrange?: boolean; // 드롭 시 자동 정렬(패킹) 여부
  arrangeAnimationMs?: number; // 자동 정렬 애니메이션 시간(ms)
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
