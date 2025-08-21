import type { 
  ICommand, 
  IOperation, 
  OperationContext
} from '../types';
import { SelectionOperation } from '../operations/SelectionOperation';
import { generateId } from '../../utils';
import type { Block } from '../../Block';

/**
 * Selection criteria types
 */
export interface SelectionCriteria {
  type: 'lasso' | 'all' | 'by-type' | 'by-position' | 'by-attribute';
  params?: any;
}

export interface LassoSelectionParams {
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  isAdditive: boolean;
  containerBounds?: DOMRect;
}

/**
 * Command to select blocks by criteria (lasso, all, type, etc.)
 */
export class SelectByCriteriaCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'select-by-criteria' as const;
  public readonly description: string;

  constructor(public readonly criteria: SelectionCriteria) {
    this.id = generateId();
    this.description = `Select blocks by ${criteria.type}`;
  }

  createOperations(context: OperationContext): IOperation[] {
    if (!context.blockManager || !context.selectionManager) {
      return [];
    }

    let targetBlockIds: string[] = [];
    const previousSelection = context.selectionManager.getSelectedIds();

    switch (this.criteria.type) {
      case 'lasso':
        targetBlockIds = this.findBlocksInLassoBounds(context, this.criteria.params as LassoSelectionParams);
        break;
      case 'all':
        targetBlockIds = context.blockManager.getAllBlocks().map((block: any) => block.id);
        break;
      case 'by-type':
        targetBlockIds = this.findBlocksByType(context, this.criteria.params?.type);
        break;
      case 'by-position':
        targetBlockIds = this.findBlocksByPosition(context, this.criteria.params);
        break;
      case 'by-attribute':
        targetBlockIds = this.findBlocksByAttribute(context, this.criteria.params);
        break;
    }

    // Determine the selection action
    const isAdditive = this.criteria.params?.isAdditive || false;
    let action: 'select' | 'clear' = 'select';
    let finalBlockIds = targetBlockIds;

    if (!isAdditive && targetBlockIds.length > 0) {
      // Clear existing selection first if not additive
      const operations: IOperation[] = [];
      
      // Clear current selection
      if (previousSelection.length > 0) {
        operations.push(new SelectionOperation('clear', [], context, previousSelection));
      }

      // Select new blocks
      if (finalBlockIds.length > 0) {
        operations.push(new SelectionOperation('select', finalBlockIds, context, []));
      }

      return operations;
    } else {
      // Additive selection - just add to existing
      return [new SelectionOperation('select', finalBlockIds, context, previousSelection)];
    }
  }

  canExecute(context: OperationContext): boolean {
    return !!(context.blockManager && context.selectionManager);
  }

  getMetadata(): Record<string, any> {
    return {
      criteria: this.criteria,
    };
  }

  private findBlocksInLassoBounds(context: OperationContext, params: LassoSelectionParams): string[] {
    if (!context.blockManager) return [];

    const blocks = context.blockManager.getAllBlockInstances() as Block[];
    const intersecting: string[] = [];
    const bounds = params.bounds;

    for (const block of blocks) {
      const blockRect = block.getBoundingRect();
      const containerBounds = params.containerBounds;
      
      // Calculate block bounds relative to container if provided
      let blockBounds;
      if (containerBounds) {
        blockBounds = {
          left: blockRect.left - containerBounds.left,
          top: blockRect.top - containerBounds.top,
          right: blockRect.right - containerBounds.left,
          bottom: blockRect.bottom - containerBounds.top,
        };
      } else {
        blockBounds = {
          left: blockRect.left,
          top: blockRect.top,
          right: blockRect.right,
          bottom: blockRect.bottom,
        };
      }

      // Check intersection
      const hasIntersection = !(
        blockBounds.right < bounds.left ||
        blockBounds.left > bounds.right ||
        blockBounds.bottom < bounds.top ||
        blockBounds.top > bounds.bottom
      );

      if (hasIntersection) {
        intersecting.push(block.getData().id);
      }
    }

    return intersecting;
  }

  private findBlocksByType(context: OperationContext, type: string): string[] {
    if (!context.blockManager || !type) return [];

    const blocks = context.blockManager.getAllBlocks();
    return blocks
      .filter((block: any) => block.type === type)
      .map((block: any) => block.id);
  }

  private findBlocksByPosition(context: OperationContext, params: any): string[] {
    if (!context.blockManager || !params) return [];

    const blocks = context.blockManager.getAllBlocks();
    const { minX, maxX, minY, maxY } = params;

    return blocks
      .filter((block: any) => {
        const pos = block.position;
        return (!minX || pos.x >= minX) &&
               (!maxX || pos.x <= maxX) &&
               (!minY || pos.y >= minY) &&
               (!maxY || pos.y <= maxY);
      })
      .map((block: any) => block.id);
  }

  private findBlocksByAttribute(context: OperationContext, params: any): string[] {
    if (!context.blockManager || !params) return [];

    const blocks = context.blockManager.getAllBlocks();
    const { key, value, operator = 'equals' } = params;

    return blocks
      .filter((block: any) => {
        const attrValue = block.attributes?.[key];
        switch (operator) {
          case 'equals':
            return attrValue === value;
          case 'contains':
            return typeof attrValue === 'string' && attrValue.includes(value);
          case 'greater':
            return typeof attrValue === 'number' && attrValue > value;
          case 'less':
            return typeof attrValue === 'number' && attrValue < value;
          default:
            return false;
        }
      })
      .map((block: any) => block.id);
  }
}