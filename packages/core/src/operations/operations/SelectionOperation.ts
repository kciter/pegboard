import { BaseOperation } from '../BaseOperation';
import type { SelectionOperation as ISelectionOperation, OperationResult } from '../types';

/**
 * Handles block selection operations
 */
export class SelectionOperation extends BaseOperation implements ISelectionOperation {
  public readonly type = 'selection' as const;

  constructor(
    public readonly action: 'select' | 'deselect' | 'clear' | 'toggle',
    public readonly blockIds: string[],
    context: any,
    public readonly previousSelection?: string[]
  ) {
    super('selection', context);
  }

  canExecute(): boolean {
    if (!this.validateContext(['selectionManager'])) {
      return false;
    }

    if (!this.action) {
      return false;
    }

    // For non-clear actions, we need block IDs
    if (this.action !== 'clear' && (!this.blockIds || this.blockIds.length === 0)) {
      return false;
    }

    return true;
  }

  execute(): OperationResult {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute selection operation: invalid action or missing services');
    }

    try {
      const selectionManager = this.getService('selectionManager');
      
      // Store current selection for undo if not provided
      let actualPreviousSelection = this.previousSelection;
      if (!actualPreviousSelection) {
        actualPreviousSelection = selectionManager.getSelectedIds();
      }

      let result = true;

      switch (this.action) {
        case 'select':
          // Select multiple blocks (replace current selection)
          selectionManager.clearSelection();
          for (const blockId of this.blockIds) {
            selectionManager.toggleSelection(blockId);
          }
          break;

        case 'deselect':
          // Deselect specified blocks
          for (const blockId of this.blockIds) {
            if (selectionManager.isSelected(blockId)) {
              selectionManager.toggleSelection(blockId);
            }
          }
          break;

        case 'clear':
          // Clear all selections
          selectionManager.clearSelection();
          break;

        case 'toggle':
          // Toggle selection for specified blocks
          for (const blockId of this.blockIds) {
            selectionManager.toggleSelection(blockId);
          }
          break;

        default:
          return this.createErrorResult(`Unknown selection action: ${this.action}`);
      }

      if (result) {
        return this.createSuccessResult(
          { 
            action: this.action,
            blockIds: this.blockIds,
            currentSelection: selectionManager.getSelectedIds(),
            previousSelection: actualPreviousSelection
          },
          { 
            operationType: this.type,
            action: this.action,
            timestamp: this.timestamp 
          }
        );
      } else {
        return this.createErrorResult('Failed to execute selection operation');
      }
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  undo(): OperationResult {
    if (!this.previousSelection) {
      return this.createErrorResult('Cannot undo: no previous selection available');
    }

    try {
      const selectionManager = this.getService('selectionManager');
      
      // Restore previous selection
      selectionManager.clearSelection();
      for (const blockId of this.previousSelection) {
        selectionManager.toggleSelection(blockId);
      }

      return this.createSuccessResult(
        { 
          restoredSelection: this.previousSelection
        },
        { operationType: 'undo-selection' }
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred during undo'
      );
    }
  }

  getDescription(): string {
    switch (this.action) {
      case 'select':
        return `Select blocks: ${this.blockIds.join(', ')}`;
      case 'deselect':
        return `Deselect blocks: ${this.blockIds.join(', ')}`;
      case 'clear':
        return 'Clear all selections';
      case 'toggle':
        return `Toggle selection for blocks: ${this.blockIds.join(', ')}`;
      default:
        return `Unknown selection action: ${this.action}`;
    }
  }
}