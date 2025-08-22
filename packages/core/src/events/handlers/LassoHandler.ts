import type { 
  ILassoHandler, 
  PointerEvent, 
  LassoContext,
  InteractionContext
} from '../types';
import type { GridPosition, GridSize } from '../../types';
import type { SelectionHandler } from './SelectionHandler';
import type { Block } from '../../Block';
import type { Grid } from '../../Grid';
import type { SpatialIndex } from '../../utils/SpatialIndex';
import { EventEmitter } from '../../EventEmitter';

/**
 * LassoHandler: 라쏘 선택 기능을 처리
 * - 마우스 드래그로 영역 선택
 * - 시각적 선택 박스 표시
 * - 추가 선택 모드 (Shift) 지원
 * - 🚀 성능 최적화: SpatialIndex 활용, 그리드 기반 충돌 검사, DOM 호출 제거
 */
export class LassoHandler extends EventEmitter implements ILassoHandler {
  private selectionBoxEl: HTMLElement | null = null;
  private isActive = false;
  
  // 🚀 성능 최적화 속성들 (DOM 조작 완전 제거)
  private virtualSelectedBlocks = new Set<string>(); // 드래그 중 임시 선택 상태
  private lastUpdateTime = 0;
  private readonly UPDATE_THROTTLE = 33; // ~30fps (33ms) - 더 공격적 throttling
  private lastRenderedSelection = ''; // 렌더링 중복 방지
  
  // 컨테이너 bounds 캐싱
  private containerBounds: DOMRect | null = null;
  private containerBoundsTimestamp = 0;
  private readonly CONTAINER_CACHE_TTL = 100;

  constructor(
    private container: HTMLElement,
    private selectionHandler: SelectionHandler,
    private grid: Grid,
    private spatialIndex: SpatialIndex,
    private getBlockInstance: (id: string) => Block | null
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
    
    // 🚀 가상 선택 상태 초기화 (DOM 조작 없음)
    this.virtualSelectedBlocks.clear();
    this.lastRenderedSelection = '';
    this.clearVirtualSelectionStyles();
    
    // 추가 선택 모드가 아니면 기존 선택 해제
    if (!context.isAdditive) {
      this.selectionHandler.clearSelection();
    } else {
      // 추가 모드면 기존 선택을 가상 선택에 포함
      for (const selectedId of this.selectionHandler.getSelectedIds()) {
        this.virtualSelectedBlocks.add(selectedId);
      }
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

    // 🚀 성능 최적화: Throttling 적용 (60fps 제한)
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_THROTTLE) {
      // Throttled - 시각적 박스 업데이트만 수행
      this.updateSelectionBox(context.bounds);
      return;
    }
    this.lastUpdateTime = now;

    // 선택 박스 업데이트
    this.updateSelectionBox(context.bounds);

    // 🚀 Virtual Selection: 드래그 중에는 가상 선택만 업데이트
    this.updateVirtualSelection(context);

    (this as any).emit('lasso:updated', { 
      bounds: context.bounds,
      currentPosition: context.currentPosition,
      virtualSelection: Array.from(this.virtualSelectedBlocks)
    });
  }

  endLasso(event: PointerEvent, context: LassoContext): void {
    if (!this.isActive) return;

    // 🚀 가상 선택 스타일 제거 (실제 선택으로 전환 전)
    this.clearVirtualSelectionStyles();

    // 🚀 최종 선택 확정: Virtual Selection을 실제 선택으로 적용
    this.finalizeSelection(context);

    // 선택 박스 제거
    this.removeSelectionBox();

    // 정리
    this.virtualSelectedBlocks.clear();

    this.isActive = false;

    (this as any).emit('lasso:ended', { 
      bounds: context.bounds,
      selectedCount: this.selectionHandler.getSelectionCount()
    });
  }

  cancelLasso(): void {
    if (!this.isActive) return;

    // 🚀 가상 선택 스타일 제거
    this.clearVirtualSelectionStyles();
    
    // 선택 박스 제거
    this.removeSelectionBox();
    
    // 정리
    this.virtualSelectedBlocks.clear();
    
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

    // 🚀 O(1) 충돌 감지로 겹치는 블록 ID들 찾기
    const intersectingBlockIds = this.findIntersectingBlocks(localBounds);
    
    if (context.isAdditive) {
      // 추가 선택 모드: 기존 선택 + 새로 겹치는 블록들
      for (const blockId of intersectingBlockIds) {
        if (!this.selectionHandler.isSelected(blockId)) {
          this.selectionHandler.toggleSelection(blockId);
        }
      }
    } else {
      // 일반 모드: 겹치는 블록들만 선택
      // 먼저 모든 선택 해제
      this.selectionHandler.clearSelection();
      
      // 겹치는 블록들 선택
      for (const blockId of intersectingBlockIds) {
        this.selectionHandler.toggleSelection(blockId);
      }
    }
  }

