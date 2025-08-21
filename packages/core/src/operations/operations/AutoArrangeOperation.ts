import type { 
  IOperation, 
  OperationContext, 
  OperationResult 
} from '../types';
import type { 
  AutoArrangeStrategy, 
  GridPosition, 
  GridSize, 
  BlockData 
} from '../../types';
import { generateId } from '../../utils';

/**
 * AutoArrangeOperation: 블록들을 자동 정렬하는 작업
 */
export class AutoArrangeOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'auto-arrange' as const;
  public readonly timestamp: number;
  private originalPositions: Array<{ id: string; position: GridPosition }> = [];

  constructor(
    private strategy: AutoArrangeStrategy,
    private blockIds: string[] | undefined,
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  async execute(): Promise<OperationResult> {
    try {
      // 배치할 블록들 가져오기
      const targetBlocks = this.getTargetBlocks();

      if (targetBlocks.length === 0) {
        return {
          success: true,
          data: { movedBlocks: [] },
        };
      }

      // 원래 위치 저장 (undo용)
      this.originalPositions = targetBlocks.map(block => ({
        id: block.id,
        position: { ...block.position },
      }));

      // 전략에 따라 새로운 위치 계산
      const newPositions = this.calculateNewPositions(targetBlocks);

      // 🔧 단계 1: 모든 대상 블록들을 임시로 제거하여 충돌 방지
      const removedBlocksData: Array<{ id: string; originalData: any }> = [];
      for (const block of targetBlocks) {
        const blockData = this.context.blockManager.getBlock(block.id);
        if (blockData) {
          removedBlocksData.push({
            id: block.id,
            originalData: blockData
          });
          
          // 임시로 블록 제거 (DOM에서는 숨김처리)
          const blockInstance = this.context.blockManager.getBlockInstance(block.id);
          if (blockInstance) {
            const element = blockInstance.getElement();
            if (element) element.style.display = 'none';
          }
          
          // 공간 인덱스에서만 제거 (실제 블록 객체는 유지)
          this.context.blockManager.spatialIndex.removeBlock(block.id);
        }
      }
      
      // 🔧 단계 2: 새 위치에 블록들 재배치
      const movedBlocks: Array<{ id: string; from: GridPosition; to: GridPosition }> = [];
      
      for (const { blockId, newPosition } of newPositions) {
        const originalPos = this.originalPositions.find(p => p.id === blockId)?.position;
        const removedData = removedBlocksData.find(r => r.id === blockId);
        
        if (originalPos && removedData) {
          // 블록을 새 위치로 이동 (충돌 검사 없이 직접 이동)
          const blockInstance = this.context.blockManager.getBlockInstance(blockId);
          if (blockInstance) {
            // 위치 직접 설정
            blockInstance.setPosition(newPosition);
            
            // 공간 인덱스에 새 위치로 추가
            this.context.blockManager.spatialIndex.addBlock(blockId, newPosition, blockInstance.getData().size);
            
            // DOM 요소 다시 표시
            const element = blockInstance.getElement();
            if (element) element.style.display = '';
            
            movedBlocks.push({
              id: blockId,
              from: originalPos,
              to: newPosition,
            });
          }
        }
      }

      return {
        success: true,
        data: { 
          movedBlocks,
          strategy: this.strategy,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Auto arrange failed',
      };
    }
  }

  async undo(): Promise<OperationResult> {
    try {
      // 원래 위치로 복원
      for (const { id, position } of this.originalPositions) {
        this.context.blockManager.moveBlock(id, position);
      }

      return {
        success: true,
        data: { restored: this.originalPositions.length },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Auto arrange undo failed',
      };
    }
  }

  canExecute(): boolean {
    return this.getTargetBlocks().length > 0;
  }

  getDescription(): string {
    const targetCount = this.blockIds ? this.blockIds.length : 'all';
    return `Auto arrange ${targetCount} blocks using ${this.strategy} strategy`;
  }

  private getTargetBlocks(): BlockData[] {
    if (this.blockIds && this.blockIds.length > 0) {
      // 지정된 블록들만
      return this.blockIds
        .map(id => this.context.blockManager.getBlock(id))
        .filter((block): block is BlockData => block !== null);
    } else {
      // 모든 블록
      return this.context.blockManager.getAllBlocks();
    }
  }

  private calculateNewPositions(blocks: BlockData[]): Array<{ blockId: string; newPosition: GridPosition }> {
    const gridConfig = this.context.grid.getConfig();
    
    switch (this.strategy) {
      case 'top-left':
        return this.arrangeTopLeft(blocks, gridConfig);
      case 'masonry':
        return this.arrangeMasonry(blocks, gridConfig);
      case 'by-row':
        return this.arrangeByRow(blocks, gridConfig);
      case 'by-column':
        return this.arrangeByColumn(blocks, gridConfig);
      default:
        return this.arrangeTopLeft(blocks, gridConfig);
    }
  }

  private arrangeTopLeft(blocks: BlockData[], gridConfig: any): Array<{ blockId: string; newPosition: GridPosition }> {
    const results: Array<{ blockId: string; newPosition: GridPosition }> = [];
    const occupiedPositions = new Set<string>();
    
    // 블록을 크기 순으로 정렬 (큰 것부터)
    const sortedBlocks = [...blocks].sort((a, b) => 
      (b.size.width * b.size.height) - (a.size.width * a.size.height)
    );

    for (const block of sortedBlocks) {
      const position = this.findAvailablePosition(
        block.size, 
        occupiedPositions, 
        gridConfig
      );
      
      results.push({
        blockId: block.id,
        newPosition: { ...position, zIndex: block.position.zIndex || 1 },
      });

      // 점유된 위치 기록
      this.markOccupiedPositions(position, block.size, occupiedPositions);
    }

    return results;
  }

  private arrangeMasonry(blocks: BlockData[], gridConfig: any): Array<{ blockId: string; newPosition: GridPosition }> {
    const results: Array<{ blockId: string; newPosition: GridPosition }> = [];
    const columnHeights: number[] = new Array(gridConfig.columns).fill(1);
    
    // 블록을 높이 순으로 정렬
    const sortedBlocks = [...blocks].sort((a, b) => a.size.height - b.size.height);

    for (const block of sortedBlocks) {
      // 가장 낮은 컬럼들 찾기
      const minHeight = Math.min(...columnHeights);
      const availableColumns: number[] = [];
      
      for (let col = 0; col <= gridConfig.columns - block.size.width; col++) {
        let canPlace = true;
        let maxHeightInSpan = minHeight;
        
        for (let span = 0; span < block.size.width; span++) {
          const colIndex = col + span;
          if (colIndex < columnHeights.length) {
            maxHeightInSpan = Math.max(maxHeightInSpan, columnHeights[colIndex] || 1);
          }
        }
        
        if (maxHeightInSpan === minHeight) {
          availableColumns.push(col);
        }
      }
      
      // 가장 왼쪽 컬럼 선택
      const selectedColumn = availableColumns[0] || 0;
      const y = Math.max(...columnHeights.slice(selectedColumn, selectedColumn + block.size.width));
      
      const newPosition: GridPosition = {
        x: selectedColumn + 1, // 1-based
        y,
        zIndex: block.position.zIndex || 1,
      };
      
      results.push({
        blockId: block.id,
        newPosition,
      });

      // 컬럼 높이 업데이트
      for (let span = 0; span < block.size.width; span++) {
        columnHeights[selectedColumn + span] = y + block.size.height;
      }
    }

    return results;
  }

  private arrangeByRow(blocks: BlockData[], gridConfig: any): Array<{ blockId: string; newPosition: GridPosition }> {
    const results: Array<{ blockId: string; newPosition: GridPosition }> = [];
    let currentRow = 1;
    let currentCol = 1;
    let maxHeightInRow = 1;

    for (const block of blocks) {
      // 현재 행에 블록이 들어갈 수 있는지 확인
      if (currentCol + block.size.width - 1 > gridConfig.columns) {
        // 다음 행으로 이동
        currentRow += maxHeightInRow;
        currentCol = 1;
        maxHeightInRow = 1;
      }

      const newPosition: GridPosition = {
        x: currentCol,
        y: currentRow,
        zIndex: block.position.zIndex || 1,
      };

      results.push({
        blockId: block.id,
        newPosition,
      });

      currentCol += block.size.width;
      maxHeightInRow = Math.max(maxHeightInRow, block.size.height);
    }

    return results;
  }

  private arrangeByColumn(blocks: BlockData[], gridConfig: any): Array<{ blockId: string; newPosition: GridPosition }> {
    const results: Array<{ blockId: string; newPosition: GridPosition }> = [];
    let currentCol = 1;
    let currentRow = 1;
    let maxWidthInColumn = 1;

    for (const block of blocks) {
      // 현재 컬럼에서 블록의 높이를 확인하여 그리드 범위를 벗어나는지 체크
      // (unbounded rows가 아닌 경우)
      const exceedsRowLimit = gridConfig.rows && 
                             !this.context.grid.getUnboundedRows() && 
                             currentRow + block.size.height - 1 > (gridConfig.rows || 0);
      
      if (exceedsRowLimit) {
        // 다음 컬럼으로 이동
        currentCol += maxWidthInColumn;
        currentRow = 1;
        maxWidthInColumn = 1;
      }

      const newPosition: GridPosition = {
        x: currentCol,
        y: currentRow,
        zIndex: block.position.zIndex || 1,
      };

      results.push({
        blockId: block.id,
        newPosition,
      });

      currentRow += block.size.height;
      maxWidthInColumn = Math.max(maxWidthInColumn, block.size.width);
    }

    return results;
  }

  private findAvailablePosition(
    size: GridSize,
    occupiedPositions: Set<string>,
    gridConfig: any
  ): GridPosition {
    for (let y = 1; y <= (gridConfig.rows || 1000); y++) {
      for (let x = 1; x <= gridConfig.columns - size.width + 1; x++) {
        if (this.canPlaceAt(x, y, size, occupiedPositions)) {
          return { x, y, zIndex: 1 };
        }
      }
    }
    
    // 빈 공간을 찾지 못한 경우 (1, 1)에 배치
    return { x: 1, y: 1, zIndex: 1 };
  }

  private canPlaceAt(
    x: number,
    y: number,
    size: GridSize,
    occupiedPositions: Set<string>
  ): boolean {
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const key = `${x + dx},${y + dy}`;
        if (occupiedPositions.has(key)) {
          return false;
        }
      }
    }
    return true;
  }

  private markOccupiedPositions(
    position: GridPosition,
    size: GridSize,
    occupiedPositions: Set<string>
  ): void {
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const key = `${position.x + dx},${position.y + dy}`;
        occupiedPositions.add(key);
      }
    }
  }
}