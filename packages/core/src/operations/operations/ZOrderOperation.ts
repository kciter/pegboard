import type { IOperation, OperationResult, OperationContext } from '../types';
import { generateId } from '../../utils';

/**
 * Z-Order 변경 Operation
 */
export class SetZIndexOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'set-zindex';
  public readonly timestamp: number;

  private originalZIndex?: number;

  constructor(
    private blockId: string,
    private targetZIndex: number,
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  canExecute(): boolean {
    const block = this.context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  execute(): OperationResult {
    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      // 원본 z-index 저장
      this.originalZIndex = blockData.position.zIndex || 1;

      const result = this.context.blockManager.updateBlock(this.blockId, {
        position: {
          ...blockData.position,
          zIndex: this.targetZIndex,
        },
      });

      if (result.success) {
        return {
          success: true,
          data: { blockId: this.blockId, newZIndex: this.targetZIndex },
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  undo(): OperationResult {
    if (this.originalZIndex === undefined) {
      return {
        success: false,
        error: 'No original z-index to restore',
      };
    }

    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      const result = this.context.blockManager.updateBlock(this.blockId, {
        position: {
          ...blockData.position,
          zIndex: this.originalZIndex,
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getDescription(): string {
    return `Set z-index of block ${this.blockId} to ${this.targetZIndex}`;
  }
}

/**
 * 블록을 맨 앞으로 가져오기 Operation
 */
export class BringToFrontOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'bring-to-front';
  public readonly timestamp: number;

  private originalZIndex?: number;
  private newZIndex?: number;

  constructor(
    private blockId: string,
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  canExecute(): boolean {
    const block = this.context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  execute(): OperationResult {
    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      // 원본 z-index 저장
      this.originalZIndex = blockData.position.zIndex || 1;

      const result = this.context.blockManager.bringToFront(this.blockId);
      if (!result.success) {
        return result;
      }

      this.newZIndex = result.data?.newZIndex;

      return {
        success: true,
        data: { blockId: this.blockId, newZIndex: this.newZIndex },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  undo(): OperationResult {
    if (this.originalZIndex === undefined) {
      return {
        success: false,
        error: 'No original z-index to restore',
      };
    }

    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      const result = this.context.blockManager.updateBlock(this.blockId, {
        position: {
          ...blockData.position,
          zIndex: this.originalZIndex,
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getDescription(): string {
    return `Bring block ${this.blockId} to front`;
  }
}

/**
 * 블록을 맨 뒤로 보내기 Operation
 */
export class SendToBackOperation implements IOperation {
  public readonly id: string;
  public readonly type = 'send-to-back';
  public readonly timestamp: number;

  private originalZIndex?: number;
  private newZIndex?: number;

  constructor(
    private blockId: string,
    private context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  canExecute(): boolean {
    const block = this.context.blockManager.getBlock(this.blockId);
    return block !== null;
  }

  execute(): OperationResult {
    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      // 원본 z-index 저장
      this.originalZIndex = blockData.position.zIndex || 1;

      const result = this.context.blockManager.sendToBack(this.blockId);
      if (!result.success) {
        return result;
      }

      this.newZIndex = result.data?.newZIndex;

      return {
        success: true,
        data: { blockId: this.blockId, newZIndex: this.newZIndex },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  undo(): OperationResult {
    if (this.originalZIndex === undefined) {
      return {
        success: false,
        error: 'No original z-index to restore',
      };
    }

    try {
      const blockData = this.context.blockManager.getBlock(this.blockId);
      if (!blockData) {
        return {
          success: false,
          error: `Block with id ${this.blockId} not found`,
        };
      }

      const result = this.context.blockManager.updateBlock(this.blockId, {
        position: {
          ...blockData.position,
          zIndex: this.originalZIndex,
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getDescription(): string {
    return `Send block ${this.blockId} to back`;
  }
}