import type { ICommand, IOperation, OperationContext } from '../types';
import { ClearSelectionOperation } from '../operations/ClearSelectionOperation';
import { generateId } from '../../utils';

/**
 * ClearSelectionCommand: 모든 선택을 해제
 */
export class ClearSelectionCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'clear-selection' as const;
  public readonly description = 'Clear all block selections';

  constructor() {
    this.id = generateId();
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new ClearSelectionOperation(context)];
  }

  canExecute(context: OperationContext): boolean {
    // 선택된 블록이 하나라도 있으면 실행 가능
    return context.selectionManager.getSelectedIds().length > 0;
  }

  getMetadata(): Record<string, any> {
    return {
      type: 'selection',
      action: 'clear',
    };
  }
}