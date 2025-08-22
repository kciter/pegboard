import type { IOperation, OperationContext, OperationResult } from '../types';
import { BaseOperation } from '../BaseOperation';

/**
 * ClearSelectionOperation: 선택 해제 작업
 */
export class ClearSelectionOperation extends BaseOperation implements IOperation {
  public readonly type = 'clear-selection' as const;

  private previousSelection: string[] = [];

  constructor(context: OperationContext) {
    super('clear-selection', context);
  }

  async execute(): Promise<OperationResult> {
    try {
      // 현재 선택된 블록들을 저장 (undo용)
      this.previousSelection = [...this.context.selectionManager.getSelectedIds()];

      // 선택 해제
      this.context.selectionManager.clearSelection();

      return this.createSuccessResult({
        clearedCount: this.previousSelection.length,
        clearedIds: this.previousSelection,
      });
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Clear selection failed'
      );
    }
  }

  async undo(): Promise<OperationResult> {
    try {
      // 이전 선택 상태 복원
      if (this.previousSelection.length > 0) {
        // 첫 번째 블록을 primary로, 나머지를 추가 선택으로
        this.context.selectionManager.selectSingle(this.previousSelection[0]);
        
        for (let i = 1; i < this.previousSelection.length; i++) {
          this.context.selectionManager.toggleSelection(this.previousSelection[i]);
        }
      }

      return this.createSuccessResult({
        restoredCount: this.previousSelection.length,
        restoredIds: this.previousSelection,
      });
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Clear selection undo failed'
      );
    }
  }

  canExecute(): boolean {
    return this.context.selectionManager.getSelectedIds().length > 0;
  }

  canUndo(): boolean {
    return this.previousSelection.length > 0;
  }

  getDescription(): string {
    return `Clear selection of ${this.previousSelection.length} blocks`;
  }

  getMetadata(): Record<string, any> {
    return {
      type: 'selection',
      action: 'clear',
      clearedCount: this.previousSelection.length,
      clearedIds: this.previousSelection,
    };
  }
}