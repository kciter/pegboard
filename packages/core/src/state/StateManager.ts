import { EventEmitter } from '../EventEmitter';
import type { 
  IStateManager, 
  UIState, 
  DataState, 
  ConfigState, 
  StateChangeEvent 
} from './types';
import type { GridConfig } from '../types';

/**
 * StateManager 구현체
 * UI 상태, 데이터 상태, 설정 상태를 분리하여 관리
 */
export class StateManager extends EventEmitter {
  private uiState: UIState;
  private dataState: DataState;
  private configState: ConfigState;

  constructor(
    initialGridConfig: GridConfig,
    initialConfigState?: Partial<ConfigState>,
    initialUIState?: Partial<UIState>
  ) {
    super();

    // UI 상태 초기화
    this.uiState = {
      editable: initialUIState?.editable ?? true,
      editingBlockId: null,
      selectedBlockId: null,
      isInteractionActive: false,
      nextZIndex: 1,
      isArranging: false,
    };

    // 데이터 상태 초기화
    this.dataState = {
      blocks: new Map(),
      grid: { ...initialGridConfig },
      minRows: initialGridConfig.rows,
    };

    // 설정 상태 초기화
    this.configState = {
      allowOverlap: false,
      lassoSelection: false,
      keyboardMove: true,
      keyboardDelete: false,
      autoGrowRows: false,
      gridOverlayMode: 'always',
      dragReflow: 'none',
      autoArrange: false,
      autoArrangeStrategy: 'top-left',
      arrangeAnimationMs: 160,
      dragOut: false,
      ...initialConfigState,
    };
  }

  // UI 상태 관리
  getUIState(): Readonly<UIState> {
    return { ...this.uiState };
  }

  updateUIState(updates: Partial<UIState>): void {
    const oldState = { ...this.uiState };
    const newState = { ...this.uiState, ...updates };
    
    // 실제로 변경된 항목들만 처리
    const changes: Array<{ key: keyof UIState; oldValue: any; newValue: any }> = [];
    
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        const typedKey = key as keyof UIState;
        if (oldState[typedKey] !== newState[typedKey]) {
          changes.push({
            key: typedKey,
            oldValue: oldState[typedKey],
            newValue: newState[typedKey],
          });
        }
      }
    }

    if (changes.length === 0) return; // 변경사항 없음

    this.uiState = newState;

    // 각 변경사항에 대해 이벤트 발생
    for (const change of changes) {
      const event: StateChangeEvent = {
        type: `ui:${change.key}:changed`,
        oldValue: change.oldValue,
        newValue: change.newValue,
        timestamp: Date.now(),
      };
      (this as any).emit(event.type, event);
    }

    // 전체 UI 상태 변경 이벤트
    (this as any).emit('ui:state:changed', {
      type: 'ui:state:changed',
      oldValue: oldState,
      newValue: newState,
      timestamp: Date.now(),
    });
  }

  // 데이터 상태 관리
  getDataState(): Readonly<DataState> {
    return {
      blocks: new Map(this.dataState.blocks),
      grid: { ...this.dataState.grid },
      minRows: this.dataState.minRows,
    };
  }

  updateDataState(updates: Partial<DataState>): void {
    const oldState = { ...this.dataState };
    const newState = { ...this.dataState };

    if (updates.blocks !== undefined) {
      newState.blocks = new Map(updates.blocks);
    }
    if (updates.grid !== undefined) {
      newState.grid = { ...updates.grid };
    }
    if (updates.minRows !== undefined) {
      newState.minRows = updates.minRows;
    }

    this.dataState = newState;

    // 데이터 상태 변경 이벤트
    (this as any).emit('data:state:changed', {
      type: 'data:state:changed',
      oldValue: oldState,
      newValue: newState,
      timestamp: Date.now(),
    });

    // 구체적인 변경사항별 이벤트
    if (updates.blocks !== undefined) {
      (this as any).emit('data:blocks:changed', {
        type: 'data:blocks:changed',
        oldValue: oldState.blocks,
        newValue: newState.blocks,
        timestamp: Date.now(),
      });
    }

    if (updates.grid !== undefined) {
      (this as any).emit('data:grid:changed', {
        type: 'data:grid:changed',
        oldValue: oldState.grid,
        newValue: newState.grid,
        timestamp: Date.now(),
      });
    }
  }

  // 설정 상태 관리
  getConfigState(): Readonly<ConfigState> {
    return { ...this.configState };
  }

  updateConfigState(updates: Partial<ConfigState>): void {
    const oldState = { ...this.configState };
    const newState = { ...this.configState, ...updates };

    // 실제로 변경된 항목들만 처리
    const changes: Array<{ key: keyof ConfigState; oldValue: any; newValue: any }> = [];
    
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        const typedKey = key as keyof ConfigState;
        if (oldState[typedKey] !== newState[typedKey]) {
          changes.push({
            key: typedKey,
            oldValue: oldState[typedKey],
            newValue: newState[typedKey],
          });
        }
      }
    }

    if (changes.length === 0) return; // 변경사항 없음

    this.configState = newState;

    // 각 변경사항에 대해 이벤트 발생
    for (const change of changes) {
      const event: StateChangeEvent = {
        type: `config:${change.key}:changed`,
        oldValue: change.oldValue,
        newValue: change.newValue,
        timestamp: Date.now(),
      };
      (this as any).emit(event.type, event);
    }

    // 전체 설정 상태 변경 이벤트
    (this as any).emit('config:state:changed', {
      type: 'config:state:changed',
      oldValue: oldState,
      newValue: newState,
      timestamp: Date.now(),
    });
  }

  // 상태 초기화
  reset(): void {
    const oldFullState = this.getFullState();

    // 상태들을 초기값으로 리셋
    this.uiState = {
      editable: true,
      editingBlockId: null,
      selectedBlockId: null,
      isInteractionActive: false,
      nextZIndex: 1,
      isArranging: false,
    };

    this.dataState.blocks.clear();
    // grid는 완전히 리셋하지 않고 blocks만 클리어

    // 리셋 이벤트 발생
    (this as any).emit('state:reset', {
      type: 'state:reset',
      oldValue: oldFullState,
      newValue: this.getFullState(),
      timestamp: Date.now(),
    });
  }

  // 전체 상태 조회 (디버깅용)
  getFullState() {
    return {
      ui: this.getUIState(),
      data: this.getDataState(),
      config: this.getConfigState(),
    };
  }

  // 편의 메서드들
  
  /**
   * 다음 사용할 z-index 값을 가져오고 증가시킴
   */
  getNextZIndex(): number {
    const current = this.uiState.nextZIndex;
    this.updateUIState({ nextZIndex: current + 1 });
    return current;
  }

  /**
   * z-index 값을 재동기화 (현재 블록들의 최대값 + 1로 설정)
   */
  syncNextZIndex(): void {
    let maxZ = 0;
    for (const block of this.dataState.blocks.values()) {
      maxZ = Math.max(maxZ, block.getData().position.zIndex);
    }
    this.updateUIState({ nextZIndex: Math.max(this.uiState.nextZIndex, maxZ + 1) });
  }

  /**
   * 편집 모드 변경 시 필요한 UI 상태 일괄 업데이트
   */
  setEditableMode(editable: boolean): void {
    const updates: Partial<UIState> = { editable };
    
    // 편집 모드 종료 시 편집 중인 블록도 해제
    if (!editable && this.uiState.editingBlockId) {
      updates.editingBlockId = null;
    }
    
    this.updateUIState(updates);
  }
}