  // 🚀 성능 최적화된 메서드들

  /**
   * 🚀 가상 선택 업데이트 (DOM 호출 완전 제거된 초고속 버전)
   */
  private updateVirtualSelection(context: LassoContext): void {
    const containerRect = this.getCachedContainerRect();
    
    // 전역 좌표계에서 컨테이너 상대 좌표계로 변환
    const localBounds = {
      left: context.bounds.left - containerRect.left,
      top: context.bounds.top - containerRect.top,
      right: context.bounds.right - containerRect.left,
      bottom: context.bounds.bottom - containerRect.top,
    };

    // 🚀 O(1) 충돌 감지 사용 (SpatialIndex + 그리드 좌표)
    const intersectingBlockIds = this.findIntersectingBlocksUltrafast(localBounds);
    
    // 가상 선택 상태 업데이트
    this.virtualSelectedBlocks.clear();
    
    if (context.isAdditive) {
      // 기존 선택도 포함
      for (const selectedId of this.selectionHandler.getSelectedIds()) {
        this.virtualSelectedBlocks.add(selectedId);
      }
    }
    
    // 새로 겹치는 블록들 추가
    for (const blockId of intersectingBlockIds) {
      this.virtualSelectedBlocks.add(blockId);
    }
    
    // 🚀 최적화된 시각적 피드백 (diff 기반 DOM 업데이트)
    this.applyVirtualSelectionStyles();
  }

