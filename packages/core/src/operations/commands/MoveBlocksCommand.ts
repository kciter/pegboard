import type { 
  ICommand, 
  IOperation, 
  OperationContext,
  MoveBlocksCommand as IMoveBlocksCommand
} from '../types';
import { OperationFactory } from '../OperationFactory';
import { generateId } from '../../utils';

/**
 * Command to move multiple blocks by a delta amount
 */
export class MoveBlocksCommand implements IMoveBlocksCommand {
  public readonly id: string;
  public readonly name = 'move-blocks' as const;
  public readonly description: string;

  constructor(
    public readonly blockIds: string[],
    public readonly deltaPosition: { x: number; y: number }
  ) {
    this.id = generateId();
    this.description = `Move ${blockIds.length} blocks by (${deltaPosition.x}, ${deltaPosition.y})`;
  }

  createOperations(context: OperationContext): IOperation[] {
    if (!context.blockManager) {
      return [];
    }

    const blockManager = context.blockManager;
    const factory = new OperationFactory(context);
    const operations: IOperation[] = [];
    
    for (const blockId of this.blockIds) {
      const block = blockManager.getBlock(blockId);
      if (!block) {
        continue; // Skip blocks that don't exist
      }

      const currentPosition = block.position;
      const newPosition = {
        x: Math.max(0, currentPosition.x + this.deltaPosition.x),
        y: Math.max(0, currentPosition.y + this.deltaPosition.y),
        zIndex: currentPosition.zIndex,
      };

      // Only create move operation if position actually changes
      if (newPosition.x !== currentPosition.x || newPosition.y !== currentPosition.y) {
        operations.push(factory.moveBlockOperation(blockId, newPosition, currentPosition));
      }
    }
    
    return operations;
  }

  canExecute(context: OperationContext): boolean {
    // Check if we have required services
    if (!context.blockManager) {
      return false;
    }

    // Check if we have blocks to move
    if (this.blockIds.length === 0) {
      return false;
    }

    // Check if at least one block exists and can be moved
    const blockManager = context.blockManager;
    return this.blockIds.some(blockId => {
      const block = blockManager.getBlock(blockId);
      return block && block.movable !== false;
    });
  }

  getMetadata(): Record<string, any> {
    return {
      blockCount: this.blockIds.length,
      deltaX: this.deltaPosition.x,
      deltaY: this.deltaPosition.y,
      requiresMovableBlocks: true,
    };
  }
}