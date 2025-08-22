import type { ICommand, OperationContext } from '../types';
import { MoveBlockOperation } from '../operations/MoveBlockOperation';
import type { GridPosition } from '../../types';
import { generateId } from '../../utils';

/**
 * MoveBlockCommand: 단일 블록 이동 커맨드
 */
export class MoveBlockCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'move-block' as const;
  public readonly description: string;

  constructor(
    private blockId: string,
    private newPosition: GridPosition,
    private fromPosition?: GridPosition
  ) {
    this.id = generateId();
    this.description = `Move block ${blockId} to (${newPosition.x}, ${newPosition.y})`;
  }

  createOperations(context: OperationContext): MoveBlockOperation[] {
    // fromPosition이 없으면 현재 위치를 사용
    let from = this.fromPosition;
    if (!from) {
      const block = context.blockManager.getBlock(this.blockId);
      if (block) {
        from = block.position;
      }
    }

    const operation = new MoveBlockOperation(
      this.blockId, 
      this.newPosition, 
      context,
      from || this.newPosition
    );
    return [operation];
  }

  canExecute(context: OperationContext): boolean {
    // 블록이 존재하는지 확인
    const block = context.blockManager.getBlock(this.blockId);
    if (!block) {
      return false;
    }

    // 이동 가능한 블록인지 확인
    return block.movable !== false;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      newPosition: this.newPosition,
      fromPosition: this.fromPosition,
      requiresMovableBlock: true,
    };
  }
}