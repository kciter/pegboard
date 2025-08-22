import { BaseOperation } from '../BaseOperation';
import type { OperationResult } from '../types';
import type { GridSize } from '../../types';

/**
 * Resizes a block to a new size
 */
export class ResizeBlockOperation extends BaseOperation {
  public readonly type = 'resize-block' as const;

  constructor(
    public readonly blockId: string,
    public readonly newSize: GridSize,
    context: any,
    public readonly oldSize?: GridSize
  ) {
    super('resize-block', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['blockManager'])) {
      return false;
    }

    if (!this.blockId || !this.newSize) {
      return false;
    }

    // Check if block exists
    const blockManager = this.getService('blockManager');
    const block = blockManager.getBlock(this.blockId);
    return block != null;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute resize block operation: block not found or missing services');
    }

    try {
      const blockManager = this.getService('blockManager');
      
      // Store old size if not provided (for undo)
      let actualOldSize = this.oldSize;
      if (!actualOldSize) {
        const block = blockManager.getBlock(this.blockId);
        if (block) {
          actualOldSize = block.size;
        }
      }

      const result = blockManager.resizeBlock(this.blockId, this.newSize);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            newSize: this.newSize,
            oldSize: actualOldSize
          },
          { 
            operationType: this.type,
            blockId: this.blockId,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to resize block');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    if (!this.oldSize) {
      return this.createErrorResult('Cannot undo: no old size available');
    }

    try {
      const blockManager = this.getService('blockManager');
      const result = blockManager.resizeBlock(this.blockId, this.oldSize);

      if (result.success) {
        return this.createSuccessResult(
          { 
            blockId: this.blockId,
            restoredSize: this.oldSize
          },
          { operationType: 'undo-resize-block' }
        );
      } else {
        return this.createErrorResult(result.error || 'Failed to undo block resize');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    return `Resize block '${this.blockId}' from ${this.oldSize?.width || '?'}x${this.oldSize?.height || '?'} to ${this.newSize.width}x${this.newSize.height}`;
  }
}