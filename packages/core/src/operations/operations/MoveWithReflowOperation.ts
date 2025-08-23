import type { 
  IOperation, 
  OperationContext, 
  OperationResult 
} from '../types';
import type { GridPosition } from '../../types';
import { generateId } from '../../utils';
import { ReflowCalculator } from '../../utils/ReflowCalculator';

/**
 * MoveWithReflowOperation: 블록 이동과 리플로우를 통합한 오퍼레이션
 */
export class MoveWithReflowOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'move-with-reflow' as const;
  public readonly timestamp: number;
  
  private originalPositions: Array<{ id: string; position: GridPosition }> = [];
  private reflowCalculator: ReflowCalculator;

  constructor(
    private blockId: string,
    private toPosition: GridPosition,
    private reflowStrategy: 'push-away' | 'smart-fill' | 'none',
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
    
    const gridConfig = this.context.grid.getConfig();
    this.reflowCalculator = new ReflowCalculator(
      gridConfig.columns,
      gridConfig.rows,
      this.context.grid.getUnboundedRows()
    );
  }

  async execute(): Promise<OperationResult> {
    try {
      const block = this.context.blockManager.getBlock(this.blockId);
      if (!block) {
        return {
          success: false,
          error: `Block ${this.blockId} not found`,
        };
      }

      const fromPosition = block.position;
      
      // 모든 블록의 원래 위치 저장
      this.originalPositions = this.context.blockManager.getAllBlocks().map((b: any) => ({
        id: b.id,
        position: { ...b.position },
      }));

      // 리플로우 계산
      const reflow = this.reflowCalculator.calculateReflow(
        this.blockId,
        block.size,
        fromPosition,
        this.toPosition,
        this.context.blockManager.getAllBlocks(),
        this.reflowStrategy
      );

      if (!reflow.success) {
        return {
          success: false,
          error: reflow.reason || 'Reflow calculation failed',
        };
      }

      // 1. 먼저 영향받는 블록들을 이동 (공간 확보)
      const movedBlocks: Array<{ id: string; from: GridPosition; to: GridPosition }> = [];

      for (const affectedBlock of reflow.affectedBlocks) {
        const moveResult = this.context.blockManager.moveBlock(
          affectedBlock.blockId,
          affectedBlock.newPosition
        );
        
        if (moveResult.success) {
          movedBlocks.push({
            id: affectedBlock.blockId,
            from: affectedBlock.originalPosition,
            to: affectedBlock.newPosition
          });
        } else {
          // 하나라도 실패하면 롤백
          for (const moved of movedBlocks) {
            const originalPos = this.originalPositions.find(p => p.id === moved.id);
            if (originalPos) {
              this.context.blockManager.moveBlock(moved.id, originalPos.position);
            }
          }
          return {
            success: false,
            error: `Failed to move affected block ${affectedBlock.blockId}`,
          };
        }
      }

      // 2. 그 다음 메인 블록 이동
      const mainMoveResult = this.context.blockManager.moveBlock(this.blockId, this.toPosition);
      if (!mainMoveResult.success) {
        // 메인 블록 이동 실패시 모든 블록 롤백
        for (const moved of movedBlocks) {
          const originalPos = this.originalPositions.find(p => p.id === moved.id);
          if (originalPos) {
            this.context.blockManager.moveBlock(moved.id, originalPos.position);
          }
        }
        return {
          success: false,
          error: mainMoveResult.error || 'Failed to move main block',
        };
      }

      movedBlocks.push({ id: this.blockId, from: fromPosition, to: this.toPosition });

      return {
        success: true,
        data: { 
          movedBlocks,
          mainBlockId: this.blockId,
          reflowStrategy: this.reflowStrategy,
          affectedBlockCount: reflow.affectedBlocks.length
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Move with reflow failed',
      };
    }
  }

  async undo(): Promise<OperationResult> {
    try {
      // 모든 블록을 원래 위치로 복원
      let restoredCount = 0;
      
      for (const { id, position } of this.originalPositions) {
        const restoreResult = this.context.blockManager.moveBlock(id, position);
        if (restoreResult.success) {
          restoredCount++;
        }
      }

      return {
        success: true,
        data: { restoredCount },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Move with reflow undo failed',
      };
    }
  }

  canExecute(): boolean {
    const block = this.context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getDescription(): string {
    return `Move block ${this.blockId} to (${this.toPosition.x}, ${this.toPosition.y}) with ${this.reflowStrategy} reflow`;
  }
}