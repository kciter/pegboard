import type { 
  ICommand, 
  IOperation, 
  OperationContext,
  DeleteSelectedCommand as IDeleteSelectedCommand
} from '../types';
import { OperationFactory } from '../OperationFactory';
import { generateId } from '../../utils';

/**
 * Command to delete all currently selected blocks
 */
export class DeleteSelectedCommand implements IDeleteSelectedCommand {
  public readonly id: string;
  public readonly name = 'delete-selected' as const;
  public readonly description = 'Delete selected blocks';

  constructor() {
    this.id = generateId();
  }

  createOperations(context: OperationContext): IOperation[] {
    if (!context.selectionManager) {
      return [];
    }

    const selectionManager = context.selectionManager;
    const selectedIds = selectionManager.getSelectedIds();
    
    if (selectedIds.length === 0) {
      return [];
    }

    const factory = new OperationFactory(context);
    const operations: IOperation[] = [];
    
    // 1. Clear selection first (optional - the delete operations will implicitly do this)
    operations.push(factory.selectionOperation('clear', [], selectedIds));
    
    // 2. Delete all selected blocks
    for (const blockId of selectedIds) {
      operations.push(factory.deleteBlockOperation(blockId));
    }
    
    return operations;
  }

  canExecute(context: OperationContext): boolean {
    // Check if we have required services
    if (!context.selectionManager || !context.blockManager) {
      return false;
    }

    // Check if there are any selected blocks
    const selectionManager = context.selectionManager;
    const selectedIds = selectionManager.getSelectedIds();
    
    return selectedIds.length > 0;
  }

  getMetadata(): Record<string, any> {
    return {
      commandType: 'destructive',
      requiresSelection: true,
    };
  }
}