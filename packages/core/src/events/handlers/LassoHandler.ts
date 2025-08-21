import type { 
  ILassoHandler, 
  PointerEvent, 
  LassoContext,
  InteractionContext
} from '../types';
import type { SelectionHandler } from './SelectionHandler';
import type { Block } from '../../Block';
import { EventEmitter } from '../../EventEmitter';

/**
 * LassoHandler: 라쏘 선택 기능을 처리
 * - 마우스 드래그로 영역 선택
 * - 시각적 선택 박스 표시
 * - 추가 선택 모드 (Shift) 지원
 */
export class LassoHandler extends EventEmitter implements ILassoHandler {
  private selectionBoxEl: HTMLElement | null = null;
  private isActive = false;

  constructor(
    private container: HTMLElement,
    private selectionHandler: SelectionHandler,
    private getAllBlockInstances: () => Block[]
  ) {
    super();
  }

  onPointerDown(event: PointerEvent, context: InteractionContext): boolean {
    // 라쏘는 빈 영역에서만 시작
    if (context.blockId) return false;
    
    // 컨텍스트는 UIEventListener에서 생성되므로 여기서는 사용하지 않음
    return false;
  }

  onPointerMove(event: PointerEvent): boolean {
    // 라쏘 업데이트는 updateLasso에서 처리
    return this.isActive;
  }

  onPointerUp(event: PointerEvent): boolean {
    // 라쏘 종료는 endLasso에서 처리
    return this.isActive;
  }

  startLasso(event: PointerEvent, context: LassoContext): void {
    this.isActive = true;
    
    // 추가 선택 모드가 아니면 기존 선택 해제
    if (!context.isAdditive) {
      this.selectionHandler.clearSelection();
    }

    // 시각적 선택 박스 생성
    this.createSelectionBox(context.startPosition);
    
    (this as any).emit('lasso:started', { 
      position: context.startPosition,
      isAdditive: context.isAdditive 
    });
  }

  updateLasso(event: PointerEvent, context: LassoContext): void {
    if (!this.isActive || !this.selectionBoxEl) return;

    // 선택 박스 업데이트
    this.updateSelectionBox(context.bounds);

    // 영역 내 블록들 찾기 및 선택 업데이트
    this.updateSelection(context);

    (this as any).emit('lasso:updated', { 
      bounds: context.bounds,
      currentPosition: context.currentPosition 
    });
  }

  endLasso(event: PointerEvent, context: LassoContext): void {
    if (!this.isActive) return;

    // 최종 선택 확정
    this.finalizeSelection(context);

    // 선택 박스 제거
    this.removeSelectionBox();

    this.isActive = false;

    (this as any).emit('lasso:ended', { 
      bounds: context.bounds,
      selectedCount: this.selectionHandler.getSelectionCount()
    });
  }

  cancelLasso(): void {
    if (!this.isActive) return;

    this.removeSelectionBox();
    this.isActive = false;

    (this as any).emit('lasso:cancelled');
  }

  // Private methods

  private createSelectionBox(startPosition: { x: number; y: number }): void {
    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.className = 'pegboard-lasso-selection';
    
    // CSS 스타일 적용
    Object.assign(this.selectionBoxEl.style, {
      position: 'absolute',
      left: `${startPosition.x}px`,
      top: `${startPosition.y}px`,
      width: '0px',
      height: '0px',
      border: '1px dashed #007bff',
      backgroundColor: 'rgba(0, 123, 255, 0.1)',
      pointerEvents: 'none',
      zIndex: '9999',
    });

    document.body.appendChild(this.selectionBoxEl);
  }

  private updateSelectionBox(bounds: DOMRect): void {
    if (!this.selectionBoxEl) return;

    Object.assign(this.selectionBoxEl.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
  }

  private removeSelectionBox(): void {
    if (this.selectionBoxEl) {
      this.selectionBoxEl.remove();
      this.selectionBoxEl = null;
    }
  }

  private updateSelection(context: LassoContext): void {
    const containerRect = this.container.getBoundingClientRect();
    
    // 전역 좌표계에서 컨테이너 상대 좌표계로 변환
    const localBounds = {
      left: context.bounds.left - containerRect.left,
      top: context.bounds.top - containerRect.top,
      right: context.bounds.right - containerRect.left,
      bottom: context.bounds.bottom - containerRect.top,
    };

    // 영역과 겹치는 블록들 찾기
    const intersectingBlocks = this.findIntersectingBlocks(localBounds);
    
    if (context.isAdditive) {
      // 추가 선택 모드: 기존 선택 + 새로 겹치는 블록들
      for (const block of intersectingBlocks) {
        const blockId = block.getData().id;
        if (!this.selectionHandler.isSelected(blockId)) {
          this.selectionHandler.toggleSelection(blockId);
        }
      }
    } else {
      // 일반 모드: 겹치는 블록들만 선택
      // 먼저 모든 선택 해제
      this.selectionHandler.clearSelection();
      
      // 겹치는 블록들 선택
      for (const block of intersectingBlocks) {
        this.selectionHandler.toggleSelection(block.getData().id);
      }
    }
  }

  private finalizeSelection(context: LassoContext): void {
    // 라쏘 종료 시 최종 선택 상태 확정
    // Command 패턴을 사용한 선택으로 업그레이드 가능한 지점
    
    const selectedIds = this.selectionHandler.getSelectedIds();
    (this as any).emit('selection:finalized', { 
      selectedIds,
      isAdditive: context.isAdditive,
      bounds: context.bounds
    });
  }

  private findIntersectingBlocks(bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): Block[] {
    const intersecting: Block[] = [];
    const containerRect = this.container.getBoundingClientRect();

    for (const block of this.getAllBlockInstances()) {
      const blockRect = block.getBoundingRect();
      
      // 블록의 컨테이너 상대 좌표 계산
      const blockBounds = {
        left: blockRect.left - containerRect.left,
        top: blockRect.top - containerRect.top,
        right: blockRect.right - containerRect.left,
        bottom: blockRect.bottom - containerRect.top,
      };

      // 겹침 검사
      const hasIntersection = !(
        blockBounds.right < bounds.left ||
        blockBounds.left > bounds.right ||
        blockBounds.bottom < bounds.top ||
        blockBounds.top > bounds.bottom
      );

      if (hasIntersection) {
        intersecting.push(block);
      }
    }

    return intersecting;
  }

  // Shift 키 상태 변경 처리 (UIEventListener에서 호출)
  setAdditiveMode(enabled: boolean): void {
    // 라쏘 진행 중에 Shift 키 상태가 변경될 때 처리
    if (this.isActive) {
      (this as any).emit('lasso:additive:changed', { enabled });
    }
  }

  // 상태 조회
  isLassoActive(): boolean {
    return this.isActive;
  }
}