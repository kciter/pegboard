import type { GridPosition, GridSize, BlockData } from '../types';

/**
 * 공간 분할 인덱스: 그리드 기반 충돌 검사 최적화
 * O(n) -> O(1)에 가까운 성능으로 개선
 */
export class SpatialIndex {
  // 그리드 셀을 키로 하고 해당 위치의 블록 ID들을 값으로 하는 해시맵
  // 키 형식: "x,y" (예: "5,3")
  private cellToBlocks = new Map<string, Set<string>>();
  
  // 블록 ID를 키로 하고 해당 블록이 차지하는 모든 셀들을 값으로 하는 해시맵
  private blockToCells = new Map<string, Set<string>>();

  /**
   * 블록을 인덱스에 추가
   */
  addBlock(blockId: string, position: GridPosition, size: GridSize): void {
    const cells = this.getCellsForBlock(position, size);
    this.blockToCells.set(blockId, cells);
    
    for (const cellKey of cells) {
      if (!this.cellToBlocks.has(cellKey)) {
        this.cellToBlocks.set(cellKey, new Set());
      }
      this.cellToBlocks.get(cellKey)!.add(blockId);
    }
  }

  /**
   * 블록을 인덱스에서 제거
   */
  removeBlock(blockId: string): void {
    const cells = this.blockToCells.get(blockId);
    if (!cells) return;

    for (const cellKey of cells) {
      const blocksInCell = this.cellToBlocks.get(cellKey);
      if (blocksInCell) {
        blocksInCell.delete(blockId);
        if (blocksInCell.size === 0) {
          this.cellToBlocks.delete(cellKey);
        }
      }
    }
    
    this.blockToCells.delete(blockId);
  }

  /**
   * 블록을 새 위치로 이동 (기존 위치에서 제거 후 새 위치에 추가)
   */
  moveBlock(blockId: string, newPosition: GridPosition, newSize: GridSize): void {
    this.removeBlock(blockId);
    this.addBlock(blockId, newPosition, newSize);
  }

  /**
   * 지정된 영역과 충돌하는 블록들을 빠르게 찾기
   */
  findPotentialCollisions(
    position: GridPosition, 
    size: GridSize, 
    excludeBlockId?: string
  ): Set<string> {
    const potentialCollisions = new Set<string>();
    const cells = this.getCellsForBlock(position, size);
    
    for (const cellKey of cells) {
      const blocksInCell = this.cellToBlocks.get(cellKey);
      if (blocksInCell) {
        for (const blockId of blocksInCell) {
          if (blockId !== excludeBlockId) {
            potentialCollisions.add(blockId);
          }
        }
      }
    }
    
    return potentialCollisions;
  }

  /**
   * 빠른 충돌 검사 (실제 블록 데이터 없이 ID만으로)
   */
  hasCollisionFast(
    position: GridPosition, 
    size: GridSize, 
    excludeBlockId?: string
  ): boolean {
    const cells = this.getCellsForBlock(position, size);
    
    for (const cellKey of cells) {
      const blocksInCell = this.cellToBlocks.get(cellKey);
      if (blocksInCell) {
        for (const blockId of blocksInCell) {
          if (blockId !== excludeBlockId) {
            return true; // 충돌 발견!
          }
        }
      }
    }
    
    return false; // 충돌 없음
  }

  /**
   * 블록이 차지하는 모든 그리드 셀의 키 목록 반환
   */
  private getCellsForBlock(position: GridPosition, size: GridSize): Set<string> {
    const cells = new Set<string>();
    
    for (let x = position.x; x < position.x + size.width; x++) {
      for (let y = position.y; y < position.y + size.height; y++) {
        cells.add(`${x},${y}`);
      }
    }
    
    return cells;
  }

  /**
   * 디버깅용: 인덱스 상태 출력
   */
  debug(): void {
    console.log('SpatialIndex Debug:');
    console.log('Cells to Blocks:', this.cellToBlocks);
    console.log('Blocks to Cells:', this.blockToCells);
  }

  /**
   * 인덱스 초기화 (모든 데이터 삭제)
   */
  clear(): void {
    this.cellToBlocks.clear();
    this.blockToCells.clear();
  }

  /**
   * 통계 정보 반환
   */
  getStats(): {
    totalCells: number;
    totalBlocks: number;
    averageBlocksPerCell: number;
  } {
    const totalCells = this.cellToBlocks.size;
    const totalBlocks = this.blockToCells.size;
    
    let totalBlocksInCells = 0;
    for (const [, blocks] of this.cellToBlocks) {
      totalBlocksInCells += blocks.size;
    }
    
    return {
      totalCells,
      totalBlocks,
      averageBlocksPerCell: totalCells > 0 ? totalBlocksInCells / totalCells : 0
    };
  }
}