  /**
   * 🚀 SpatialIndex를 사용한 O(1) 충돌 감지 (DOM 호출 완전 제거)
   */
  private findIntersectingBlocksUltrafast(bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }): string[] {
    // 1. 픽셀 bounds를 그리드 좌표로 변환
    const topLeft = this.grid.getGridPositionFromPixels(
      { x: bounds.left, y: bounds.top }, 
      this.container
    );
    const bottomRight = this.grid.getGridPositionFromPixels(
      { x: bounds.right, y: bounds.bottom }, 
      this.container
    );
    
    // 2. 라쏘가 덮는 그리드 영역 계산
    const gridArea: GridPosition = {
      x: topLeft.x,
      y: topLeft.y,
      zIndex: 1
    };
    const gridSize: GridSize = {
      width: Math.max(1, bottomRight.x - topLeft.x + 1),
      height: Math.max(1, bottomRight.y - topLeft.y + 1)
    };
    
    // 3. SpatialIndex로 해당 영역의 블록들만 O(1)로 찾기
    const potentialBlocks = this.spatialIndex.findPotentialCollisions(
      gridArea, 
      gridSize
    );
    
    // 4. 그리드 좌표 기반 정확한 충돌 검사 (DOM 호출 없음)
    const intersecting: string[] = [];
    
    for (const blockId of potentialBlocks) {
      const block = this.getBlockInstance(blockId);
      if (!block) continue;
      
      const blockData = block.getData();
      const blockPos = blockData.position;
      const blockSize = blockData.size;
      
      // 그리드 좌표로 충돌 검사 (픽셀 계산 불필요)
      const blockRight = blockPos.x + blockSize.width - 1;
      const blockBottom = blockPos.y + blockSize.height - 1;
      const areaRight = gridArea.x + gridSize.width - 1;
      const areaBottom = gridArea.y + gridSize.height - 1;
      
      const hasIntersection = !(
        blockRight < gridArea.x ||
        blockPos.x > areaRight ||
        blockBottom < gridArea.y ||
        blockPos.y > areaBottom
      );
      
      if (hasIntersection) {
        intersecting.push(blockId);
      }
    }
    
    return intersecting;
  }

  /**
   * 컨테이너 bounds 캐싱 (자주 호출되는 DOM 연산 최적화)
   */
  private getCachedContainerRect(): DOMRect {
    const now = Date.now();
    
    if (this.containerBounds && 
        (now - this.containerBoundsTimestamp) < this.CONTAINER_CACHE_TTL) {
      return this.containerBounds;
    }
    
    this.containerBounds = this.container.getBoundingClientRect();
    this.containerBoundsTimestamp = now;
    
    return this.containerBounds;
  }

  /**
   * 🚀 가상 선택 시각적 피드백 (최소한의 DOM 조작)
   */
  private applyVirtualSelectionStyles(): void {
    // 선택된 블록들을 문자열로 직렬화
    const selectionString = Array.from(this.virtualSelectedBlocks)
      .sort() // 일관된 순서로 정렬
      .join('|');
    
    // 🚀 중복 렌더링 방지: 이전과 같으면 완전 스킵
    if (selectionString === this.lastRenderedSelection) {
      return;
    }
    
    this.lastRenderedSelection = selectionString;
    
    // 🚀 requestAnimationFrame으로 배치 DOM 업데이트
    requestAnimationFrame(() => {
      if (!this.isActive) return; // 라쏘가 종료되면 스킵
      
      // 1. 컨테이너에 라쏘 활성 상태 표시
      this.container.setAttribute('data-lasso-active', 'true');
      
      // 2. 모든 블록의 data-lasso-selected 제거 (한 번만)
      const allBlocks = this.container.querySelectorAll('[data-lasso-selected]');
      allBlocks.forEach(el => el.removeAttribute('data-lasso-selected'));
      
      // 3. 선택된 블록들에만 attribute 추가
      for (const blockId of this.virtualSelectedBlocks) {
        const blockEl = this.container.querySelector(`[data-block-id="${blockId}"]`);
        if (blockEl) {
          blockEl.setAttribute('data-lasso-selected', 'true');
        }
      }
    });
  }
  
  /**
   * 가상 선택 스타일 완전 제거
   */
  private clearVirtualSelectionStyles(): void {
    this.container.removeAttribute('data-lasso-active');
    
    // 모든 가상 선택 attribute 제거
    const selectedBlocks = this.container.querySelectorAll('[data-lasso-selected]');
    selectedBlocks.forEach(el => el.removeAttribute('data-lasso-selected'));
    
    this.lastRenderedSelection = '';
  }

  private finalizeSelection(context: LassoContext): void {
    // 🚀 Virtual Selection을 실제 선택으로 적용
    if (!context.isAdditive) {
      // 비추가 모드: 기존 선택 모두 해제
      this.selectionHandler.clearSelection();
    }
    
    // 가상 선택된 블록들을 실제로 선택
    for (const blockId of this.virtualSelectedBlocks) {
      if (!this.selectionHandler.isSelected(blockId)) {
        this.selectionHandler.toggleSelection(blockId);
      }
    }
    
    const selectedIds = Array.from(this.virtualSelectedBlocks);
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
  }): string[] {
    // 🚀 O(1) 최적화된 버전 사용
    return this.findIntersectingBlocksUltrafast(bounds);
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

  // 🚀 성능 최적화 관련 메서드들

  /**
   * 블록 변경 시 캐시 무효화 (더 이상 필요 없음 - SpatialIndex 자동 관리)
   */
  onBlockChanged(blockId: string): void {
    // SpatialIndex는 BlockManager에서 자동 관리되므로 별도 작업 불필요
  }

  /**
   * 🚀 성능 통계 조회 (UI 렌더링 최적화 완료)
   */
  getPerformanceStats(): {
    spatialIndex: {
      optimization: string;
      complexity: string;
    };
    uiRendering: {
      optimization: string;
      duplicateSkipped: boolean;
    };
    virtualSelection: {
      virtualSelectedCount: number;
      isActive: boolean;
    };
    throttling: {
      updateThrottleMs: number;
      lastUpdateTime: number;
    };
  } {
    return {
      spatialIndex: {
        optimization: "SpatialIndex + 그리드 좌표 기반",
        complexity: "O(1) - DOM 호출 완전 제거"
      },
      uiRendering: {
        optimization: "RequestAnimationFrame + 중복 방지",
        duplicateSkipped: this.lastRenderedSelection !== ''
      },
      virtualSelection: {
        virtualSelectedCount: this.virtualSelectedBlocks.size,
        isActive: this.isActive
      },
      throttling: {
        updateThrottleMs: this.UPDATE_THROTTLE,
        lastUpdateTime: this.lastUpdateTime
      }
    };
  }

  /**
   * 메모리 정리 (가상 선택 상태만 관리)
   */
  cleanup(): void {
    this.clearVirtualSelectionStyles();
    this.virtualSelectedBlocks.clear();
    this.containerBounds = null;
  }

  /**
   * 컨테이너 캐시 무효화 (리사이즈, 스크롤 등의 경우)
   */
  invalidateCache(): void {
    this.containerBounds = null;
    this.containerBoundsTimestamp = 0;
  }
}