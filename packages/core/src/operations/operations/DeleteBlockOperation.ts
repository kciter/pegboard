import { BaseOperation } from '../BaseOperation';
import type { DeleteBlockOperation as IDeleteBlockOperation, OperationResult } from '../types';
import type { BlockData } from '../../types';

/**
 * Deletes a block from the pegboard
 */
export class DeleteBlockOperation extends BaseOperation implements IDeleteBlockOperation {
  public readonly type = 'delete-block' as const;
  private deletedBlockData: BlockData | null = null;

  constructor(
    public readonly blockId: string,
    context: any
  ) {
    super('delete-block', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['blockManager'])) {
      return false;
    }

    if (!this.blockId) {
      return false;
    }

    // Check if block exists
    const blockManager = this.getService('blockManager');
    const block = blockManager.getBlock(this.blockId);
    return block != null;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute delete block operation: block not found or missing services');
    }

    try {
      const blockManager = this.getService('blockManager');
      
      // Store block data for undo
      this.deletedBlockData = blockManager.getBlock(this.blockId);
      
      const result = blockManager.removeBlock(this.blockId);

      if (result.success) {
        return this.createSuccessResult(
          { deletedBlockId: this.blockId },
          { 
            operationType: this.type,
            blockId: this.blockId,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to delete block');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    if (!this.deletedBlockData) {
      return this.createErrorResult('Cannot undo: no backup data available');
    }

    try {
      const blockManager = this.getService('blockManager');
      const result = blockManager.addBlock(this.deletedBlockData);

      if (result.success) {
        return this.createSuccessResult(
          { restoredBlockId: result.blockId },
          { operationType: 'undo-delete-block' }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to undo block deletion');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    return `Delete block '${this.blockId}'`;
  }
}