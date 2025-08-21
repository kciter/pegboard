import type { 
  IValidator, 
  IRuleEngine,
  ValidationContext, 
  ValidationResult, 
  ValidationScenario, 
  ValidationStrategy 
} from './types';
import type { BlockData, GridPosition, GridSize } from '../types';
import { RuleEngine } from './RuleEngine';

// Import built-in rule groups
import {
  GridBoundsValidationRule,
  OptimalPositionValidationRule,
  BlockCollisionValidationRule,
  BlockSpacingValidationRule,
  BlockSizeValidationRule,
  AspectRatioValidationRule,
  MaxBlockCountValidationRule,
  BlockTypeValidationRule,
  RequiredAttributesValidationRule,
} from './rules';

/**
 * High-level validator that orchestrates rule engine for common scenarios
 */
export class Validator implements IValidator {
  private strategy: ValidationStrategy = 'strict';

  constructor(
    private ruleEngine: IRuleEngine = new RuleEngine(),
    private contextProvider: () => Partial<ValidationContext> = () => ({})
  ) {
    this.initializeBuiltInRules();
  }

  validateBlock(block: Partial<BlockData>, scenario: ValidationScenario): ValidationResult {
    const context = this.createValidationContext({ block: block as BlockData }, scenario);
    return this.executeValidationWithStrategy(context);
  }

  validatePosition(
    position: GridPosition, 
    size: GridSize, 
    excludeBlockId?: string
  ): ValidationResult {
    const block = { position: {...position, zIndex: position.zIndex || 1}, size, id: excludeBlockId || 'temp', type: 'temp', attributes: {} };
    const context = this.createValidationContext({ block }, 'block-movement');
    return this.executeValidationWithStrategy(context);
  }

  validateSize(size: GridSize, constraints?: any): ValidationResult {
    const block = { id: 'temp', type: 'temp', position: { x: 0, y: 0, zIndex: 1 }, size, attributes: {}, constraints };
    const context = this.createValidationContext({ block }, 'block-resize');
    return this.executeValidationWithStrategy(context);
  }

  validateGridConfig(config: any): ValidationResult {
    const context = this.createValidationContext({ grid: config }, 'grid-configuration');
    return this.executeValidationWithStrategy(context);
  }

  validateBatchOperation(blocks: BlockData[], operation: string): ValidationResult {
    const context = this.createValidationContext({ 
      existingBlocks: blocks,
      operation 
    }, 'batch-operation');
    return this.executeValidationWithStrategy(context);
  }

  setStrategy(strategy: ValidationStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): ValidationStrategy {
    return this.strategy;
  }

  // Public utility methods

  /**
   * Get the underlying rule engine for advanced usage
   */
  getRuleEngine(): IRuleEngine {
    return this.ruleEngine;
  }

  /**
   * Validate with specific rules only
   */
  validateWithSpecificRules(
    context: Partial<ValidationContext>, 
    ruleIds: string[]
  ): ValidationResult {
    const fullContext = this.createValidationContext(context, 'user-action' as ValidationScenario);
    return this.ruleEngine.validateWithRules(fullContext, ruleIds);
  }

  /**
   * Get validation rules that apply to a scenario
   */
  getRulesForScenario(scenario: ValidationScenario): string[] {
    const context = this.createValidationContext({}, scenario);
    return this.ruleEngine.getRules().map((rule: any) => rule.id);
  }

  // Private methods

  private createValidationContext(
    partialContext: Partial<ValidationContext>,
    scenario: ValidationScenario
  ): ValidationContext {
    const baseContext = this.contextProvider();
    return {
      ...baseContext,
      ...partialContext,
      operation: partialContext.operation || this.getOperationFromScenario(scenario),
    };
  }

  private getOperationFromScenario(scenario: ValidationScenario): string {
    switch (scenario) {
      case 'block-creation': return 'create-block';
      case 'block-update': return 'update-block';
      case 'block-movement': return 'move-block';
      case 'block-resize': return 'resize-block';
      case 'block-deletion': return 'delete-block';
      case 'batch-operation': return 'batch-operation';
      case 'grid-configuration': return 'configure-grid';
      case 'import-data': return 'import-data';
      default: return 'unknown';
    }
  }

