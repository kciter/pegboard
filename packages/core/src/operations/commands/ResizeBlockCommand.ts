import type { ICommand, OperationContext } from '../types';
import { ResizeBlockOperation } from '../operations/ResizeBlockOperation';
import type { GridSize } from '../../types';
import { generateId } from '../../utils';

/**
 * ResizeBlockCommand: 단일 블록 리사이즈 커맨드
 */
export class ResizeBlockCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'resize-block' as const;
  public readonly description: string;

  constructor(
    private blockId: string,
    private newSize: GridSize,
    private fromSize?: GridSize
  ) {
    this.id = generateId();
    this.description = `Resize block ${blockId} to ${newSize.width}x${newSize.height}`;
  }

  createOperations(context: OperationContext): ResizeBlockOperation[] {
    // fromSize가 없으면 현재 크기를 사용
    let from = this.fromSize;
    if (!from) {
      const block = context.blockManager.getBlock(this.blockId);
      if (block) {
        from = block.size;
      }
    }

    const operation = new ResizeBlockOperation(
      this.blockId, 
      this.newSize, 
      context,
      from || this.newSize
    );
    return [operation];
  }

  canExecute(context: OperationContext): boolean {
    // 블록이 존재하는지 확인
    const block = context.blockManager.getBlock(this.blockId);
    if (!block) {
      return false;
    }

    // 리사이즈 가능한 블록인지 확인
    return block.resizable !== false;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      newSize: this.newSize,
      fromSize: this.fromSize,
      requiresResizableBlock: true,
    };
  }
}