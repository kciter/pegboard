import type { ICommand, IOperation, OperationContext } from '../types';
import { generateId } from '../../utils';
import { BringToFrontOperation, SendToBackOperation, SetZIndexOperation } from '../operations/ZOrderOperation';

/**
 * 블록을 맨 앞으로 가져오기 Command
 */
export class BringToFrontCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'bring-to-front' as const;
  public readonly description: string;

  constructor(private blockId: string) {
    this.id = generateId();
    this.description = `Bring block ${blockId} to front`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new BringToFrontOperation(this.blockId, context)];
  }

  canExecute(context: OperationContext): boolean {
    const block = context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      type: 'z-order',
      action: 'bring-to-front',
    };
  }
}

/**
 * 블록을 맨 뒤로 보내기 Command
 */
export class SendToBackCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'send-to-back' as const;
  public readonly description: string;

  constructor(private blockId: string) {
    this.id = generateId();
    this.description = `Send block ${blockId} to back`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new SendToBackOperation(this.blockId, context)];
  }

  canExecute(context: OperationContext): boolean {
    const block = context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      type: 'z-order',
      action: 'send-to-back',
    };
  }
}

/**
 * 특정 z-index로 설정 Command
 */
export class SetZIndexCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'set-zindex' as const;
  public readonly description: string;

  constructor(private blockId: string, private targetZIndex: number) {
    this.id = generateId();
    this.description = `Set block ${blockId} z-index to ${targetZIndex}`;
  }

  createOperations(context: OperationContext): IOperation[] {
    return [new SetZIndexOperation(this.blockId, this.targetZIndex, context)];
  }

  canExecute(context: OperationContext): boolean {
    const block = context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  getMetadata(): Record<string, any> {
    return {
      blockId: this.blockId,
      targetZIndex: this.targetZIndex,
      type: 'z-order',
      action: 'set-zindex',
    };
  }
}

/**
 * 선택된 블록들의 z-order 재정렬 Command
 */
export class ArrangeZOrderCommand implements ICommand {
  public readonly id: string;
  public readonly name = 'arrange-zorder' as const;
  public readonly description: string;

  constructor(private arrangement: 'front' | 'back' | 'forward' | 'backward') {
    this.id = generateId();
    this.description = `Arrange selected blocks ${arrangement}`;
  }

  createOperations(context: OperationContext): IOperation[] {
    const selectedIds = context.selectionManager.getSelectedIds();
    const operations: IOperation[] = [];

    if (selectedIds.length === 0) {
      return operations;
    }

    // 현재 최대 z-index 계산
    const allBlocks = context.blockManager.getAllBlocks();
    const maxZIndex = Math.max(...allBlocks.map((b: any) => b.position.zIndex || 1));

    for (const blockId of selectedIds) {
      const blockData = context.blockManager.getBlock(blockId);
      if (!blockData) continue;

      const originalZIndex = blockData.position.zIndex || 1;
      let newZIndex = originalZIndex;

      switch (this.arrangement) {
        case 'front':
          newZIndex = maxZIndex + 1;
          break;
        case 'back':
          newZIndex = 1;
          break;
        case 'forward':
          newZIndex = Math.min(maxZIndex, originalZIndex + 1);
          break;
        case 'backward':
          newZIndex = Math.max(1, originalZIndex - 1);
          break;
      }

      if (newZIndex !== originalZIndex) {
        operations.push(new SetZIndexOperation(blockId, newZIndex, context));
      }
    }

    return operations;
  }

  canExecute(context: OperationContext): boolean {
    const selectedIds = context.selectionManager.getSelectedIds();
    return selectedIds.length > 0;
  }

  getMetadata(): Record<string, any> {
    return {
      arrangement: this.arrangement,
      type: 'z-order',
      action: 'arrange',
    };
  }
}