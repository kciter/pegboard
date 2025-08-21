import type { ICommand, IOperation, OperationContext } from '../types';
import { AutoArrangeOperation } from '../operations/AutoArrangeOperation';
import { generateId } from '../../utils';
import type { AutoArrangeStrategy } from '../../types';

/**
 * AutoArrangeCommand: 블록들을 자동으로 정렬
 */
export class AutoArrangeCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'auto-arrange' as const;
  public readonly description: string;

  constructor(
    private strategy: AutoArrangeStrategy = 'top-left',
    private blockIds?: string[]
  ) {
    this.id = generateId();
    this.description = `Auto arrange blocks using ${strategy} strategy`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new AutoArrangeOperation(this.strategy, this.blockIds, context)];
  }

  canExecute(context: OperationContext): boolean {
    // 대상 블록들이 존재하는지 확인
    if (this.blockIds && this.blockIds.length > 0) {
      return this.blockIds.some(id => context.blockManager.getBlock(id) !== null);
    }
    
    // 모든 블록을 대상으로 하는 경우, 블록이 하나라도 있으면 실행 가능
    const totalBlocks = context.blockManager.getAllBlocks().length;
    return totalBlocks > 0;
  }

  getMetadata(): Record<string, any> {
    return {
      strategy: this.strategy,
      blockIds: this.blockIds,
      type: 'layout',
      action: 'auto-arrange',
    };
  }
}