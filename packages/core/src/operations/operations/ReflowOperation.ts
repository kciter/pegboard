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
import { ReflowCalculator } from '../../utils/ReflowCalculator';

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
      case 'push-away':
        return this.executePushAway(anchorBlock);
      case 'smart-fill':
        return this.executeSmartFill(anchorBlock);
      default:
        return [];
    }
  }

  private executePushAway(anchorBlock: BlockData): Array<{ id: string; from: GridPosition; to: GridPosition }> {
    return this.executeWithReflowCalculator(anchorBlock, 'push-away');
  }

  private executeSmartFill(anchorBlock: BlockData): Array<{ id: string; from: GridPosition; to: GridPosition }> {
    return this.executeWithReflowCalculator(anchorBlock, 'smart-fill');
  }

  private executeWithReflowCalculator(
    anchorBlock: BlockData, 
    strategy: 'push-away' | 'smart-fill'
  ): Array<{ id: string; from: GridPosition; to: GridPosition }> {
    const gridConfig = this.context.grid.getConfig();
    const allBlocks = this.context.blockManager.getAllBlocks();
    
    const calculator = new ReflowCalculator(
      gridConfig.columns,
      gridConfig.rows,
      true // unboundedRows
    );

    const originalAnchor = this.originalPositions.find(p => p.id === this.anchorBlockId);
    if (!originalAnchor) return [];

    const reflow = calculator.calculateReflow(
      this.anchorBlockId,
      anchorBlock.size,
      originalAnchor.position,
      this.newPosition,
      allBlocks,
      strategy
    );

    if (!reflow.success) {
      console.warn('Reflow calculation failed:', reflow.reason);
      return [];
    }

    return reflow.affectedBlocks.map(block => ({
      id: block.blockId,
      from: block.originalPosition,
      to: block.newPosition
    }));
  }

}