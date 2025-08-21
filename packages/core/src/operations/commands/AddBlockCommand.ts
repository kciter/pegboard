import type { 
  ICommand, 
  IOperation, 
  OperationContext,
  AddBlockCommand as IAddBlockCommand
} from '../types';
import type { BlockData } from '../../types';
import { OperationFactory } from '../OperationFactory';
import { generateId } from '../../utils';

/**
 * Command to add a new block to the pegboard
 */
export class AddBlockCommand implements IAddBlockCommand {
  public readonly id: string;
  public readonly name = 'add-block' as const;
  public readonly description: string;

  constructor(public readonly blockData: Partial<BlockData>) {
    this.id = generateId();
    this.description = `Add ${blockData.type || 'unknown'} block`;
  }

  createOperations(context: OperationContext): IOperation[] {
    const factory = new OperationFactory(context);
    
    // Validate block data and fill in defaults if needed
    const completeBlockData = this.prepareBlockData(context);
    
    const operations: IOperation[] = [];
    
    // 1. Create the block
    operations.push(factory.createBlockOperation(completeBlockData));
    
    // 2. Optionally select the new block
    // Note: We can't know the block ID until the create operation executes
    // This is a limitation of the current design - we might need to refactor
    // to support post-execution operations or use callbacks
    
    return operations;
  }

  canExecute(context: OperationContext): boolean {
    // Check if we have required services
    if (!context.blockManager) {
      return false;
    }

    // Validate block data
    if (!this.blockData.type) {
      return false;
    }

    // Check if extension exists for this block type
    const blockManager = context.blockManager;
    const extension = blockManager.getExtension?.(this.blockData.type);
    if (!extension) {
      return false;
    }

    return true;
  }

  getMetadata(): Record<string, any> {
    return {
      blockType: this.blockData.type,
      hasPosition: !!this.blockData.position,
      hasSize: !!this.blockData.size,
      hasAttributes: !!this.blockData.attributes,
    };
  }

  private prepareBlockData(context: OperationContext): Partial<BlockData> {
    const data = { ...this.blockData };
    
    // Fill in position if not provided
    if (!data.position && context.blockManager && context.grid) {
      const blockManager = context.blockManager;
      const grid = context.grid;
      
      const existingBlocks = blockManager.getAllBlocks();
      const defaultSize = data.size || { width: 2, height: 2 };
      
      // Find available position
      const availablePosition = grid.findAvailablePosition(defaultSize, existingBlocks);
      if (availablePosition) {
        data.position = availablePosition;
      }
    }

    // Fill in default size if not provided
    if (!data.size) {
      data.size = { width: 2, height: 2 };
    }

    // Fill in default interaction flags
    if (data.movable === undefined) {
      data.movable = true;
    }
    if (data.resizable === undefined) {
      data.resizable = true;
    }

    return data;
  }
}