import { EventEmitter } from '../EventEmitter';
import type { 
  ICommandRunner, 
  ICommand, 
  IOperation, 
  OperationResult, 
  BatchStrategy,
  OperationContext
} from './types';
import { BatchOperation } from './operations';

/**
 * Executes commands and operations with undo/redo support
 */
export class CommandRunner extends EventEmitter implements ICommandRunner {
  private history: IOperation[] = [];
  private historyIndex = -1;
  private maxHistorySize = 100;

  constructor(private context: OperationContext) {
    super();
  }

  async execute(command: ICommand): Promise<OperationResult> {
    if (!command.canExecute(this.context)) {
      return {
        success: false,
        error: `Command '${command.name}' cannot be executed`,
      };
    }

    try {
      // Create operations from command
      const operations = command.createOperations(this.context);
      
      if (operations.length === 0) {
        return {
          success: false,
          error: `Command '${command.name}' produced no operations`,
        };
      }

      // Execute operations
      let result: OperationResult;
      
      if (operations.length === 1) {
        result = await this.executeOperation(operations[0]!);
      } else {
        result = await this.executeBatch(operations, 'all-or-nothing');
      }

      if (result.success) {
        (this as any).emit('command:executed', {
          command,
          operations,
          result,
        });
      } else {
        (this as any).emit('command:failed', {
          command,
          operations,
          result,
        });
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown command execution error',
      };

      (this as any).emit('command:failed', {
        command,
        result: errorResult,
      });

      return errorResult;
    }
  }

  async executeOperation(operation: IOperation): Promise<OperationResult> {
    if (!operation.canExecute()) {
      return {
        success: false,
        error: `Operation '${operation.type}' cannot be executed`,
      };
    }

    try {
      const result = await Promise.resolve(operation.execute());
      
      if (result.success) {
        // Add to history for undo/redo
        this.addToHistory(operation);
        
        (this as any).emit('operation:executed', {
          operation,
          result,
        });
      } else {
        (this as any).emit('operation:failed', {
          operation,
          result,
        });
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown operation execution error',
      };

      (this as any).emit('operation:failed', {
        operation,
        result: errorResult,
      });

      return errorResult;
    }
  }

  async executeBatch(
    operations: IOperation[], 
    strategy: BatchStrategy = 'all-or-nothing'
  ): Promise<OperationResult> {
    const batchOperation = new BatchOperation(operations, strategy, this.context);
    return this.executeOperation(batchOperation);
  }

  // Undo/Redo Support

  canUndo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  async undo(): Promise<OperationResult> {
    if (!this.canUndo()) {
      return {
        success: false,
        error: 'Nothing to undo',
      };
    }

    const operation = this.history[this.historyIndex];
    
    if (!operation || !operation.undo) {
      return {
        success: false,
        error: `Operation '${operation?.type || 'unknown'}' does not support undo`,
      };
    }

    try {
      const result = await Promise.resolve(operation.undo());
      
      if (result.success) {
        this.historyIndex--;
        
        (this as any).emit('operation:undone', {
          operation,
          result,
        });
      } else {
        (this as any).emit('operation:undo:failed', {
          operation,
          result,
        });
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown undo error',
      };

      (this as any).emit('operation:undo:failed', {
        operation,
        result: errorResult,
      });

      return errorResult;
    }
  }

  async redo(): Promise<OperationResult> {
    if (!this.canRedo()) {
      return {
        success: false,
        error: 'Nothing to redo',
      };
    }

    const operation = this.history[this.historyIndex + 1];
    
    if (!operation) {
      return {
        success: false,
        error: 'Nothing to redo',
      };
    }
    
    try {
      const result = await Promise.resolve(operation.execute());
      
      if (result.success) {
        this.historyIndex++;
        
        (this as any).emit('operation:redone', {
          operation,
          result,
        });
      } else {
        (this as any).emit('operation:redo:failed', {
          operation,
          result,
        });
      }

      return result;
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown redo error',
      };

      (this as any).emit('operation:redo:failed', {
        operation,
        result: errorResult,
      });

      return errorResult;
    }
  }

  // History Management

  clearHistory(): void {
    const oldHistoryLength = this.history.length;
    this.history = [];
    this.historyIndex = -1;
    
    (this as any).emit('history:cleared', {
      clearedOperations: oldHistoryLength,
    });
  }

  getHistory(): IOperation[] {
    return [...this.history];
  }

  setMaxHistorySize(size: number): void {
    if (size < 0) {
      throw new Error('Max history size cannot be negative');
    }
    
    this.maxHistorySize = size;
    this.trimHistory();
  }

  getMaxHistorySize(): number {
    return this.maxHistorySize;
  }

  // Private methods

  private addToHistory(operation: IOperation): void {
    // Remove any operations after current index (they become invalid after new operation)
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Add new operation
    this.history.push(operation);
    this.historyIndex = this.history.length - 1;

    // Trim history if needed
    this.trimHistory();

    (this as any).emit('history:updated', {
      operation,
      historyLength: this.history.length,
      currentIndex: this.historyIndex,
    });
  }

  private trimHistory(): void {
    if (this.history.length > this.maxHistorySize) {
      const removedCount = this.history.length - this.maxHistorySize;
      this.history = this.history.slice(removedCount);
      this.historyIndex = Math.max(0, this.historyIndex - removedCount);
    }
  }

  // Context management

  updateContext(newContext: Partial<OperationContext>): void {
    this.context = { ...this.context, ...newContext };
    
    (this as any).emit('context:updated', {
      context: this.context,
    });
  }

  getContext(): Readonly<OperationContext> {
    return { ...this.context };
  }
}