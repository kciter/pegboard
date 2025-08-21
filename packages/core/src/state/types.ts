import type { Block } from '../Block';
import type { 
  GridConfig, 
  GridOverlayMode, 
  DragReflowStrategy, 
  AutoArrangeStrategy 
} from '../types';

/**
 * UI 상태 - 에디터 조작에 필요한 상태
 */
export interface UIState {
  /** 편집 모드 여부 */
  editable: boolean;
  /** 현재 편집 중인 블록 ID */
  editingBlockId: string | null;
  /** 현재 선택된 블록 ID */
  selectedBlockId: string | null;
  /** 드래그/리사이즈 등 상호작용 진행 중 여부 */
  isInteractionActive: boolean;
  /** 다음 사용할 z-index 값 */
  nextZIndex: number;
  /** 자동 배치 진행 중 여부 */
  isArranging: boolean;
}

/**
 * 데이터 상태 - 최종적으로 UI에 보여줄 상태이자 결과물
 */
export interface DataState {
  /** 블록 데이터 맵 */
  blocks: Map<string, Block>;
  /** 그리드 설정 */
  grid: GridConfig;
  /** 최소 행 수 (autoGrowRows를 위한 baseline) */
  minRows?: number;
}

/**
 * 설정 상태 - 에디터 동작 방식을 결정하는 설정들
 */
export interface ConfigState {
  /** 블록 겹침 허용 여부 */
  allowOverlap: boolean;
  /** 라쏘 선택 허용 여부 */
  lassoSelection: boolean;
  /** 키보드 이동 허용 여부 */
  keyboardMove: boolean;
  /** 키보드 삭제 허용 여부 */
  keyboardDelete: boolean;
  /** 행 자동 증감 여부 */
  autoGrowRows: boolean;
  /** 그리드 오버레이 표시 모드 */
  gridOverlayMode: GridOverlayMode;
  /** 드래그 시 재배치 전략 */
  dragReflow: DragReflowStrategy;
  /** 자동 배치 활성화 여부 */
  autoArrange: boolean;
  /** 자동 배치 전략 */
  autoArrangeStrategy: AutoArrangeStrategy;
  /** 배치 애니메이션 지속시간 */
  arrangeAnimationMs: number;
  /** 다른 보드로 드래그 아웃 허용 여부 */
  dragOut: boolean;
}

/**
 * 상태 변경 이벤트 타입
 */
export interface StateChangeEvent<T = any> {
  type: string;
  oldValue: T;
  newValue: T;
  timestamp: number;
}

/**
 * StateManager 인터페이스
 */
export interface IStateManager {
  // UI 상태 접근
  getUIState(): Readonly<UIState>;
  updateUIState(updates: Partial<UIState>): void;

  // 데이터 상태 접근
  getDataState(): Readonly<DataState>;
  updateDataState(updates: Partial<DataState>): void;

  // 설정 상태 접근
  getConfigState(): Readonly<ConfigState>;
  updateConfigState(updates: Partial<ConfigState>): void;

  // 이벤트 구독
  on(event: string, callback: (event: StateChangeEvent) => void): void;
  off(event: string, callback: (event: StateChangeEvent) => void): void;

  // 상태 초기화
  reset(): void;

  // 디버깅용
  getFullState(): {
    ui: UIState;
    data: DataState;
    config: ConfigState;
  };
}