import type {
  GridConfig,
  GridOverlayMode,
  DragReflowStrategy,
  AutoArrangeStrategy,
} from '../types';

/**
 * 그리드 관련 설정
 */
export interface GridConfiguration extends GridConfig {
  /** 행 자동 증감 여부 */
  autoGrowRows: boolean;
  /** 최소 행 수 (autoGrowRows를 위한 baseline) */
  minRows?: number;
}

/**
 * 상호작용 관련 설정  
 */
export interface InteractionConfiguration {
  /** 블록 겹침 허용 여부 */
  allowOverlap: boolean;
  /** 라쏘 선택 허용 여부 */
  lassoSelection: boolean;
  /** 키보드 이동 허용 여부 */
  keyboardMove: boolean;
  /** 키보드 삭제 허용 여부 */
  keyboardDelete: boolean;
  /** 다른 보드로 드래그 아웃 허용 여부 */
  dragOut: boolean;
}

/**
 * 시각적 효과 관련 설정
 */
export interface VisualConfiguration {
  /** 그리드 오버레이 표시 모드 */
  gridOverlayMode: GridOverlayMode;
  /** 배치 애니메이션 지속시간 */
  arrangeAnimationMs: number;
  /** 트랜지션 설정 */
  transitionConfig?: {
    duration: number;
    easing: string;
    useTransform: boolean;
  };
}

/**
 * 동작 관련 설정
 */
export interface BehaviorConfiguration {
  /** 드래그 시 재배치 전략 */
  dragReflow: DragReflowStrategy;
  /** 자동 배치 활성화 여부 */
  autoArrange: boolean;
  /** 자동 배치 전략 */
  autoArrangeStrategy: AutoArrangeStrategy;
}

/**
 * 전체 설정 집합
 */
export interface PegboardConfiguration {
  grid: GridConfiguration;
  interaction: InteractionConfiguration;
  visual: VisualConfiguration;
  behavior: BehaviorConfiguration;
}

/**
 * 설정 변경 이벤트
 */
export interface ConfigChangeEvent<T = any> {
  type: string;
  category: keyof PegboardConfiguration;
  oldValue: T;
  newValue: T;
  timestamp: number;
}

/**
 * ConfigManager 인터페이스
 */
export interface IConfigManager {
  // 전체 설정 접근
  getConfiguration(): Readonly<PegboardConfiguration>;
  updateConfiguration(updates: Partial<PegboardConfiguration>): void;

  // 카테고리별 설정 접근
  getGridConfig(): Readonly<GridConfiguration>;
  updateGridConfig(updates: Partial<GridConfiguration>): void;

  getInteractionConfig(): Readonly<InteractionConfiguration>;
  updateInteractionConfig(updates: Partial<InteractionConfiguration>): void;

  getVisualConfig(): Readonly<VisualConfiguration>;
  updateVisualConfig(updates: Partial<VisualConfiguration>): void;

  getBehaviorConfig(): Readonly<BehaviorConfiguration>;
  updateBehaviorConfig(updates: Partial<BehaviorConfiguration>): void;

  // 개별 설정 접근 (편의 메서드)
  get<T>(category: keyof PegboardConfiguration, key: string): T | undefined;
  set<T>(category: keyof PegboardConfiguration, key: string, value: T): void;

  // 이벤트 구독
  on(event: string, callback: (event: ConfigChangeEvent) => void): void;
  off(event: string, callback: (event: ConfigChangeEvent) => void): void;

  // 설정 초기화
  reset(): void;
  resetCategory(category: keyof PegboardConfiguration): void;

  // 검증
  validate(): { valid: boolean; errors: string[] };
}