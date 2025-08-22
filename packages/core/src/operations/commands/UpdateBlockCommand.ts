import type { ICommand, OperationContext } from '../types';
import { UpdateBlockOperation } from '../operations/UpdateBlockOperation';
import type { BlockData } from '../../types';
import { generateId } from '../../utils';

/**
 * UpdateBlockCommand: 블록 데이터 업데이트 커맨드
 */
export class UpdateBlockCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'update-block' as const;
  public readonly description: string;

  constructor(
    private blockId: string,
    private updates: Partial<BlockData>
  ) {
    this.id = generateId();
    this.description = `Update block ${blockId}`;
  }

  createOperations(context: OperationContext): UpdateBlockOperation[] {
    const operation = new UpdateBlockOperation(this.blockId, this.updates, context);
    return [operation];
  }

  canExecute(context: OperationContext): boolean {
    // 블록이 존재하는지 확인
    const block = context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      updates: this.updates,
      requiresExistingBlock: true,
    };
  }
}