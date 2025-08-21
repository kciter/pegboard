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
   * 정리
   */
  destroy(): void {
    this.hidePreview();
    this.removeAllListeners();
  }
}