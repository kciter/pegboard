import type { 
  IOperation, 
  OperationContext, 
  OperationResult 
} from '../types';
import type { 
  DragReflowStrategy, 
  GridPosition, 
  GridSize, 
  BlockData 
} from '../../types';
import { generateId } from '../../utils';

/**
 * ReflowOperation: 블록 이동에 따른 다른 블록들의 자동 재배치
 */
export class ReflowOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'reflow' as const;
  public readonly timestamp: number;
  private originalPositions: Array<{ id: string; position: GridPosition }> = [];

  constructor(
    private anchorBlockId: string,
    private newPosition: GridPosition,
    private strategy: DragReflowStrategy,
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  async execute(): Promise<OperationResult> {
    try {
      if (this.strategy === 'none') {
        return {
          success: true,
          data: { reflowedBlocks: [] },
        };
      }

      const anchorBlock = this.context.blockManager.getBlock(this.anchorBlockId);
      if (!anchorBlock) {
        return {
          success: false,
          error: `Anchor block ${this.anchorBlockId} not found`,
        };
      }

      // 원래 위치 저장
      this.originalPositions = this.context.blockManager.getAllBlocks().map((block: BlockData) => ({
        id: block.id,
        position: { ...block.position },
      }));

      // 앵커 블록을 먼저 이동
      const moveResult = this.context.blockManager.moveBlock(this.anchorBlockId, this.newPosition);
      if (!moveResult.success) {
        return {
          success: false,
          error: moveResult.error || 'Failed to move anchor block',
        };
      }

      // 리플로우 전략에 따라 다른 블록들 재배치
      const reflowedBlocks = await this.executeReflowStrategy(anchorBlock);

      return {
        success: true,
        data: { 
          reflowedBlocks,
          anchorBlockId: this.anchorBlockId,
          strategy: this.strategy,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Reflow failed',
      };
    }
  }

  async undo(): Promise<OperationResult> {
    try {
      // 모든 블록을 원래 위치로 복원
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
        error: error instanceof Error ? error.message : 'Reflow undo failed',
      };
    }
  }

  canExecute(): boolean {
    const anchorBlock = this.context.blockManager.getBlock(this.anchorBlockId);
    return anchorBlock !== null && this.strategy !== 'none';
  }

  getDescription(): string {
    return `Reflow blocks after moving ${this.anchorBlockId} using ${this.strategy} strategy`;
  }

  private async executeReflowStrategy(anchorBlock: BlockData): Promise<Array<{ id: string; from: GridPosition; to: GridPosition }>> {
    switch (this.strategy) {
      case 'axis-shift':
        return this.executeAxisShift(anchorBlock);
      default:
        return [];
    }
  }

  private executeAxisShift(anchorBlock: BlockData): Array<{ id: string; from: GridPosition; to: GridPosition }> {
    const reflowedBlocks: Array<{ id: string; from: GridPosition; to: GridPosition }> = [];
    const allBlocks = this.context.blockManager.getAllBlocks().filter((b: BlockData) => b.id !== this.anchorBlockId);
    const gridConfig = this.context.grid.getConfig();

    // 앵커 블록의 이동 벡터 계산
    const originalAnchor = this.originalPositions.find(p => p.id === this.anchorBlockId);
    if (!originalAnchor) return reflowedBlocks;

    const deltaX = this.newPosition.x - originalAnchor.position.x;
    const deltaY = this.newPosition.y - originalAnchor.position.y;

    // 영향을 받는 블록들 찾기 및 이동
    for (const block of allBlocks) {
      const originalPos = this.originalPositions.find(p => p.id === block.id)?.position;
      if (!originalPos) continue;

      let shouldMove = false;
      let newX = originalPos.x;
      let newY = originalPos.y;

      // 수평 이동의 경우 (X축 기반 리플로우)
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
          // 앵커가 오른쪽으로 이동: 앵커 오른쪽에 있는 블록들을 밀어냄
          if (this.blocksOverlapHorizontally(originalAnchor.position, anchorBlock.size, originalPos, block.size)) {
            if (originalPos.x >= originalAnchor.position.x) {
              shouldMove = true;
              newX = Math.max(1, originalPos.x + deltaX);
            }
          }
        } else {
          // 앵커가 왼쪽으로 이동: 앵커 왼쪽에 있는 블록들을 당김
          if (this.blocksOverlapHorizontally(originalAnchor.position, anchorBlock.size, originalPos, block.size)) {
            if (originalPos.x <= originalAnchor.position.x) {
              shouldMove = true;
              newX = Math.max(1, originalPos.x + deltaX);
            }
          }
        }
      } else {
        // 수직 이동의 경우 (Y축 기반 리플로우)
        if (deltaY > 0) {
          // 앵커가 아래로 이동: 앵커 아래에 있는 블록들을 밀어냄
          if (this.blocksOverlapVertically(originalAnchor.position, anchorBlock.size, originalPos, block.size)) {
            if (originalPos.y >= originalAnchor.position.y) {
              shouldMove = true;
              newY = Math.max(1, originalPos.y + deltaY);
            }
          }
        } else {
          // 앵커가 위로 이동: 앵커 위에 있는 블록들을 당김
          if (this.blocksOverlapVertically(originalAnchor.position, anchorBlock.size, originalPos, block.size)) {
            if (originalPos.y <= originalAnchor.position.y) {
              shouldMove = true;
              newY = Math.max(1, originalPos.y + deltaY);
            }
          }
        }
      }

      if (shouldMove) {
        // 그리드 경계 체크
        if (newX + block.size.width - 1 <= gridConfig.columns) {
          const hasRowLimit = gridConfig.rows && !this.context.grid.getUnboundedRows();
          if (!hasRowLimit || newY + block.size.height - 1 <= gridConfig.rows!) {
            const newPosition: GridPosition = {
              x: newX,
              y: newY,
              zIndex: originalPos.zIndex,
            };

            // 충돌 검사
            if (this.isPositionSafe(newPosition, block.size, block.id)) {
              const moveResult = this.context.blockManager.moveBlock(block.id, newPosition);
              if (moveResult.success) {
                reflowedBlocks.push({
                  id: block.id,
                  from: originalPos,
                  to: newPosition,
                });
              }
            }
          }
        }
      }
    }

    return reflowedBlocks;
  }

  private blocksOverlapHorizontally(
    pos1: GridPosition, 
    size1: GridSize, 
    pos2: GridPosition, 
    size2: GridSize
  ): boolean {
    // Y축에서 겹치는지 확인 (수평 리플로우를 위해)
    const pos1EndY = pos1.y + size1.height - 1;
    const pos2EndY = pos2.y + size2.height - 1;
    
    return !(pos1EndY < pos2.y || pos1.y > pos2EndY);
  }

  private blocksOverlapVertically(
    pos1: GridPosition, 
    size1: GridSize, 
    pos2: GridPosition, 
    size2: GridSize
  ): boolean {
    // X축에서 겹치는지 확인 (수직 리플로우를 위해)
    const pos1EndX = pos1.x + size1.width - 1;
    const pos2EndX = pos2.x + size2.width - 1;
    
    return !(pos1EndX < pos2.x || pos1.x > pos2EndX);
  }

  private isPositionSafe(position: GridPosition, size: GridSize, excludeId: string): boolean {
    // 그리드 유효성 검사
    if (!this.context.grid.isValidGridPosition(position, size)) {
      return false;
    }

    // 충돌 검사
    const existingBlocks = this.context.blockManager.getAllBlocks();
    return !this.context.grid.checkGridCollision(position, size, excludeId, existingBlocks);
  }
}