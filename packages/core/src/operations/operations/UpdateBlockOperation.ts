import { BaseOperation } from '../BaseOperation';
import type { OperationResult } from '../types';
import type { BlockData } from '../../types';

/**
 * Updates a block's data
 */
export class UpdateBlockOperation extends BaseOperation {
  public readonly type = 'update-block' as const;

  constructor(
    public readonly blockId: string,
    public readonly updates: Partial<BlockData>,
    context: any,
    public readonly oldData?: Partial<BlockData>
  ) {
    super('update-block', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['blockManager'])) {
      return false;
    }

    if (!this.blockId || !this.updates) {
      return false;
    }

    // Check if block exists
    const blockManager = this.getService('blockManager');
    const block = blockManager.getBlock(this.blockId);
    return block != null;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute update block operation: block not found or missing services');
    }

    try {
      const blockManager = this.getService('blockManager');
      
      // Store old data if not provided (for undo)
      let actualOldData = this.oldData;
      if (!actualOldData) {
        const block = blockManager.getBlock(this.blockId);
        if (block) {
          // Store only the fields that will be updated
          actualOldData = {};
          for (const key in this.updates) {
            if (key in block) {
              (actualOldData as any)[key] = (block as any)[key];
            }
          }
        }
      }

      const result = blockManager.updateBlock(this.blockId, this.updates);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            updates: this.updates,
            oldData: actualOldData
          },
          { 
            operationType: this.type,
            blockId: this.blockId,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to update block');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    if (!this.oldData) {
      return this.createErrorResult('Cannot undo: no old data available');
    }

    try {
      const blockManager = this.getService('blockManager');
      const result = blockManager.updateBlock(this.blockId, this.oldData);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            restoredData: this.oldData
          },
          { operationType: 'undo-update-block' }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to undo block update');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    const updateKeys = Object.keys(this.updates).join(', ');
    return `Update block '${this.blockId}' fields: ${updateKeys}`;
  }
}