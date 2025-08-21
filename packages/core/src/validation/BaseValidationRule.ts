import { generateId } from '../utils';
import type { IValidationRule, ValidationContext, ValidationResult, ValidationError, ValidationWarning, ValidationSuggestion } from './types';

/**
 * Base implementation for validation rules
 */
export abstract class BaseValidationRule implements IValidationRule {
  public readonly id: string;

  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly priority: number = 100,
    public readonly enabled: boolean = true
  ) {
    this.id = generateId();
  }

  abstract appliesTo(context: ValidationContext): boolean;
  abstract validate(context: ValidationContext): ValidationResult;

  /**
   * Helper method to create a successful validation result
   */
  protected createSuccessResult(suggestions?: ValidationSuggestion[], metadata?: Record<string, any>): ValidationResult {
    return {
      valid: true,
      suggestions,
      metadata,
    };
  }

  /**
   * Helper method to create a failed validation result
   */
  protected createFailureResult(
    errors: ValidationError[],
    warnings?: ValidationWarning[],
    suggestions?: ValidationSuggestion[],
    metadata?: Record<string, any>
  ): ValidationResult {
    return {
      valid: false,
      errors,
      warnings,
      suggestions,
      metadata,
    };
  }

  /**
   * Helper method to create a warning-only result (still valid but with warnings)
   */
  protected createWarningResult(
    warnings: ValidationWarning[],
    suggestions?: ValidationSuggestion[],
    metadata?: Record<string, any>
  ): ValidationResult {
    return {
      valid: true,
      warnings,
      suggestions,
      metadata,
    };
  }

  /**
   * Helper method to create validation error
   */
  protected createError(
    code: string,
    message: string,
    field?: string,
    context?: Record<string, any>
  ): ValidationError {
    return { code, message, field, context };
  }

  /**
   * Helper method to create validation warning
   */
  protected createWarning(
    code: string,
    message: string,
    field?: string,
    context?: Record<string, any>
  ): ValidationWarning {
    return { code, message, field, context };
  }

  /**
   * Helper method to create validation suggestion
   */
  protected createSuggestion(
    code: string,
    message: string,
    suggestion?: any,
    context?: Record<string, any>
  ): ValidationSuggestion {
    return { code, message, suggestion, context };
  }

  /**
   * Check if the validation context has required data
   */
  protected hasRequiredData(context: ValidationContext, ...requirements: (keyof ValidationContext)[]): boolean {
    return requirements.every(req => context[req] != null);
  }
}