import { EventEmitter } from '../EventEmitter';
import { Block } from '../Block';

export interface SelectionState {
  /** 현재 포커스된 블록 (주 선택) */
  primary: string | null;
  /** 선택된 모든 블록 ID들 */
  selected: Set<string>;
  /** 선택 모드 */
  mode: 'single' | 'multiple';
}

export interface SelectionChangeEvent {
  type: 'selection:changed' | 'selection:primary:changed';
  oldSelection: string[];
  newSelection: string[];
  primaryId: string | null;
  timestamp: number;
}

/**
 * SelectionManager: 블록 선택 상태를 관리
 * - 단일/다중 선택 지원
 * - 라쏘 선택 지원
 * - 키보드 네비게이션 지원
 */
export class SelectionManager extends EventEmitter {
  private state: SelectionState = {
    primary: null,
    selected: new Set(),
    mode: 'single',
  };

  constructor(
    private getBlockInstance: (id: string) => Block | null,
    private getAllBlockInstances: () => Block[]
  ) {
    super();
  }

  // 기본 선택 조작

  /**
   * 단일 블록 선택
   */
  selectSingle(blockId: string | null): boolean {
    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    // 모든 선택 해제
    this.clearSelection(false);

    if (blockId) {
      const block = this.getBlockInstance(blockId);
      if (!block) return false;

      this.state.primary = blockId;
      this.state.selected.add(blockId);
      this.state.mode = 'single';

      this.updateBlockSelectionState(block, true);
    }

    this.emitSelectionChanged(oldSelection, oldPrimary);
    return true;
  }

  /**
   * 다중 선택에 블록 추가/제거 (토글)
   */
  toggleSelection(blockId: string): boolean {
    const block = this.getBlockInstance(blockId);
    if (!block) return false;

    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    if (this.state.selected.has(blockId)) {
      // 선택 해제
      this.state.selected.delete(blockId);
      this.updateBlockSelectionState(block, false);

      // 주 선택이었다면 다른 블록으로 변경
      if (this.state.primary === blockId) {
        const remaining = Array.from(this.state.selected);
        this.state.primary = remaining.length > 0 ? remaining[0] || null : null;
      }
    } else {
      // 선택 추가
      this.state.selected.add(blockId);
      this.state.primary = blockId; // 새로 선택된 블록을 주 선택으로
      this.updateBlockSelectionState(block, true);
      this.state.mode = 'multiple';
    }

    this.emitSelectionChanged(oldSelection, oldPrimary);
    return true;
  }

  /**
   * 범위 선택 (Shift + 클릭)
   */
  selectRange(fromId: string, toId: string): boolean {
    const allBlocks = this.getAllBlockInstances();
    const fromIndex = allBlocks.findIndex(b => b.getData().id === fromId);
    const toIndex = allBlocks.findIndex(b => b.getData().id === toId);

    if (fromIndex === -1 || toIndex === -1) return false;

    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);

    // 범위 내 모든 블록 선택
    for (let i = startIndex; i <= endIndex; i++) {
      const block = allBlocks[i];
      if (!block) continue;
      
      const blockId = block.getData().id;
      
      if (!this.state.selected.has(blockId)) {
        this.state.selected.add(blockId);
        this.updateBlockSelectionState(block, true);
      }
    }

    this.state.primary = toId;
    this.state.mode = 'multiple';

