import type { 
  IOperationFactory, 
  CreateBlockOperation as ICreateBlockOperation,
  DeleteBlockOperation as IDeleteBlockOperation,
  UpdateBlockOperation as IUpdateBlockOperation,
  MoveBlockOperation as IMoveBlockOperation,
  ResizeBlockOperation as IResizeBlockOperation,
  SelectionOperation as ISelectionOperation,
  IBatchOperation,
  BatchStrategy,
  IOperation,
  OperationContext
} from './types';

import {
  CreateBlockOperation,
  DeleteBlockOperation,
  MoveBlockOperation,
  SelectionOperation,
  BatchOperation
} from './operations';

import type { BlockData, GridPosition, GridSize } from '../types';

/**
 * Factory for creating operation instances
 */
export class OperationFactory implements IOperationFactory {
  constructor(private context: OperationContext) {}

  createBlockOperation(blockData: Partial<BlockData>): ICreateBlockOperation {
    return new CreateBlockOperation(blockData, this.context);
  }

  deleteBlockOperation(blockId: string): IDeleteBlockOperation {
    return new DeleteBlockOperation(blockId, this.context);
  }

  updateBlockOperation(
    blockId: string, 
    updates: Partial<BlockData>, 
    oldData?: BlockData
  ): IUpdateBlockOperation {
    // TODO: Implement UpdateBlockOperation
    throw new Error('UpdateBlockOperation not implemented yet');
  }

  moveBlockOperation(
    blockId: string, 
    newPosition: GridPosition, 
    oldPosition?: GridPosition
  ): IMoveBlockOperation {
    return new MoveBlockOperation(blockId, newPosition, this.context, oldPosition);
  }

  resizeBlockOperation(
    blockId: string, 
    newSize: GridSize, 
    oldSize?: GridSize
  ): IResizeBlockOperation {
    // TODO: Implement ResizeBlockOperation
    throw new Error('ResizeBlockOperation not implemented yet');
  }

  selectionOperation(
    action: 'select' | 'deselect' | 'clear' | 'toggle',
    blockIds: string[],
    previousSelection?: string[]
  ): ISelectionOperation {
    return new SelectionOperation(action, blockIds, this.context, previousSelection);
  }

  batchOperation(
    operations: IOperation[], 
    strategy: BatchStrategy = 'all-or-nothing'
  ): IBatchOperation {
    return new BatchOperation(operations, strategy, this.context);
  }

  // Convenience methods for common operation combinations

  /**
   * Create operation to delete multiple blocks
   */
  deleteMultipleBlocks(blockIds: string[]): IBatchOperation {
    const operations = blockIds.map(id => this.deleteBlockOperation(id));
    return this.batchOperation(operations, 'best-effort');
  }

  /**
   * Create operation to move multiple blocks by delta
   */
  moveMultipleBlocks(
    blockIds: string[], 
    deltaX: number, 
    deltaY: number
  ): IBatchOperation {
    // We need to get current positions first
    // This is a bit tricky in the factory pattern
    // In a real implementation, we might want to pass a callback or use a different pattern
    const operations: IOperation[] = [];
    
    for (const blockId of blockIds) {
      // Note: This is a simplified version. In practice, we'd need to:
      // 1. Get current position from BlockManager
      // 2. Calculate new position
      // 3. Create move operation
      
      // For now, create placeholder operations
      // This should be implemented when integrating with actual managers
      operations.push({
        id: `move-${blockId}`,
        type: 'move-block-placeholder',
        timestamp: Date.now(),
        execute: () => ({ success: true }),
        canExecute: () => true,
        getDescription: () => `Move block ${blockId} by (${deltaX}, ${deltaY})`
      } as IOperation);
    }

    return this.batchOperation(operations, 'best-effort');
  }

  /**
   * Create operation to duplicate a block
   */
  duplicateBlockOperation(sourceBlockId: string): IBatchOperation {
    // This would involve:
    // 1. Get source block data
    // 2. Find available position
    // 3. Create new block
    // 4. Optionally select new block
    
    // For now, return placeholder
    return this.batchOperation([], 'all-or-nothing');
  }

  /**
   * Update the operation context (useful for dependency injection changes)
   */
  updateContext(newContext: Partial<OperationContext>): void {
    this.context = { ...this.context, ...newContext };
  }

  /**
   * Get current context (for debugging/testing)
   */
  getContext(): Readonly<OperationContext> {
    return { ...this.context };
  }
}