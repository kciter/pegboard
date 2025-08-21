import { BaseValidationRule } from '../BaseValidationRule';
import type { ValidationContext, ValidationResult, PositionValidationRule } from '../types';

/**
 * Validates block positions are within grid bounds
 */
export class GridBoundsValidationRule extends BaseValidationRule implements PositionValidationRule {
  public readonly type = 'position' as const;

  constructor() {
    super(
      'Grid Bounds Validation',
      'Ensures blocks are positioned within grid boundaries',
      200
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.block?.position && context.grid);
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block', 'grid')) {
      return this.createSuccessResult(); // Skip if no relevant data
    }

    const { block, grid } = context;
    const position = block!.position;
    const size = block!.size;

    if (!position || !size || !grid) {
      return this.createSuccessResult();
    }

    const errors = [];
    const warnings = [];

    // Check X bounds
    if (position.x < 0) {
      errors.push(this.createError(
        'POSITION_X_NEGATIVE',
        'Block X position cannot be negative',
        'position.x',
        { position: position.x }
      ));
    }

    if (position.x + size.width > grid.columns) {
      errors.push(this.createError(
        'POSITION_X_OUT_OF_BOUNDS',
        'Block extends beyond grid right boundary',
        'position.x',
        { 
          position: position.x, 
          width: size.width, 
          maxColumns: grid.columns 
        }
      ));
    }

    // Check Y bounds
    if (position.y < 0) {
      errors.push(this.createError(
        'POSITION_Y_NEGATIVE',
        'Block Y position cannot be negative',
        'position.y',
        { position: position.y }
      ));
    }

    if (grid.rows && position.y + size.height > grid.rows) {
      errors.push(this.createError(
        'POSITION_Y_OUT_OF_BOUNDS',
        'Block extends beyond grid bottom boundary',
        'position.y',
        { 
          position: position.y, 
          height: size.height, 
          maxRows: grid.rows 
        }
      ));
    } else if (!grid.rows && position.y > 100) {
      warnings.push(this.createWarning(
        'POSITION_Y_VERY_HIGH',
        'Block position is very high, consider if this is intentional',
        'position.y',
        { position: position.y }
      ));
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
 * Validates optimal positioning for blocks
 */
export class OptimalPositionValidationRule extends BaseValidationRule implements PositionValidationRule {
  public readonly type = 'position' as const;

  constructor() {
    super(
      'Optimal Position Validation',
      'Suggests optimal positioning based on existing blocks',
      50 // Lower priority - only for suggestions
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.block?.position && context.existingBlocks);
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block', 'existingBlocks')) {
      return this.createSuccessResult();
    }

    const { block, existingBlocks } = context;
    const position = block!.position;
    const suggestions = [];

    if (!position || !existingBlocks) {
      return this.createSuccessResult();
    }

    // Suggest better positioning if block is isolated
    const nearbyBlocks = existingBlocks.filter(existing => {
      if (!existing.position) return false;
      const distance = Math.abs(existing.position.x - position.x) + 
                      Math.abs(existing.position.y - position.y);
      return distance <= 3; // Within 3 grid units
    });

    if (existingBlocks.length > 0 && nearbyBlocks.length === 0) {
      suggestions.push(this.createSuggestion(
        'ISOLATED_POSITION',
        'Block is isolated from other blocks. Consider placing it near existing content.',
        undefined,
        { nearbyBlocks: nearbyBlocks.length }
      ));
    }

    // Suggest alignment with existing blocks
    const alignedBlocks = existingBlocks.filter(existing => 
      existing.position && 
      (existing.position.x === position.x || existing.position.y === position.y)
    );

    if (existingBlocks.length > 1 && alignedBlocks.length === 0) {
      suggestions.push(this.createSuggestion(
        'MISALIGNED_POSITION',
        'Block is not aligned with any existing blocks. Consider aligning for better visual organization.',
        undefined,
        { alignedBlocks: alignedBlocks.length }
      ));
    }

    return this.createSuccessResult(suggestions);
  }
}