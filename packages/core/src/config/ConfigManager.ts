import { EventEmitter } from '../EventEmitter';
import type {
  IConfigManager,
  PegboardConfiguration,
  GridConfiguration,
  InteractionConfiguration,
  VisualConfiguration,
  BehaviorConfiguration,
  ConfigChangeEvent,
} from './types';
import type { PegboardConfig } from '../types';

/**
 * ConfigManager 구현체
 * 설정들을 카테고리별로 그룹화하여 관리
 */
export class ConfigManager extends EventEmitter {
  private configuration: PegboardConfiguration;
  private readonly defaultConfiguration: PegboardConfiguration;

  constructor(initialConfig?: Partial<PegboardConfig>) {
    super();

    // 기본 설정 정의
    this.defaultConfiguration = {
      grid: {
        columns: initialConfig?.grid?.columns || 12,
        rows: initialConfig?.grid?.rows || 8,
        rowHeight: initialConfig?.grid?.rowHeight || 100,
        gap: initialConfig?.grid?.gap || 8,
        autoGrowRows: initialConfig?.autoGrowRows || false,
        minRows: initialConfig?.grid?.rows,
      },
      interaction: {
        allowOverlap: initialConfig?.allowOverlap || false,
        lassoSelection: initialConfig?.lassoSelection || false,
        keyboardMove: initialConfig?.keyboardMove || true,
        keyboardDelete: initialConfig?.keyboardDelete || false,
        dragOut: (initialConfig as any)?.dragOut || false,
      },
      visual: {
        gridOverlayMode: initialConfig?.gridOverlayMode || 'always',
        arrangeAnimationMs: initialConfig?.arrangeAnimationMs || 160,
        transitionConfig: {
          duration: 220,
          easing: 'transform 160ms ease',
          useTransform: true,
        },
      },
      behavior: {
        dragReflow: initialConfig?.dragReflow || 'none',
        autoArrange: initialConfig?.autoArrange || false,
        autoArrangeStrategy: initialConfig?.autoArrangeStrategy || 'top-left',
      },
    };

    // 현재 설정을 기본값으로 초기화
    this.configuration = this.deepClone(this.defaultConfiguration);
  }

  // 전체 설정 관리
  getConfiguration(): Readonly<PegboardConfiguration> {
    return this.deepClone(this.configuration);
  }

  updateConfiguration(updates: Partial<PegboardConfiguration>): void {
    const oldConfig = this.deepClone(this.configuration);
    
    // 각 카테고리별로 업데이트 처리
    if (updates.grid) {
      this.configuration.grid = { ...this.configuration.grid, ...updates.grid };
    }
    if (updates.interaction) {
      this.configuration.interaction = { ...this.configuration.interaction, ...updates.interaction };
    }
    if (updates.visual) {
      this.configuration.visual = { ...this.configuration.visual, ...updates.visual };
    }
    if (updates.behavior) {
      this.configuration.behavior = { ...this.configuration.behavior, ...updates.behavior };
    }

    // 변경 이벤트 발생
    this.emitConfigurationChanged(oldConfig, this.configuration);
  }

  // 그리드 설정 관리
  getGridConfig(): Readonly<GridConfiguration> {
    return { ...this.configuration.grid };
  }

  updateGridConfig(updates: Partial<GridConfiguration>): void {
    const oldConfig = { ...this.configuration.grid };
    const newConfig = { ...this.configuration.grid, ...updates };
    
    // minRows 자동 업데이트 (rows가 명시적으로 설정되면)
    if (updates.rows !== undefined) {
      newConfig.minRows = updates.rows;
    }

    this.configuration.grid = newConfig;

    this.emitCategoryChanged('grid', oldConfig, newConfig);
  }

  // 상호작용 설정 관리
  getInteractionConfig(): Readonly<InteractionConfiguration> {
    return { ...this.configuration.interaction };
  }

  updateInteractionConfig(updates: Partial<InteractionConfiguration>): void {
    const oldConfig = { ...this.configuration.interaction };
    const newConfig = { ...this.configuration.interaction, ...updates };
    
    this.configuration.interaction = newConfig;

    this.emitCategoryChanged('interaction', oldConfig, newConfig);
  }

  // 시각적 효과 설정 관리
  getVisualConfig(): Readonly<VisualConfiguration> {
    return { ...this.configuration.visual };
  }

  updateVisualConfig(updates: Partial<VisualConfiguration>): void {
    const oldConfig = { ...this.configuration.visual };
    const newConfig = { ...this.configuration.visual, ...updates };
    
    this.configuration.visual = newConfig;

    this.emitCategoryChanged('visual', oldConfig, newConfig);
  }

