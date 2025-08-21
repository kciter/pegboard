import { BaseOperation } from '../BaseOperation';
import type { 
  IBatchOperation, 
  IOperation, 
  OperationResult, 
  BatchStrategy 
} from '../types';

/**
 * Executes multiple operations as a single atomic unit
 */
export class BatchOperation extends BaseOperation implements IBatchOperation {
  public readonly type = 'batch' as const;

  constructor(
    public readonly operations: IOperation[],
    public readonly strategy: BatchStrategy = 'all-or-nothing',
    context: any
  ) {
    super('batch', context);
  }

  canExecute(): boolean {
    if (!this.operations || this.operations.length === 0) {
      return false;
    }

    switch (this.strategy) {
      case 'all-or-nothing':
        // All operations must be executable
        return this.operations.every(op => op.canExecute());

      case 'best-effort':
      case 'fail-fast':
        // At least one operation must be executable
        return this.operations.some(op => op.canExecute());

      default:
        return false;
    }
  }

  async execute(): Promise<OperationResult> {
    if (!this.canExecute()) {
      return this.createErrorResult('Cannot execute batch operation: no executable operations');
    }

    const results: OperationResult[] = [];
    const executedOperations: IOperation[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      for (const operation of this.operations) {
        if (!operation.canExecute()) {
          const error = `Operation ${operation.id} (${operation.type}) cannot be executed`;
          
          if (this.strategy === 'fail-fast') {
            return this.createErrorResult(error, { 
              results, 
              executedOperations: executedOperations.map(op => op.id) 
            });
          }
          
          if (this.strategy === 'all-or-nothing') {
            // This shouldn't happen if canExecute() worked correctly
            await this.rollbackExecutedOperations(executedOperations);
            return this.createErrorResult(error);
          }
          
          // best-effort: log warning and continue
          warnings.push(error);
          continue;
        }

        try {
          const result = await Promise.resolve(operation.execute());
          results.push(result);

          if (result.success) {
            executedOperations.push(operation);
            if (result.warnings) {
              warnings.push(...result.warnings);
            }
          } else {
            errors.push(`Operation ${operation.id} failed: ${result.error}`);
            
            if (this.strategy === 'fail-fast') {
              break;
            }
            
            if (this.strategy === 'all-or-nothing') {
              await this.rollbackExecutedOperations(executedOperations);
              return this.createErrorResult(
                `Batch operation failed, all operations rolled back: ${errors.join('; ')}`,
                { results }
              );
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Operation ${operation.id} threw exception: ${errorMsg}`);
          
          if (this.strategy === 'fail-fast') {
            break;
          }
          
          if (this.strategy === 'all-or-nothing') {
            await this.rollbackExecutedOperations(executedOperations);
            return this.createErrorResult(
              `Batch operation failed, all operations rolled back: ${errors.join('; ')}`,
              { results }
            );
          }
        }
      }

      // Determine overall success
      const hasErrors = errors.length > 0;
      const hasSuccesses = executedOperations.length > 0;

      if (this.strategy === 'all-or-nothing' && hasErrors) {
        await this.rollbackExecutedOperations(executedOperations);
        return this.createErrorResult(
          'Batch operation failed completely',
          { results },
          errors
        );
      }

      return this.createSuccessResult(
        {
          totalOperations: this.operations.length,
          executedOperations: executedOperations.length,
          results,
          executedOperationIds: executedOperations.map(op => op.id)
        },
        {
          operationType: this.type,
          strategy: this.strategy,
          timestamp: this.timestamp,
          errors: hasErrors ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      );

    } catch (error) {
      // Unexpected error in batch execution
      await this.rollbackExecutedOperations(executedOperations);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown batch execution error',
        { results, executedOperations: executedOperations.map(op => op.id) }
      );
    }
  }

  async undo(): Promise<OperationResult> {
    // For undo, we need to reverse the operations that were executed
    // This is complex and may not always be possible
    return this.createErrorResult('Batch operation undo not implemented');
  }

  private async rollbackExecutedOperations(operations: IOperation[]): Promise<void> {
    // Rollback in reverse order
    const rollbackPromises = operations
      .slice()
      .reverse()
      .map(async (operation) => {
        if (operation.undo) {
          try {
            await Promise.resolve(operation.undo());
          } catch (error) {
            // Log rollback failure but don't throw
            console.error(`Failed to rollback operation ${operation.id}:`, error);
          }
        }
      });

    await Promise.allSettled(rollbackPromises);
  }

  getDescription(): string {
    return `Batch operation (${this.strategy}) with ${this.operations.length} operations: ${
      this.operations.map(op => op.type).join(', ')
    }`;
  }
}