  private executeValidationWithStrategy(context: ValidationContext): ValidationResult {
    const result = this.ruleEngine.validate(context);

    switch (this.strategy) {
      case 'strict':
        // All errors and warnings are blocking
        return {
          ...result,
          valid: result.valid && (!result.warnings || result.warnings.length === 0),
        };

      case 'lenient':
        // Only errors are blocking, warnings are allowed
        return result;

      case 'advisory':
        // Nothing is blocking, all issues become suggestions
        return {
          valid: true,
          suggestions: [
            ...(result.suggestions || []),
            ...(result.warnings || []).map(warning => ({
              code: warning.code,
              message: `Advisory: ${warning.message}`,
              context: warning.context,
            })),
            ...(result.errors || []).map(error => ({
              code: error.code,
              message: `Advisory: ${error.message}`,
              context: error.context,
            })),
          ],
        };

      case 'custom':
        // Return as-is for custom handling
        return result;

      default:
        return result;
    }
  }

  private initializeBuiltInRules(): void {
    // Position validation rules
    this.ruleEngine.registerRule(new GridBoundsValidationRule());
    this.ruleEngine.registerRule(new OptimalPositionValidationRule());

    // Collision validation rules
    this.ruleEngine.registerRule(new BlockCollisionValidationRule());
    this.ruleEngine.registerRule(new BlockSpacingValidationRule());

    // Size validation rules
    this.ruleEngine.registerRule(new BlockSizeValidationRule());
    this.ruleEngine.registerRule(new AspectRatioValidationRule());

    // Business validation rules
    this.ruleEngine.registerRule(new MaxBlockCountValidationRule());
    this.ruleEngine.registerRule(new BlockTypeValidationRule());
    this.ruleEngine.registerRule(new RequiredAttributesValidationRule());

    // Create rule groups for organization
    this.ruleEngine.registerRuleGroup({
      id: 'position-rules',
      name: 'Position Validation',
      description: 'Rules for validating block positioning',
      enabled: true,
      rules: [
        new GridBoundsValidationRule(),
        new OptimalPositionValidationRule(),
      ],
    });

    this.ruleEngine.registerRuleGroup({
      id: 'collision-rules',
      name: 'Collision Validation',
      description: 'Rules for validating block collisions and spacing',
      enabled: true,
      rules: [
        new BlockCollisionValidationRule(),
        new BlockSpacingValidationRule(),
      ],
    });

    this.ruleEngine.registerRuleGroup({
      id: 'size-rules',
      name: 'Size Validation',
      description: 'Rules for validating block sizes and dimensions',
      enabled: true,
      rules: [
        new BlockSizeValidationRule(),
        new AspectRatioValidationRule(),
      ],
    });

    this.ruleEngine.registerRuleGroup({
      id: 'business-rules',
      name: 'Business Logic Validation',
      description: 'Rules for business logic constraints',
      enabled: true,
      rules: [
        new MaxBlockCountValidationRule(),
        new BlockTypeValidationRule(),
        new RequiredAttributesValidationRule(),
      ],
    });
  }

  /**
   * Configure business rules with specific settings
   */
  configureBusinessRules(options: {
    maxBlocks?: number;
    allowedTypes?: string[];
    blockedTypes?: string[];
    maxPerType?: Record<string, number>;
    requiredAttributesByType?: Record<string, string[]>;
  }): void {
    // Update or replace business rules with configured options
    this.ruleEngine.unregisterRule('business-max-blocks');
    this.ruleEngine.unregisterRule('business-block-types');
    this.ruleEngine.unregisterRule('business-required-attributes');

    if (options.maxBlocks) {
      this.ruleEngine.registerRule(new MaxBlockCountValidationRule());
    }

    if (options.allowedTypes || options.blockedTypes || options.maxPerType) {
      this.ruleEngine.registerRule(new BlockTypeValidationRule(
        options.allowedTypes,
        options.blockedTypes,
        options.maxPerType
      ));
    }

    if (options.requiredAttributesByType) {
      this.ruleEngine.registerRule(new RequiredAttributesValidationRule(
        options.requiredAttributesByType
      ));
    }
  }

  /**
   * Update context provider for dynamic context
   */
  setContextProvider(provider: () => Partial<ValidationContext>): void {
    this.contextProvider = provider;
  }
}