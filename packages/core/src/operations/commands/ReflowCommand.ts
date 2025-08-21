import type { ICommand, IOperation, OperationContext } from '../types';
import { ReflowOperation } from '../operations/ReflowOperation';
import { generateId } from '../../utils';
import type { DragReflowStrategy, GridPosition } from '../../types';

/**
 * ReflowCommand: 블록 이동에 따른 다른 블록들의 리플로우
 */
export class ReflowCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'reflow' as const;
  public readonly description: string;

  constructor(
    private anchorBlockId: string,
    private newPosition: GridPosition,
    private strategy: DragReflowStrategy = 'axis-shift'
  ) {
    this.id = generateId();
    this.description = `Reflow blocks after moving ${anchorBlockId} using ${strategy} strategy`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new ReflowOperation(this.anchorBlockId, this.newPosition, this.strategy, context)];
  }

  canExecute(context: OperationContext): boolean {
    // 앵커 블록이 존재하고, 리플로우 전략이 'none'이 아니어야 함
    const anchorBlock = context.blockManager.getBlock(this.anchorBlockId);
    return anchorBlock !== null && this.strategy !== 'none';
  }

  getMetadata(): Record<string, any> {
    return {
      anchorBlockId: this.anchorBlockId,
      newPosition: this.newPosition,
      strategy: this.strategy,
      type: 'layout',
      action: 'reflow',
    };
  }
}