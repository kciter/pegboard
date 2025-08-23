import type { GridPosition, GridSize, BlockData } from '../types';
import type { ReflowCalculationResult } from '../utils/ReflowCalculator';
import { EventEmitter } from '../EventEmitter';

/**
 * 리플로우 프리뷰 매니저
 * 드래그 중 리플로우될 블록들의 미리보기를 관리
 */
export class ReflowPreviewManager extends EventEmitter {
  private reflowPreviewElements = new Map<string, HTMLElement>();
  private isActive = false;
  private currentReflowState: ReflowCalculationResult | null = null;

  constructor(private container: HTMLElement) {
    super();
  }

  /**
   * 리플로우 프리뷰 시작
   */
  startReflowPreview(
    movingBlockId: string,
    reflow: ReflowCalculationResult
  ): void {
    this.isActive = true;
    this.currentReflowState = reflow;

    // 기존 프리뷰 제거
    this.clearReflowPreview();

    // 영향받는 블록들의 프리뷰 생성
    for (const affectedBlock of reflow.affectedBlocks) {
      this.showBlockReflowPreview(affectedBlock);
    }

    (this as any).emit('reflow-preview:started', {
      movingBlockId,
      affectedBlockCount: reflow.affectedBlocks.length
    });
  }

  /**
   * 리플로우 프리뷰 업데이트
   */
  updateReflowPreview(
    movingBlockId: string,
    reflow: ReflowCalculationResult
  ): void {
    if (!this.isActive) {
      return;
    }

    this.currentReflowState = reflow;

    // 기존 프리뷰 제거
    this.clearReflowPreview();

    // 새로운 프리뷰 생성
    for (const affectedBlock of reflow.affectedBlocks) {
      this.showBlockReflowPreview(affectedBlock);
    }

    (this as any).emit('reflow-preview:updated', {
      movingBlockId,
      affectedBlockCount: reflow.affectedBlocks.length
    });
  }

  /**
   * 리플로우 프리뷰 종료
   */
  endReflowPreview(): void {
    if (!this.isActive) {
      return;
    }

    this.clearReflowPreview();
    this.isActive = false;
    this.currentReflowState = null;

    (this as any).emit('reflow-preview:ended', {});
  }

  /**
   * 개별 블록의 리플로우 프리뷰 표시
   */
  private showBlockReflowPreview(affectedBlock: {
    blockId: string;
    originalPosition: GridPosition;
    newPosition: GridPosition;
    reason: 'collision-avoid' | 'space-fill';
  }): void {
    // 원본 블록 찾기
    const originalBlockElement = this.container.querySelector(
      `[data-block-id="${affectedBlock.blockId}"]`
    ) as HTMLElement;
    
    if (!originalBlockElement) {
      return;
    }

    // 원본 블록을 약간 투명하게 만들기
    originalBlockElement.style.opacity = '0.5';
    originalBlockElement.dataset.reflowOriginal = 'true';

    // 새 위치에 프리뷰 블록 생성
    const previewElement = document.createElement('div');
    previewElement.className = `pegboard-reflow-preview pegboard-reflow-${affectedBlock.reason}`;
    previewElement.dataset.blockId = affectedBlock.blockId;
    previewElement.dataset.reflowPreview = 'true';

    // 그리드 위치 적용
    previewElement.style.gridColumn = `${affectedBlock.newPosition.x} / span ${this.getBlockSize(originalBlockElement).width}`;
    previewElement.style.gridRow = `${affectedBlock.newPosition.y} / span ${this.getBlockSize(originalBlockElement).height}`;
    previewElement.style.zIndex = (affectedBlock.newPosition.zIndex || 1).toString();

    // 원본 블록의 내용 복제 (간단한 버전)
    const originalContent = originalBlockElement.cloneNode(true) as HTMLElement;
    originalContent.style.opacity = '0.7';
    originalContent.style.filter = 'brightness(1.1)';
    previewElement.appendChild(originalContent);

    this.container.appendChild(previewElement);
    this.reflowPreviewElements.set(affectedBlock.blockId, previewElement);
  }

  /**
   * 모든 리플로우 프리뷰 제거
   */
  private clearReflowPreview(): void {
    // 프리뷰 요소들 제거
    for (const [blockId, previewElement] of this.reflowPreviewElements) {
      previewElement.remove();
    }
    this.reflowPreviewElements.clear();

    // 원본 블록들의 투명도 복원
    const originalBlocks = this.container.querySelectorAll('[data-reflow-original]');
    for (const originalBlock of originalBlocks) {
      const element = originalBlock as HTMLElement;
      element.style.opacity = '';
      delete element.dataset.reflowOriginal;
    }
  }

  /**
   * 블록 크기 추출
   */
  private getBlockSize(element: HTMLElement): GridSize {
    const gridColumn = element.style.gridColumn;
    const gridRow = element.style.gridRow;

    // "1 / span 2" 형식에서 span 값 추출
    const widthMatch = gridColumn.match(/span (\d+)/);
    const heightMatch = gridRow.match(/span (\d+)/);

    return {
      width: widthMatch && widthMatch[1] ? parseInt(widthMatch[1], 10) : 1,
      height: heightMatch && heightMatch[1] ? parseInt(heightMatch[1], 10) : 1
    };
  }

  /**
   * 현재 리플로우 상태 반환
   */
  getCurrentReflowState(): ReflowCalculationResult | null {
    return this.currentReflowState;
  }

  /**
   * 리플로우 프리뷰가 활성화되어 있는지 확인
   */
  isReflowPreviewActive(): boolean {
    return this.isActive;
  }

  /**
   * 정리
   */
  cleanup(): void {
    this.endReflowPreview();
    this.removeAllListeners();
  }
}