  // 동작 설정 관리
  getBehaviorConfig(): Readonly<BehaviorConfiguration> {
    return { ...this.configuration.behavior };
  }

  updateBehaviorConfig(updates: Partial<BehaviorConfiguration>): void {
    const oldConfig = { ...this.configuration.behavior };
    const newConfig = { ...this.configuration.behavior, ...updates };
    
    this.configuration.behavior = newConfig;

    this.emitCategoryChanged('behavior', oldConfig, newConfig);
  }

  // 개별 설정 접근 (편의 메서드)
  get<T>(category: keyof PegboardConfiguration, key: string): T | undefined {
    const categoryConfig = this.configuration[category] as any;
    return categoryConfig ? categoryConfig[key] : undefined;
  }

  set<T>(category: keyof PegboardConfiguration, key: string, value: T): void {
    const categoryConfig = this.configuration[category] as any;
    if (!categoryConfig) return;

    const oldValue = categoryConfig[key];
    categoryConfig[key] = value;

    // 개별 속성 변경 이벤트
    (this as any).emit(`config:${category}:${key}:changed`, {
      type: `config:${category}:${key}:changed`,
      category,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    });
  }

  // 설정 초기화
  reset(): void {
    const oldConfig = this.deepClone(this.configuration);
    this.configuration = this.deepClone(this.defaultConfiguration);
    
    (this as any).emit('config:reset', {
      type: 'config:reset',
      category: 'grid', // placeholder
      oldValue: oldConfig,
      newValue: this.configuration,
      timestamp: Date.now(),
    });
  }

  resetCategory(category: keyof PegboardConfiguration): void {
    const oldValue = this.deepClone(this.configuration[category]);
    (this.configuration[category] as any) = this.deepClone(this.defaultConfiguration[category]);
    
    this.emitCategoryChanged(category, oldValue, this.configuration[category]);
  }

  // 설정 검증
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 그리드 설정 검증
    const grid = this.configuration.grid;
    if (grid.columns <= 0) errors.push('Grid columns must be greater than 0');
    if (grid.rows !== undefined && grid.rows <= 0) errors.push('Grid rows must be greater than 0');
    if (grid.rowHeight <= 0) errors.push('Grid rowHeight must be greater than 0');
    if (grid.gap < 0) errors.push('Grid gap must be non-negative');

    // 시각적 효과 설정 검증
    const visual = this.configuration.visual;
    if (visual.arrangeAnimationMs < 0) errors.push('arrangeAnimationMs must be non-negative');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // 편의 메서드들

  /**
   * 레거시 PegboardConfig 형태로 내보내기
   */
  toLegacyConfig(): Partial<PegboardConfig> {
    const config = this.configuration;
    return {
      grid: {
        columns: config.grid.columns,
        rows: config.grid.rows,
        rowHeight: config.grid.rowHeight,
        gap: config.grid.gap,
      },
      allowOverlap: config.interaction.allowOverlap,
      lassoSelection: config.interaction.lassoSelection,
      keyboardMove: config.interaction.keyboardMove,
      keyboardDelete: config.interaction.keyboardDelete,
      autoGrowRows: config.grid.autoGrowRows,
      gridOverlayMode: config.visual.gridOverlayMode,
      dragReflow: config.behavior.dragReflow,
      autoArrange: config.behavior.autoArrange,
      autoArrangeStrategy: config.behavior.autoArrangeStrategy,
      arrangeAnimationMs: config.visual.arrangeAnimationMs,
      dragOut: config.interaction.dragOut,
    };
  }

  /**
   * 특정 카테고리가 기본값과 다른지 확인
   */
  isModified(category?: keyof PegboardConfiguration): boolean {
    if (category) {
      return JSON.stringify(this.configuration[category]) !== 
             JSON.stringify(this.defaultConfiguration[category]);
    }
    return JSON.stringify(this.configuration) !== JSON.stringify(this.defaultConfiguration);
  }

  // Private 메서드들

  private emitConfigurationChanged(
    oldConfig: PegboardConfiguration, 
    newConfig: PegboardConfiguration
  ): void {
    (this as any).emit('config:changed', {
      type: 'config:changed',
      category: 'grid', // placeholder  
      oldValue: oldConfig,
      newValue: newConfig,
      timestamp: Date.now(),
    });
  }

  private emitCategoryChanged<T>(
    category: keyof PegboardConfiguration,
    oldValue: T,
    newValue: T
  ): void {
    (this as any).emit(`config:${category}:changed`, {
      type: `config:${category}:changed`,
      category,
      oldValue,
      newValue,
      timestamp: Date.now(),
    });
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}