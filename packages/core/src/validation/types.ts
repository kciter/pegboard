/**
 * Validation and Rule Engine types for Pegboard
 */

import type { BlockData, GridPosition, GridSize } from '../types';

/**
 * Validation result interface
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors (blocking issues) */
  errors?: ValidationError[];
  /** Validation warnings (non-blocking issues) */
  warnings?: ValidationWarning[];
  /** Suggested corrections or improvements */
  suggestions?: ValidationSuggestion[];
  /** Additional metadata about validation */
  metadata?: Record<string, any>;
}

/**
 * Validation error (blocks execution)
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Field or property that caused the error */
  field?: string;
  /** Additional context about the error */
  context?: Record<string, any>;
}

/**
 * Validation warning (allows execution but indicates potential issues)
 */
export interface ValidationWarning {
  /** Warning code for programmatic handling */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Field or property that caused the warning */
  field?: string;
  /** Additional context about the warning */
  context?: Record<string, any>;
}

/**
 * Validation suggestion (helpful recommendations)
 */
export interface ValidationSuggestion {
  /** Suggestion code for programmatic handling */
  code: string;
  /** Human-readable suggestion message */
  message: string;
  /** Suggested value or action */
  suggestion?: any;
  /** Additional context about the suggestion */
  context?: Record<string, any>;
}

/**
 * Validation context provides data needed for validation
 */
export interface ValidationContext {
  /** Block being validated (if applicable) */
  block?: BlockData;
  /** Grid configuration */
  grid?: {
    columns: number;
    rows?: number;
    gap: number;
    rowHeight: number;
  };
  /** All existing blocks for collision detection */
  existingBlocks?: BlockData[];
  /** Configuration settings */
  config?: {
    allowOverlap: boolean;
    maxBlocks?: number;
    minBlockSize?: GridSize;
    maxBlockSize?: GridSize;
  };
  /** Current user action or operation type */
  operation?: string;
  /** Additional custom context */
  custom?: Record<string, any>;
}

/**
 * Base rule interface
 */
export interface IValidationRule {
  /** Unique rule identifier */
  readonly id: string;
  /** Human-readable rule name */
  readonly name: string;
  /** Rule description */
  readonly description: string;
  /** Rule priority (higher number = higher priority) */
  readonly priority: number;
  /** Whether this rule is enabled */
  readonly enabled: boolean;
  
  /** Check if this rule applies to the given context */
  appliesTo(context: ValidationContext): boolean;
  /** Execute the validation rule */
  validate(context: ValidationContext): ValidationResult;
}

/**
 * Rule group interface for organizing related rules
 */
export interface IRuleGroup {
  /** Group identifier */
  readonly id: string;
  /** Group name */
  readonly name: string;
  /** Group description */
  readonly description: string;
  /** Rules in this group */
  readonly rules: IValidationRule[];
  /** Whether this group is enabled */
  readonly enabled: boolean;
}

/**
 * Rule engine interface
 */
export interface IRuleEngine {
  /** Register a validation rule */
  registerRule(rule: IValidationRule): void;
  /** Unregister a validation rule */
  unregisterRule(ruleId: string): void;
  /** Register a rule group */
  registerRuleGroup(group: IRuleGroup): void;
  /** Get all registered rules */
  getRules(): IValidationRule[];
  /** Get rules by group */
  getRulesByGroup(groupId: string): IValidationRule[];
  /** Enable/disable a rule */
  setRuleEnabled(ruleId: string, enabled: boolean): void;
  /** Enable/disable a rule group */
  setRuleGroupEnabled(groupId: string, enabled: boolean): void;
  /** Validate using all applicable rules */
  validate(context: ValidationContext): ValidationResult;
  /** Validate using specific rules */
  validateWithRules(context: ValidationContext, ruleIds: string[]): ValidationResult;
}

/**
 * Built-in validation rule types
 */

export interface PositionValidationRule extends IValidationRule {
  readonly type: 'position';
}

export interface SizeValidationRule extends IValidationRule {
  readonly type: 'size';
}

export interface CollisionValidationRule extends IValidationRule {
  readonly type: 'collision';
}

export interface ConstraintValidationRule extends IValidationRule {
  readonly type: 'constraint';
}

export interface BusinessValidationRule extends IValidationRule {
  readonly type: 'business';
}

/**
 * Pre-defined validation scenarios
 */
export type ValidationScenario = 
  | 'block-creation'
  | 'block-update'
  | 'block-movement'
  | 'block-resize'
  | 'block-deletion'
  | 'batch-operation'
  | 'grid-configuration'
  | 'import-data';

/**
 * Validation strategy determines how rules are applied
 */
export type ValidationStrategy = 
  | 'strict'        // All rules must pass
  | 'lenient'       // Warnings allowed, only errors block
  | 'advisory'      // All issues reported as suggestions
  | 'custom';       // Custom handling of results

/**
 * Validator interface for high-level validation operations
 */
export interface IValidator {
  /** Validate block data */
  validateBlock(block: Partial<BlockData>, scenario: ValidationScenario): ValidationResult;
  /** Validate block position */
  validatePosition(position: GridPosition, size: GridSize, excludeBlockId?: string): ValidationResult;
  /** Validate block size */
  validateSize(size: GridSize, constraints?: any): ValidationResult;
  /** Validate grid configuration */
  validateGridConfig(config: any): ValidationResult;
  /** Validate batch operation */
  validateBatchOperation(blocks: BlockData[], operation: string): ValidationResult;
  /** Set validation strategy */
  setStrategy(strategy: ValidationStrategy): void;
  /** Get current validation strategy */
  getStrategy(): ValidationStrategy;
}

/**
 * Validation rule builder interface for fluent API
 */
export interface IRuleBuilder {
  /** Set rule name */
  name(name: string): IRuleBuilder;
  /** Set rule description */
  description(description: string): IRuleBuilder;
  /** Set rule priority */
  priority(priority: number): IRuleBuilder;
  /** Set rule enabled state */
  enabled(enabled: boolean): IRuleBuilder;
  /** Add condition for when rule applies */
  when(condition: (context: ValidationContext) => boolean): IRuleBuilder;
  /** Add validation logic */
  check(validator: (context: ValidationContext) => ValidationResult): IRuleBuilder;
  /** Build the rule */
  build(): IValidationRule;
}