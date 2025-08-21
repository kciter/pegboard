import { generateId } from '../utils';
import type { IOperation, OperationResult, OperationContext } from './types';

/**
 * Base implementation for operations
 * Provides common functionality like ID generation, timestamps, etc.
 */
export abstract class BaseOperation implements IOperation {
  public readonly id: string;
  public readonly timestamp: number;

  constructor(
    public readonly type: string,
    protected context: OperationContext
  ) {
    this.id = generateId();
    this.timestamp = Date.now();
  }

  abstract execute(): Promise<OperationResult> | OperationResult;
  
  abstract canExecute(): boolean;
  
  abstract getDescription(): string;

  // Optional undo support
  undo?(): Promise<OperationResult> | OperationResult;

  /**
   * Helper method to create success result
   */
  protected createSuccessResult(data?: any, metadata?: Record<string, any>): OperationResult {
    return {
      success: true,
      data,
      metadata,
    };
  }

  /**
   * Helper method to create error result
   */
  protected createErrorResult(error: string, data?: any, warnings?: string[]): OperationResult {
    return {
      success: false,
      error,
      data,
      warnings,
    };
  }

  /**
   * Helper method to validate context has required services
   */
  protected validateContext<K extends keyof OperationContext>(
    requiredServices: K[]
  ): boolean {
    return requiredServices.every(service => this.context[service] != null);
  }

  /**
   * Helper method to get service from context with type safety
   */
  protected getService<K extends keyof OperationContext>(
    service: K
  ): NonNullable<OperationContext[K]> {
    const serviceInstance = this.context[service];
    if (!serviceInstance) {
      throw new Error(`Required service '${String(service)}' not available in operation context`);
    }
    return serviceInstance;
  }
}