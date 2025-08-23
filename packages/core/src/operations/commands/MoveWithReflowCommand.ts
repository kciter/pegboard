import type { ICommand, IOperation, OperationContext } from '../types';
import { MoveWithReflowOperation } from '../operations/MoveWithReflowOperation';
import { generateId } from '../../utils';
import type { GridPosition } from '../../types';

/**
 * MoveWithReflowCommand: 블록 이동과 리플로우를 통합한 커맨드
 * 이동과 리플로우를 하나의 트랜잭션으로 처리
 */
export class MoveWithReflowCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'move-with-reflow' as const;
  public readonly description: string;

  constructor(
    private blockId: string,
    private toPosition: GridPosition,
    private reflowStrategy: 'push-away' | 'smart-fill' | 'none' = 'push-away'
  ) {
    this.id = generateId();
    this.description = `Move block ${blockId} to (${toPosition.x}, ${toPosition.y}) with ${reflowStrategy} reflow`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new MoveWithReflowOperation(
      this.blockId,
      this.toPosition,
      this.reflowStrategy,
      context
    )];
  }

  canExecute(context: OperationContext): boolean {
    const block = context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      toPosition: this.toPosition,
      reflowStrategy: this.reflowStrategy,
      type: 'move-and-layout',
      action: 'move-with-reflow',
    };
  }
}