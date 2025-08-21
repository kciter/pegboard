import { BaseValidationRule } from '../BaseValidationRule';
import type { ValidationContext, ValidationResult, BusinessValidationRule } from '../types';

/**
 * Validates business logic constraints like maximum block count
 */
export class MaxBlockCountValidationRule extends BaseValidationRule implements BusinessValidationRule {
  public readonly type = 'business' as const;

  constructor() {
    super(
      'Maximum Block Count Validation',
      'Ensures the total number of blocks does not exceed configured limits',
      150
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.existingBlocks && context.config?.maxBlocks && context.operation === 'block-creation');
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'existingBlocks') || !context.config?.maxBlocks) {
      return this.createSuccessResult();
    }

    const { existingBlocks, config } = context;
    const currentCount = existingBlocks!.length;
    const maxBlocks = config.maxBlocks;

    if (maxBlocks && currentCount >= maxBlocks) {
      return this.createFailureResult([
        this.createError(
          'MAX_BLOCKS_EXCEEDED',
          `Cannot create more blocks. Maximum of ${maxBlocks} blocks allowed.`,
          undefined,
          { currentCount, maxBlocks }
        )
      ]);
    }

    // Warning when approaching limit
    if (maxBlocks) {
      const warningThreshold = Math.floor(maxBlocks * 0.9);
      if (currentCount >= warningThreshold) {
        return this.createWarningResult([
          this.createWarning(
            'APPROACHING_MAX_BLOCKS',
            `Approaching maximum block limit. ${currentCount}/${maxBlocks} blocks used.`,
            undefined,
            { currentCount, maxBlocks, remaining: maxBlocks - currentCount }
          )
        ]);
      }
    }

    return this.createSuccessResult();
  }
}

/**
 * Validates block type restrictions and policies
 */
export class BlockTypeValidationRule extends BaseValidationRule implements BusinessValidationRule {
  public readonly type = 'business' as const;

  constructor(
    private allowedTypes?: string[],
    private blockedTypes?: string[],
    private maxPerType?: Record<string, number>
  ) {
    super(
      'Block Type Validation',
      'Validates block types against allowed/blocked lists and type-specific limits',
      200
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!context.block?.type;
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block')) {
      return this.createSuccessResult();
    }

    const { block, existingBlocks } = context;
    const blockType = block!.type;

    if (!blockType) {
      return this.createFailureResult([
        this.createError(
          'BLOCK_TYPE_REQUIRED',
          'Block type is required',
          'type'
        )
      ]);
    }

    const errors = [];
    const warnings = [];

    // Check allowed types
    if (this.allowedTypes && !this.allowedTypes.includes(blockType)) {
      errors.push(this.createError(
        'BLOCK_TYPE_NOT_ALLOWED',
        `Block type '${blockType}' is not allowed`,
        'type',
        { blockType, allowedTypes: this.allowedTypes }
      ));
    }

    // Check blocked types
    if (this.blockedTypes && this.blockedTypes.includes(blockType)) {
      errors.push(this.createError(
        'BLOCK_TYPE_BLOCKED',
        `Block type '${blockType}' is blocked`,
        'type',
        { blockType, blockedTypes: this.blockedTypes }
      ));
    }

    // Check per-type limits
    if (this.maxPerType && existingBlocks) {
      const currentCount = existingBlocks.filter(existing => existing.type === blockType).length;
      const maxForType = this.maxPerType[blockType];
      
      if (maxForType !== undefined && currentCount >= maxForType) {
        errors.push(this.createError(
          'MAX_BLOCKS_PER_TYPE_EXCEEDED',
          `Maximum number of '${blockType}' blocks (${maxForType}) already reached`,
          'type',
          { blockType, currentCount, maxForType }
        ));
      } else if (maxForType !== undefined && currentCount >= Math.floor(maxForType * 0.8)) {
        warnings.push(this.createWarning(
          'APPROACHING_MAX_PER_TYPE',
          `Approaching maximum for block type '${blockType}'. ${currentCount}/${maxForType} used.`,
          'type',
          { blockType, currentCount, maxForType }
        ));
      }
    }

    if (errors.length > 0) {
      return this.createFailureResult(errors, warnings);
    }

    if (warnings.length > 0) {
      return this.createWarningResult(warnings);
    }

    return this.createSuccessResult();
  }
}

/**
 * Validates required block attributes based on type
 */
export class RequiredAttributesValidationRule extends BaseValidationRule implements BusinessValidationRule {
  public readonly type = 'business' as const;

  constructor(
    private requiredAttributesByType: Record<string, string[]> = {}
  ) {
    super(
      'Required Attributes Validation',
      'Ensures blocks have all required attributes based on their type',
      175
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.block?.type && this.requiredAttributesByType[context.block.type]);
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block')) {
      return this.createSuccessResult();
    }

    const { block } = context;
    const blockType = block!.type;

    if (!blockType || !this.requiredAttributesByType[blockType]) {
      return this.createSuccessResult();
    }

    const requiredAttributes = this.requiredAttributesByType[blockType];
    const blockAttributes = block!.attributes || {};
    const errors = [];
    const warnings = [];

    for (const requiredAttr of requiredAttributes) {
      if (!(requiredAttr in blockAttributes)) {
        errors.push(this.createError(
          'REQUIRED_ATTRIBUTE_MISSING',
          `Required attribute '${requiredAttr}' is missing for block type '${blockType}'`,
          `attributes.${requiredAttr}`,
          { blockType, requiredAttribute: requiredAttr }
        ));
      } else if (blockAttributes[requiredAttr] == null || blockAttributes[requiredAttr] === '') {
        warnings.push(this.createWarning(
          'REQUIRED_ATTRIBUTE_EMPTY',
          `Required attribute '${requiredAttr}' is empty for block type '${blockType}'`,
          `attributes.${requiredAttr}`,
          { blockType, requiredAttribute: requiredAttr }
        ));
      }
    }

    if (errors.length > 0) {
      return this.createFailureResult(errors, warnings);
    }

    if (warnings.length > 0) {
      return this.createWarningResult(warnings);
    }

    return this.createSuccessResult();
  }
}