    this.emitSelectionChanged(oldSelection, oldPrimary);
    return true;
  }

  /**
   * 라쏘 선택 (영역 내 모든 블록 선택)
   */
  selectInBounds(
    bounds: { left: number; top: number; width: number; height: number },
    additive = false
  ): boolean {
    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    // 비추가적 모드면 기존 선택 해제
    if (!additive) {
      this.clearSelection(false);
    }

    const containerRect = this.getContainerRect();
    if (!containerRect) return false;

    const globalBounds = new DOMRect(
      bounds.left + containerRect.left,
      bounds.top + containerRect.top,
      bounds.width,
      bounds.height
    );

    let selectedAny = false;

    // 영역과 겹치는 모든 블록 찾기
    for (const block of this.getAllBlockInstances()) {
      const blockRect = block.getBoundingRect();
      const overlap = !(
        blockRect.right < globalBounds.left ||
        blockRect.left > globalBounds.right ||
        blockRect.bottom < globalBounds.top ||
        blockRect.top > globalBounds.bottom
      );

      if (overlap) {
        const blockId = block.getData().id;
        if (!this.state.selected.has(blockId)) {
          this.state.selected.add(blockId);
          this.updateBlockSelectionState(block, true);
          selectedAny = true;

          // 첫 번째 선택된 블록을 주 선택으로
          if (!this.state.primary) {
            this.state.primary = blockId;
          }
        }
      }
    }

    if (selectedAny) {
      this.state.mode = this.state.selected.size > 1 ? 'multiple' : 'single';
      this.emitSelectionChanged(oldSelection, oldPrimary);
    }

    return selectedAny;
  }

  /**
   * 모든 선택 해제
   */
  clearSelection(emit = true): void {
    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    // 모든 블록의 선택 상태 해제
    for (const blockId of this.state.selected) {
      const block = this.getBlockInstance(blockId);
      if (block) {
        this.updateBlockSelectionState(block, false);
      }
    }

    this.state.primary = null;
    this.state.selected.clear();
    this.state.mode = 'single';

    if (emit) {
      this.emitSelectionChanged(oldSelection, oldPrimary);
    }
  }

  /**
   * 전체 선택
   */
  selectAll(): void {
    const oldSelection = Array.from(this.state.selected);
    const oldPrimary = this.state.primary;

    this.clearSelection(false);

    const allBlocks = this.getAllBlockInstances();
    if (allBlocks.length === 0) return;

    for (const block of allBlocks) {
      const blockId = block.getData().id;
      this.state.selected.add(blockId);
      this.updateBlockSelectionState(block, true);
    }

    this.state.primary = allBlocks[0]?.getData().id || null;
    this.state.mode = allBlocks.length > 1 ? 'multiple' : 'single';

    this.emitSelectionChanged(oldSelection, oldPrimary);
  }

  // 선택 상태 조회

  /**
   * 현재 선택 상태 조회
   */
  getSelection(): Readonly<SelectionState> {
    return {
      primary: this.state.primary,
      selected: new Set(this.state.selected),
      mode: this.state.mode,
    };
  }

  /**
   * 선택된 블록 ID들 조회
   */
  getSelectedIds(): string[] {
    return Array.from(this.state.selected);
  }

  /**
   * 주 선택 블록 ID 조회
   */
  getPrimaryId(): string | null {
    return this.state.primary;
  }

  /**
   * 블록이 선택되었는지 확인
   */
  isSelected(blockId: string): boolean {
    return this.state.selected.has(blockId);
  }

  /**
   * 블록이 주 선택인지 확인
   */
  isPrimary(blockId: string): boolean {
    return this.state.primary === blockId;
  }

  /**
   * 선택된 블록 수 조회
   */
  getSelectionCount(): number {
    return this.state.selected.size;
  }

  /**
   * 다중 선택 모드인지 확인
   */
  isMultipleSelection(): boolean {
    return this.state.mode === 'multiple';
  }

  // 키보드 네비게이션

  /**
   * 다음 블록 선택 (Tab 또는 화살표)
   */
  selectNext(): boolean {
    const allBlocks = this.getAllBlockInstances();
    if (allBlocks.length === 0) return false;

    const currentIndex = this.state.primary ? 
      allBlocks.findIndex(b => b.getData().id === this.state.primary) : -1;
    
    const nextIndex = (currentIndex + 1) % allBlocks.length;
    const nextBlockId = allBlocks[nextIndex]?.getData().id;

    return nextBlockId ? this.selectSingle(nextBlockId) : false;
  }

  /**
   * 이전 블록 선택 (Shift+Tab 또는 화살표)
   */
  selectPrevious(): boolean {
    const allBlocks = this.getAllBlockInstances();
    if (allBlocks.length === 0) return false;

    const currentIndex = this.state.primary ? 
      allBlocks.findIndex(b => b.getData().id === this.state.primary) : 0;
    
    const prevIndex = currentIndex === 0 ? allBlocks.length - 1 : currentIndex - 1;
    const prevBlockId = allBlocks[prevIndex]?.getData().id;

    return prevBlockId ? this.selectSingle(prevBlockId) : false;
  }

  // Private 메서드들

  private updateBlockSelectionState(block: Block, selected: boolean): void {
    block.setSelected(selected);
  }

  private emitSelectionChanged(oldSelection: string[], oldPrimary: string | null): void {
    const newSelection = Array.from(this.state.selected);
    
    // 선택이 실제로 변경되었는지 확인
    const selectionChanged = 
      oldSelection.length !== newSelection.length ||
      !oldSelection.every(id => this.state.selected.has(id));

    const primaryChanged = oldPrimary !== this.state.primary;

    if (selectionChanged) {
      (this as any).emit('selection:changed', {
        oldSelection,
        newSelection,
        primaryId: this.state.primary,
      });
    }

    if (primaryChanged) {
      (this as any).emit('selection:primary:changed', {
        oldSelection,
        newSelection,
        primaryId: this.state.primary,
      });
    }

    // 레거시 이벤트 (Pegboard 호환성)
    if (selectionChanged) {
      this.emit('block:selected', {
        block: this.state.primary ? this.getBlockInstance(this.state.primary)?.getData() || null : null,
      });
    }
  }

  private getContainerRect(): DOMRect | null {
    // BlockManager나 Pegboard에서 컨테이너를 제공받아야 함
    // 현재는 임시로 null 반환
    return null;
  }

  // 정리
  destroy(): void {
    this.clearSelection(false);
    this.removeAllListeners();
  }
}