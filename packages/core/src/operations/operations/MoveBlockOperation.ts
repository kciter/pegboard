import { BaseOperation } from '../BaseOperation';
import type { MoveBlockOperation as IMoveBlockOperation, OperationResult } from '../types';
import type { GridPosition } from '../../types';

/**
 * Moves a block to a new position
 */
export class MoveBlockOperation extends BaseOperation implements IMoveBlockOperation {
  public readonly type = 'move-block' as const;

  constructor(
    public readonly blockId: string,
    public readonly newPosition: GridPosition,
    context: any,
    public readonly oldPosition?: GridPosition
  ) {
    super('move-block', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['blockManager'])) {
      return false;
    }

    if (!this.blockId || !this.newPosition) {
      return false;
    }

    // Check if block exists
    const blockManager = this.getService('blockManager');
    const block = blockManager.getBlock(this.blockId);
    return block != null;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute move block operation: block not found or missing services');
    }

    try {
      const blockManager = this.getService('blockManager');
      
      // Store old position if not provided (for undo)
      let actualOldPosition = this.oldPosition;
      if (!actualOldPosition) {
        const block = blockManager.getBlock(this.blockId);
        if (block) {
          actualOldPosition = block.position;
        }
      }

      const result = blockManager.moveBlock(this.blockId, this.newPosition);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            newPosition: this.newPosition,
            oldPosition: actualOldPosition
          },
          { 
            operationType: this.type,
            blockId: this.blockId,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to move block');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    if (!this.oldPosition) {
      return this.createErrorResult('Cannot undo: no old position available');
    }

    try {
      const blockManager = this.getService('blockManager');
      const result = blockManager.moveBlock(this.blockId, this.oldPosition);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            restoredPosition: this.oldPosition
          },
          { operationType: 'undo-move-block' }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to undo block move');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    return `Move block '${this.blockId}' from (${this.oldPosition?.x || '?'}, ${this.oldPosition?.y || '?'}) to (${this.newPosition.x}, ${this.newPosition.y})`;
  }
}