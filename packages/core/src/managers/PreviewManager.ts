import type { GridPosition, GridSize } from '../types';
import { EventEmitter } from '../EventEmitter';

/**
 * Preview strategy interface
 */
export interface IPreviewStrategy {
  showHint(pos: GridPosition, size: GridSize, valid: boolean): void;
  clearHint(): void;
}

/**
 * Default DOM-based preview strategy
 */
export class DomHintPreview implements IPreviewStrategy {
  private hintEl: HTMLElement | null = null;
  
  constructor(private container: HTMLElement) {}

  showHint(pos: GridPosition, size: GridSize, valid: boolean): void {
    if (!this.hintEl) {
      this.hintEl = document.createElement('div');
      this.hintEl.className = 'pegboard-hint-overlay';
      this.hintEl.setAttribute('aria-hidden', 'true');
      this.container.appendChild(this.hintEl);
    }
    
    this.hintEl.style.gridColumn = `${pos.x} / span ${size.width}`;
    this.hintEl.style.gridRow = `${pos.y} / span ${size.height}`;
    this.hintEl.classList.toggle('invalid', !valid);
  }

  clearHint(): void {
    if (this.hintEl) {
      this.hintEl.remove();
      this.hintEl = null;
    }
  }
}

/**
 * PreviewManager: 드래그/리사이즈 시 블록 위치/크기 힌트를 관리
 */
export class PreviewManager extends EventEmitter {
  private currentPreview: {
    position: GridPosition;
    size: GridSize;
    valid: boolean;
  } | null = null;

  private currentGroupPreview: {
    bounds: { x: number; y: number; width: number; height: number };
    blockPreviews: Array<{
      blockId: string;
      position: { x: number; y: number; zIndex: number };
      size: { width: number; height: number };
      valid: boolean;
    }>;
    valid: boolean;
  } | null = null;

  private groupHintElements: Map<string, HTMLElement> = new Map();
  private groupBoundsElement: HTMLElement | null = null;

  constructor(
    private container: HTMLElement,
    private strategy: IPreviewStrategy = new DomHintPreview(container)
  ) {
    super();
  }

  /**
   * 미리보기 표시
   */
  showPreview(position: GridPosition, size: GridSize, valid: boolean = true): void {
    this.currentPreview = { position, size, valid };
    this.strategy.showHint(position, size, valid);
    
    (this as any).emit('preview:shown', { 
      position, 
      size, 
      valid 
    });
  }

  /**
   * 미리보기 업데이트
   */
  updatePreview(position: GridPosition, size?: GridSize, valid?: boolean): void {
    if (!this.currentPreview) {
      return;
    }

    const newSize = size || this.currentPreview.size;
    const newValid = valid !== undefined ? valid : this.currentPreview.valid;

    this.currentPreview = { position, size: newSize, valid: newValid };
    this.strategy.showHint(position, newSize, newValid);
    
    (this as any).emit('preview:updated', { 
      position, 
      size: newSize, 
      valid: newValid 
    });
  }

  /**
   * 미리보기 숨기기
   */
  hidePreview(): void {
    if (!this.currentPreview) {
      return;
    }

    this.strategy.clearHint();
    this.currentPreview = null;
    
    (this as any).emit('preview:hidden');
  }

  /**
   * 그룹 드래그 프리뷰 표시
   */
  showGroupPreview(
    bounds: { x: number; y: number; width: number; height: number },
    blockPreviews: Array<{
      blockId: string;
      position: { x: number; y: number; zIndex: number };
      size: { width: number; height: number };
      valid: boolean;
    }>,
    valid: boolean
  ): void {
    // 기존 단일 프리뷰 숨기기
    this.hidePreview();
    
    // 그룹 프리뷰 상태 저장
    this.currentGroupPreview = { bounds, blockPreviews, valid };

    // 그룹 전체 경계 표시
    this.showGroupBounds(bounds, valid);

    // 각 블럭 프리뷰 표시
    blockPreviews.forEach(blockPreview => {
      this.showBlockPreview(blockPreview);
    });

    (this as any).emit('preview:group:shown', { bounds, blockPreviews, valid });
  }

  /**
   * 그룹 프리뷰 숨기기
   */
  hideGroupPreview(): void {
    if (!this.currentGroupPreview) {
      return;
    }

    // 그룹 경계 제거
    if (this.groupBoundsElement) {
      this.groupBoundsElement.remove();
      this.groupBoundsElement = null;
    }

    // 각 블럭 프리뷰 제거
    this.groupHintElements.forEach(element => {
      element.remove();
    });
    this.groupHintElements.clear();

    this.currentGroupPreview = null;
    
    (this as any).emit('preview:group:hidden');
  }

  /**
   * 그룹 전체 경계 표시
   */
  private showGroupBounds(
    bounds: { x: number; y: number; width: number; height: number },
    valid: boolean
  ): void {
    if (!this.groupBoundsElement) {
      this.groupBoundsElement = document.createElement('div');
      this.groupBoundsElement.className = 'pegboard-group-bounds-overlay';
      this.groupBoundsElement.setAttribute('aria-hidden', 'true');
      this.container.appendChild(this.groupBoundsElement);
    }

    this.groupBoundsElement.style.gridColumn = `${bounds.x} / span ${bounds.width}`;
    this.groupBoundsElement.style.gridRow = `${bounds.y} / span ${bounds.height}`;
    this.groupBoundsElement.classList.toggle('invalid', !valid);
  }

  /**
   * 개별 블럭 프리뷰 표시
   */
  private showBlockPreview(blockPreview: {
    blockId: string;
    position: { x: number; y: number; zIndex: number };
    size: { width: number; height: number };
    valid: boolean;
  }): void {
    let element = this.groupHintElements.get(blockPreview.blockId);
    
    if (!element) {
      element = document.createElement('div');
      element.className = 'pegboard-group-block-overlay';
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('data-block-id', blockPreview.blockId);
      this.container.appendChild(element);
      this.groupHintElements.set(blockPreview.blockId, element);
    }

    element.style.gridColumn = `${blockPreview.position.x} / span ${blockPreview.size.width}`;
    element.style.gridRow = `${blockPreview.position.y} / span ${blockPreview.size.height}`;
    element.classList.toggle('invalid', !blockPreview.valid);
  }

  /**
   * 현재 미리보기 상태 조회
   */
  getCurrentPreview(): { position: GridPosition; size: GridSize; valid: boolean } | null {
    return this.currentPreview;
  }

  /**
   * 미리보기 중인지 여부
   */
  isPreviewActive(): boolean {
    return this.currentPreview !== null;
  }

  /**
   * Preview strategy 변경
   */
  setStrategy(strategy: IPreviewStrategy): void {
    // 현재 미리보기가 있다면 먼저 정리
    if (this.currentPreview) {
      this.strategy.clearHint();
    }

    this.strategy = strategy;

    // 현재 미리보기를 새 전략으로 다시 표시
    if (this.currentPreview) {
      const { position, size, valid } = this.currentPreview;
      this.strategy.showHint(position, size, valid);
    }
  }

  /**
   * 모든 블록 프리뷰 정리 (기존 호환성 유지)
   */
  clearAllBlockPreviews(): void {
    // 단일 프리뷰 정리
    this.hidePreview();
    // 그룹 프리뷰 정리
    this.hideGroupPreview();
  }

  /**
   * 정리
   */
  destroy(): void {
    this.hidePreview();
    this.removeAllListeners();
  }
}