import type { GridPosition, GridSize, BlockData } from '../types';

/**
 * 리플로우 계산 결과
 */
export interface ReflowCalculationResult {
  /** 이동할 블록들 */
  affectedBlocks: Array<{
    blockId: string;
    originalPosition: GridPosition;
    newPosition: GridPosition;
    reason: 'collision-avoid' | 'space-fill';
  }>;
  /** 성공 여부 */
  success: boolean;
  /** 실패 사유 */
  reason?: string;
}

/**
 * 리플로우 계산기
 * 블록 이동 시 다른 블록들의 최적 배치를 계산
 */
export class ReflowCalculator {
  constructor(
    private gridColumns: number,
    private gridRows?: number,
    private unboundedRows: boolean = false
  ) {}

  /**
   * 블록 이동에 따른 리플로우 계산
   */
  calculateReflow(
    movingBlockId: string,
    movingBlockSize: GridSize,
    fromPosition: GridPosition,
    toPosition: GridPosition,
    allBlocks: ReadonlyArray<Readonly<BlockData>>,
    strategy: 'push-away' | 'smart-fill' | 'none' = 'push-away'
  ): ReflowCalculationResult {
    if (strategy === 'none') {
      return { affectedBlocks: [], success: true };
    }

    // 이동하는 블록을 제외한 다른 블록들
    const otherBlocks = allBlocks.filter(block => block.id !== movingBlockId);
    
    // 새 위치에서 겹치는 블록들 찾기
    const collidingBlocks = this.findCollidingBlocks(
      toPosition,
      movingBlockSize,
      otherBlocks
    );

    if (collidingBlocks.length === 0) {
      // 겹치는 블록이 없으면 리플로우 불필요
      return { affectedBlocks: [], success: true };
    }

    // 전략에 따라 리플로우 계산
    switch (strategy) {
      case 'push-away':
        return this.calculatePushAwayReflow(
          movingBlockId,
          movingBlockSize,
          fromPosition,
          toPosition,
          collidingBlocks,
          otherBlocks
        );
      case 'smart-fill':
        return this.calculateSmartFillReflow(
          movingBlockId,
          movingBlockSize,
          fromPosition,
          toPosition,
          collidingBlocks,
          otherBlocks
        );
      default:
        return { affectedBlocks: [], success: true };
    }
  }

  /**
   * 겹치는 블록들을 밀어내는 방식의 리플로우
   */
  private calculatePushAwayReflow(
    movingBlockId: string,
    movingBlockSize: GridSize,
    fromPosition: GridPosition,
    toPosition: GridPosition,
    collidingBlocks: BlockData[],
    allOtherBlocks: BlockData[]
  ): ReflowCalculationResult {
    const affectedBlocks: ReflowCalculationResult['affectedBlocks'] = [];

    // 이동 방향 계산
    const deltaX = toPosition.x - fromPosition.x;
    const deltaY = toPosition.y - fromPosition.y;
    
    // 주 이동 방향 결정 (더 큰 변화량을 가진 축)
    const primaryAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
    const pushDirection = primaryAxis === 'x' 
      ? (deltaX > 0 ? 'right' : 'left')
      : (deltaY > 0 ? 'down' : 'up');

    for (const collidingBlock of collidingBlocks) {
      const newPosition = this.calculatePushAwayPosition(
        collidingBlock,
        toPosition,
        movingBlockSize,
        pushDirection,
        allOtherBlocks
      );

      if (newPosition) {
        affectedBlocks.push({
          blockId: collidingBlock.id,
          originalPosition: collidingBlock.position,
          newPosition,
          reason: 'collision-avoid'
        });
      }
    }

    return {
      affectedBlocks,
      success: true
    };
  }

  /**
   * 빈 공간을 찾아서 배치하는 방식의 리플로우
   */
  private calculateSmartFillReflow(
    movingBlockId: string,
    movingBlockSize: GridSize,
    fromPosition: GridPosition,
    toPosition: GridPosition,
    collidingBlocks: BlockData[],
    allOtherBlocks: BlockData[]
  ): ReflowCalculationResult {
    const affectedBlocks: ReflowCalculationResult['affectedBlocks'] = [];

    for (const collidingBlock of collidingBlocks) {
      // 가장 가까운 빈 공간 찾기
      const nearestSpace = this.findNearestAvailableSpace(
        collidingBlock.position,
        collidingBlock.size,
        [...allOtherBlocks, { 
          id: movingBlockId,
          position: toPosition,
          size: movingBlockSize,
          type: 'temp',
          attributes: {},
          constraints: undefined
        }]
      );

      if (nearestSpace) {
        affectedBlocks.push({
          blockId: collidingBlock.id,
          originalPosition: collidingBlock.position,
          newPosition: nearestSpace,
          reason: 'space-fill'
        });
      }
    }

    return {
      affectedBlocks,
      success: affectedBlocks.length === collidingBlocks.length
    };
  }

