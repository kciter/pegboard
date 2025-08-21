import { BaseOperation } from '../BaseOperation';
import type { CreateBlockOperation as ICreateBlockOperation, OperationResult } from '../types';
import type { BlockData } from '../../types';

/**
 * Creates a new block in the pegboard
 */
export class CreateBlockOperation extends BaseOperation implements ICreateBlockOperation {
  public readonly type = 'create-block' as const;

  constructor(
    public readonly blockData: Partial<BlockData>,
    context: any
  ) {
    super('create-block', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['blockManager'])) {
      return false;
    }

    // Validate required block data
    if (!this.blockData.type) {
      return false;
    }

    if (!this.blockData.position || !this.blockData.size) {
      return false;
    }

    return true;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute create block operation: missing required data or services');
    }

    try {
      const blockManager = this.getService('blockManager');
      const result = blockManager.addBlock(this.blockData);

      if (result.success) {
        return this.createSuccessResult(
          { blockId: result.blockId },
          { 
            operationType: this.type,
            blockData: this.blockData,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to create block');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    // To undo creation, we need the created block ID
    const executionResult = this.execute();
    if (!executionResult.success || !executionResult.data?.blockId) {
      return this.createErrorResult('Cannot undo: no block ID available');
    }

    try {
      const blockManager = this.getService('blockManager');
      const deleteResult = blockManager.removeBlock(executionResult.data.blockId);

      if (deleteResult.success) {
        return this.createSuccessResult(
          { deletedBlockId: executionResult.data.blockId },
          { operationType: 'undo-create-block' }
        );
      } else {
        return this.createErrorResult(deleteResult.error || 'Failed to undo block creation');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    return `Create block of type '${this.blockData.type}' at position (${this.blockData.position?.x}, ${this.blockData.position?.y})`;
  }
}