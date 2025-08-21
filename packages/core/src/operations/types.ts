/**
 * Operation and Command pattern types for Pegboard
 */

import type { BlockData, GridPosition, GridSize } from '../types';

/**
 * Base operation interface
 */
export interface IOperation {
  /** Unique operation identifier */
  readonly id: string;
  /** Operation type for identification and logging */
  readonly type: string;
  /** Timestamp when operation was created */
  readonly timestamp: number;
  
  /** Execute the operation */
  execute(): Promise<OperationResult> | OperationResult;
  /** Undo the operation (if supported) */
  undo?(): Promise<OperationResult> | OperationResult;
  /** Check if operation can be executed */
  canExecute(): boolean;
  /** Get operation description for logging/debugging */
  getDescription(): string;
}

/**
 * Batch operation that executes multiple operations together
 */
export interface IBatchOperation extends IOperation {
  /** Child operations to execute */
  readonly operations: IOperation[];
  /** Strategy for handling partial failures */
  readonly strategy: BatchStrategy;
}

/**
 * Operation result
 */
export interface OperationResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Operation context for dependency injection
 */
export interface OperationContext {
  blockManager?: any;
  selectionManager?: any;
  stateManager?: any;
  configManager?: any;
  grid?: any;
  transitioner?: any;
}

/**
 * Batch operation strategies
 */
export type BatchStrategy = 
  | 'all-or-nothing'    // Rollback all if any fails
  | 'best-effort'       // Continue on failures
  | 'fail-fast';        // Stop on first failure

/**
 * Command interface (higher level than operations)
 */
export interface ICommand {
  /** Command identifier */
  readonly id: string;
  /** Command name */
  readonly name: string;
  /** Command description */
  readonly description: string;
  
  /** Create operations needed to execute this command */
  createOperations(context: OperationContext): IOperation[];
  /** Check if command can be executed */
  canExecute(context: OperationContext): boolean;
  /** Get command metadata */
  getMetadata(): Record<string, any>;
}

/**
 * Built-in operation types
 */

export interface CreateBlockOperation extends IOperation {
  readonly type: 'create-block';
  readonly blockData: Partial<BlockData>;
}

export interface DeleteBlockOperation extends IOperation {
  readonly type: 'delete-block';
  readonly blockId: string;
}

export interface UpdateBlockOperation extends IOperation {
  readonly type: 'update-block';
  readonly blockId: string;
  readonly updates: Partial<BlockData>;
  readonly oldData?: BlockData; // For undo
}

export interface MoveBlockOperation extends IOperation {
  readonly type: 'move-block';
  readonly blockId: string;
  readonly newPosition: GridPosition;
  readonly oldPosition?: GridPosition; // For undo
}

export interface ResizeBlockOperation extends IOperation {
  readonly type: 'resize-block';
  readonly blockId: string;
  readonly newSize: GridSize;
  readonly oldSize?: GridSize; // For undo
}

export interface SelectionOperation extends IOperation {
  readonly type: 'selection';
  readonly action: 'select' | 'deselect' | 'clear' | 'toggle';
  readonly blockIds: string[];
  readonly previousSelection?: string[]; // For undo
}

/**
 * Built-in command types
 */

export interface AddBlockCommand extends ICommand {
  readonly name: 'add-block';
  readonly blockData: Partial<BlockData>;
}

export interface DeleteSelectedCommand extends ICommand {
  readonly name: 'delete-selected';
}

export interface DuplicateBlockCommand extends ICommand {
  readonly name: 'duplicate-block';
  readonly blockId: string;
}

export interface MoveBlocksCommand extends ICommand {
  readonly name: 'move-blocks';
  readonly blockIds: string[];
  readonly deltaPosition: { x: number; y: number };
}

export interface ArrangeBlocksCommand extends ICommand {
  readonly name: 'arrange-blocks';
  readonly strategy: 'grid' | 'compact' | 'align';
  readonly blockIds?: string[]; // If not specified, applies to all blocks
}

/**
 * Operation factory interface
 */
export interface IOperationFactory {
  createBlockOperation(blockData: Partial<BlockData>): CreateBlockOperation;
  deleteBlockOperation(blockId: string): DeleteBlockOperation;
  updateBlockOperation(blockId: string, updates: Partial<BlockData>, oldData?: BlockData): UpdateBlockOperation;
  moveBlockOperation(blockId: string, newPosition: GridPosition, oldPosition?: GridPosition): MoveBlockOperation;
  resizeBlockOperation(blockId: string, newSize: GridSize, oldSize?: GridSize): ResizeBlockOperation;
  selectionOperation(action: 'select' | 'deselect' | 'clear' | 'toggle', blockIds: string[], previousSelection?: string[]): SelectionOperation;
  batchOperation(operations: IOperation[], strategy?: BatchStrategy): IBatchOperation;
}

/**
 * Command runner interface
 */
export interface ICommandRunner {
  execute(command: ICommand): Promise<OperationResult>;
  executeOperation(operation: IOperation): Promise<OperationResult>;
  executeBatch(operations: IOperation[], strategy?: BatchStrategy): Promise<OperationResult>;
  
  // Undo/Redo support
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): Promise<OperationResult>;
  redo(): Promise<OperationResult>;
  
  // History management
  clearHistory(): void;
  getHistory(): IOperation[];
}

/**
 * Operation validator interface
 */
export interface IOperationValidator {
  validate(operation: IOperation, context: OperationContext): OperationValidationResult;
  validateBatch(operations: IOperation[], context: OperationContext): OperationValidationResult;
}

export interface OperationValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}