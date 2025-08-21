import { BaseValidationRule } from '../BaseValidationRule';
import type { ValidationContext, ValidationResult, SizeValidationRule } from '../types';

/**
 * Validates block sizes are within acceptable bounds
 */
export class BlockSizeValidationRule extends BaseValidationRule implements SizeValidationRule {
  public readonly type = 'size' as const;

  constructor() {
    super(
      'Block Size Validation',
      'Ensures block sizes are within minimum and maximum constraints',
      250
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!context.block?.size;
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block')) {
      return this.createSuccessResult();
    }

    const { block, config, grid } = context;
    const size = block!.size;

    if (!size) {
      return this.createFailureResult([
        this.createError('SIZE_MISSING', 'Block size is required', 'size')
      ]);
    }

    const errors = [];
    const warnings = [];

    // Validate minimum size
    if (size.width < 1) {
      errors.push(this.createError(
        'SIZE_WIDTH_TOO_SMALL',
        'Block width must be at least 1 grid unit',
        'size.width',
        { width: size.width, minimum: 1 }
      ));
    }

    if (size.height < 1) {
      errors.push(this.createError(
        'SIZE_HEIGHT_TOO_SMALL',
        'Block height must be at least 1 grid unit',
        'size.height',
        { height: size.height, minimum: 1 }
      ));
    }

    // Validate against configuration constraints
    if (config?.minBlockSize) {
      if (size.width < config.minBlockSize.width) {
        errors.push(this.createError(
          'SIZE_WIDTH_BELOW_CONFIG_MIN',
          `Block width must be at least ${config.minBlockSize.width} grid units`,
          'size.width',
          { width: size.width, minimum: config.minBlockSize.width }
        ));
      }

      if (size.height < config.minBlockSize.height) {
        errors.push(this.createError(
          'SIZE_HEIGHT_BELOW_CONFIG_MIN',
          `Block height must be at least ${config.minBlockSize.height} grid units`,
          'size.height',
          { height: size.height, minimum: config.minBlockSize.height }
        ));
      }
    }

    if (config?.maxBlockSize) {
      if (size.width > config.maxBlockSize.width) {
        errors.push(this.createError(
          'SIZE_WIDTH_ABOVE_CONFIG_MAX',
          `Block width cannot exceed ${config.maxBlockSize.width} grid units`,
          'size.width',
          { width: size.width, maximum: config.maxBlockSize.width }
        ));
      }

      if (size.height > config.maxBlockSize.height) {
        errors.push(this.createError(
          'SIZE_HEIGHT_ABOVE_CONFIG_MAX',
          `Block height cannot exceed ${config.maxBlockSize.height} grid units`,
          'size.height',
          { height: size.height, maximum: config.maxBlockSize.height }
        ));
      }
    }

    // Validate against grid constraints
    if (grid) {
      if (size.width > grid.columns) {
        errors.push(this.createError(
          'SIZE_WIDTH_EXCEEDS_GRID',
          `Block width cannot exceed grid width of ${grid.columns} columns`,
          'size.width',
          { width: size.width, maxColumns: grid.columns }
        ));
      }

      if (grid.rows && size.height > grid.rows) {
        errors.push(this.createError(
          'SIZE_HEIGHT_EXCEEDS_GRID',
          `Block height cannot exceed grid height of ${grid.rows} rows`,
          'size.height',
          { height: size.height, maxRows: grid.rows }
        ));
      }
    }

    // Warnings for potentially problematic sizes
    if (size.width === 1 && size.height === 1) {
      warnings.push(this.createWarning(
        'SIZE_VERY_SMALL',
        'Block is very small (1x1). Consider if this is intentional.',
        'size',
        { width: size.width, height: size.height }
      ));
    }

    if (grid && (size.width > grid.columns * 0.8 || size.height > (grid.rows || 20) * 0.8)) {
      warnings.push(this.createWarning(
        'SIZE_VERY_LARGE',
        'Block takes up most of the available grid space. Consider if this is intentional.',
        'size',
        { width: size.width, height: size.height, gridUtilization: Math.max(size.width / grid.columns, size.height / (grid.rows || 20)) }
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
 * Validates block aspect ratio for optimal display
 */
export class AspectRatioValidationRule extends BaseValidationRule implements SizeValidationRule {
  public readonly type = 'size' as const;

  constructor(
    private minAspectRatio: number = 0.1,
    private maxAspectRatio: number = 10
  ) {
    super(
      'Aspect Ratio Validation',
      'Suggests optimal aspect ratios for better visual appearance',
      75
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!context.block?.size;
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block')) {
      return this.createSuccessResult();
    }

    const { block } = context;
    const size = block!.size;

    if (!size) {
      return this.createSuccessResult();
    }

    const aspectRatio = size.width / size.height;
    const suggestions = [];

    if (aspectRatio < this.minAspectRatio) {
      suggestions.push(this.createSuggestion(
        'ASPECT_RATIO_TOO_NARROW',
        'Block is very tall and narrow. Consider adjusting dimensions for better visual balance.',
        undefined,
        { 
          aspectRatio, 
          width: size.width, 
          height: size.height,
          suggestedWidth: Math.ceil(size.height * this.minAspectRatio)
        }
      ));
    } else if (aspectRatio > this.maxAspectRatio) {
      suggestions.push(this.createSuggestion(
        'ASPECT_RATIO_TOO_WIDE',
        'Block is very wide and short. Consider adjusting dimensions for better visual balance.',
        undefined,
        { 
          aspectRatio, 
          width: size.width, 
          height: size.height,
          suggestedHeight: Math.ceil(size.width / this.maxAspectRatio)
        }
      ));
    }

    // Suggest standard aspect ratios for common use cases
    const standardRatios = [
      { ratio: 1, name: 'Square (1:1)' },
      { ratio: 16/9, name: 'Widescreen (16:9)' },
      { ratio: 4/3, name: 'Traditional (4:3)' },
      { ratio: 3/2, name: 'Photo (3:2)' },
    ];

    const closestRatio = standardRatios.reduce((closest, current) => {
      const currentDiff = Math.abs(current.ratio - aspectRatio);
      const closestDiff = Math.abs(closest.ratio - aspectRatio);
      return currentDiff < closestDiff ? current : closest;
    });

    const ratioDifference = Math.abs(closestRatio.ratio - aspectRatio);
    if (ratioDifference > 0.3) {
      suggestions.push(this.createSuggestion(
        'NON_STANDARD_ASPECT_RATIO',
        `Consider using a standard aspect ratio like ${closestRatio.name} for better visual consistency.`,
        closestRatio,
        { currentRatio: aspectRatio, suggestedRatio: closestRatio.ratio }
      ));
    }

    return this.createSuccessResult(suggestions);
  }
}