  /**
   * 밀어내기 방향에 따른 새 위치 계산
   */
  private calculatePushAwayPosition(
    block: BlockData,
    obstaclePosition: GridPosition,
    obstacleSize: GridSize,
    direction: 'left' | 'right' | 'up' | 'down',
    otherBlocks: BlockData[]
  ): GridPosition | null {
    let candidatePosition: GridPosition;

    switch (direction) {
      case 'right':
        candidatePosition = {
          x: obstaclePosition.x + obstacleSize.width,
          y: block.position.y,
          zIndex: block.position.zIndex
        };
        break;
      case 'left':
        candidatePosition = {
          x: obstaclePosition.x - block.size.width,
          y: block.position.y,
          zIndex: block.position.zIndex
        };
        break;
      case 'down':
        candidatePosition = {
          x: block.position.x,
          y: obstaclePosition.y + obstacleSize.height,
          zIndex: block.position.zIndex
        };
        break;
      case 'up':
        candidatePosition = {
          x: block.position.x,
          y: obstaclePosition.y - block.size.height,
          zIndex: block.position.zIndex
        };
        break;
    }

    // 위치가 그리드 범위 내에 있는지 확인
    if (!this.isValidGridPosition(candidatePosition, block.size)) {
      return null;
    }

    // 다른 블록과 충돌하지 않는지 확인
    if (this.hasCollision(candidatePosition, block.size, block.id, otherBlocks)) {
      return null;
    }

    return candidatePosition;
  }

  /**
   * 가장 가까운 사용 가능한 공간 찾기
   */
  private findNearestAvailableSpace(
    preferredPosition: GridPosition,
    size: GridSize,
    occupiedBlocks: Array<{id: string; position: GridPosition; size: GridSize}>
  ): GridPosition | null {
    // 나선형 탐색으로 가장 가까운 빈 공간 찾기
    const maxRadius = Math.max(this.gridColumns, this.gridRows || 50);
    
    for (let radius = 0; radius <= maxRadius; radius++) {
      // 반지름 r에서 모든 위치 탐색
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // 경계에 있는 위치들만 확인 (내부는 이전 반지름에서 확인됨)
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
            continue;
          }

          const candidatePosition: GridPosition = {
            x: preferredPosition.x + dx,
            y: preferredPosition.y + dy,
            zIndex: preferredPosition.zIndex
          };

          if (this.isValidGridPosition(candidatePosition, size) &&
              !this.hasCollision(candidatePosition, size, '', occupiedBlocks)) {
            return candidatePosition;
          }
        }
      }
    }

    return null;
  }

  /**
   * 겹치는 블록들 찾기
   */
  private findCollidingBlocks(
    position: GridPosition,
    size: GridSize,
    blocks: ReadonlyArray<Readonly<BlockData>>
  ): BlockData[] {
    const colliding: BlockData[] = [];

    for (const block of blocks) {
      if (this.blocksOverlap(position, size, block.position, block.size)) {
        colliding.push(block as BlockData);
      }
    }

    return colliding;
  }

  /**
   * 두 블록이 겹치는지 확인
   */
  private blocksOverlap(
    pos1: GridPosition,
    size1: GridSize,
    pos2: GridPosition,
    size2: GridSize
  ): boolean {
    const end1X = pos1.x + size1.width - 1;
    const end1Y = pos1.y + size1.height - 1;
    const end2X = pos2.x + size2.width - 1;
    const end2Y = pos2.y + size2.height - 1;

    return !(end1X < pos2.x || pos1.x > end2X || end1Y < pos2.y || pos1.y > end2Y);
  }

  /**
   * 그리드 위치가 유효한지 확인
   */
  private isValidGridPosition(position: GridPosition, size: GridSize): boolean {
    // X축 체크
    if (position.x < 1 || position.x + size.width - 1 > this.gridColumns) {
      return false;
    }

    // Y축 체크
    if (position.y < 1) {
      return false;
    }

    // 행 제한이 있는 경우만 상한 체크
    if (!this.unboundedRows && this.gridRows && position.y + size.height - 1 > this.gridRows) {
      return false;
    }

    return true;
  }

  /**
   * 충돌 확인
   */
  private hasCollision(
    position: GridPosition,
    size: GridSize,
    excludeId: string,
    blocks: Array<{id: string; position: GridPosition; size: GridSize}>
  ): boolean {
    for (const block of blocks) {
      if (block.id === excludeId) continue;
      
      if (this.blocksOverlap(position, size, block.position, block.size)) {
        return true;
      }
    }

    return false;
  }
}