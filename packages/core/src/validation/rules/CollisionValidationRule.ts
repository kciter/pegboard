import { BaseValidationRule } from '../BaseValidationRule';
import type { ValidationContext, ValidationResult, CollisionValidationRule } from '../types';

/**
 * Validates that blocks don't collide with existing blocks
 */
export class BlockCollisionValidationRule extends BaseValidationRule implements CollisionValidationRule {
  public readonly type = 'collision' as const;

  constructor() {
    super(
      'Block Collision Validation',
      'Ensures blocks do not overlap with existing blocks (unless overlap is allowed)',
      300 // High priority
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.block?.position && context.block?.size && context.existingBlocks);
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block', 'existingBlocks')) {
      return this.createSuccessResult();
    }

    const { block, existingBlocks, config } = context;
    const position = block!.position;
    const size = block!.size;

    if (!position || !size || !existingBlocks) {
      return this.createSuccessResult();
    }

    // Skip collision check if overlap is explicitly allowed
    if (config?.allowOverlap) {
      return this.createSuccessResult();
    }

    const errors: any[] = [];
    const warnings: any[] = [];
    const collisions: any[] = [];

    // Calculate block bounds
    const blockBounds = {
      left: position.x,
      top: position.y,
      right: position.x + size.width,
      bottom: position.y + size.height,
    };

    // Check for collisions with existing blocks
    for (const existing of existingBlocks) {
      if (!existing.position || !existing.size) continue;
      if (existing.id === block!.id) continue; // Don't check against self

      const existingBounds = {
        left: existing.position.x,
        top: existing.position.y,
        right: existing.position.x + existing.size.width,
        bottom: existing.position.y + existing.size.height,
      };

      // Check for overlap
      const hasOverlap = !(
        blockBounds.right <= existingBounds.left ||
        blockBounds.left >= existingBounds.right ||
        blockBounds.bottom <= existingBounds.top ||
        blockBounds.top >= existingBounds.bottom
      );

      if (hasOverlap) {
        collisions.push({
          blockId: existing.id,
          blockType: existing.type,
          position: existing.position,
          size: existing.size,
        });
      }
    }

    if (collisions.length > 0) {
      errors.push(this.createError(
        'BLOCK_COLLISION',
        `Block collides with ${collisions.length} existing block(s)`,
        'position',
        {
          collisionCount: collisions.length,
          collidingBlocks: collisions,
        }
      ));
    }

    if (errors.length > 0) {
      return this.createFailureResult(errors, warnings);
    }

    return this.createSuccessResult();
  }
}

/**
 * Validates spacing between blocks for visual clarity
 */
export class BlockSpacingValidationRule extends BaseValidationRule implements CollisionValidationRule {
  public readonly type = 'collision' as const;

  constructor(private minSpacing: number = 0) {
    super(
      'Block Spacing Validation',
      'Suggests maintaining minimum spacing between blocks for better visual organization',
      100
    );
  }

  appliesTo(context: ValidationContext): boolean {
    return !!(context.block?.position && context.block?.size && context.existingBlocks);
  }

  validate(context: ValidationContext): ValidationResult {
    if (!this.hasRequiredData(context, 'block', 'existingBlocks')) {
      return this.createSuccessResult();
    }

    const { block, existingBlocks } = context;
    const position = block!.position;
    const size = block!.size;

    if (!position || !size || !existingBlocks || this.minSpacing <= 0) {
      return this.createSuccessResult();
    }

    const warnings = [];
    const suggestions = [];

    // Calculate block bounds with spacing buffer
    const blockBounds = {
      left: position.x - this.minSpacing,
      top: position.y - this.minSpacing,
      right: position.x + size.width + this.minSpacing,
      bottom: position.y + size.height + this.minSpacing,
    };

    const tooCloseBlocks = [];

    for (const existing of existingBlocks) {
      if (!existing.position || !existing.size) continue;
      if (existing.id === block!.id) continue;

      const existingBounds = {
        left: existing.position.x,
        top: existing.position.y,
        right: existing.position.x + existing.size.width,
        bottom: existing.position.y + existing.size.height,
      };

      // Check if blocks are too close (within spacing buffer but not overlapping)
      const withinSpacing = !(
        blockBounds.right <= existingBounds.left ||
        blockBounds.left >= existingBounds.right ||
        blockBounds.bottom <= existingBounds.top ||
        blockBounds.top >= existingBounds.bottom
      );

      // Check if they're actually overlapping (collision)
      const actualBlockBounds = {
        left: position.x,
        top: position.y,
        right: position.x + size.width,
        bottom: position.y + size.height,
      };

      const isOverlapping = !(
        actualBlockBounds.right <= existingBounds.left ||
        actualBlockBounds.left >= existingBounds.right ||
        actualBlockBounds.bottom <= existingBounds.top ||
        actualBlockBounds.top >= existingBounds.bottom
      );

      if (withinSpacing && !isOverlapping) {
        tooCloseBlocks.push({
          blockId: existing.id,
          blockType: existing.type,
          distance: this.calculateDistance(position, size, existing.position, existing.size),
        });
      }
    }

    if (tooCloseBlocks.length > 0) {
      suggestions.push(this.createSuggestion(
        'INSUFFICIENT_SPACING',
        `Block is very close to ${tooCloseBlocks.length} existing block(s). Consider adding more spacing for better visual clarity.`,
        `Maintain at least ${this.minSpacing} grid unit(s) of spacing`,
        {
          minSpacing: this.minSpacing,
          tooCloseBlocks,
        }
      ));
    }

    return this.createSuccessResult(suggestions);
  }

  private calculateDistance(
    pos1: { x: number; y: number },
    size1: { width: number; height: number },
    pos2: { x: number; y: number },
    size2: { width: number; height: number }
  ): number {
    // Calculate minimum distance between two rectangles
    const left1 = pos1.x, right1 = pos1.x + size1.width;
    const top1 = pos1.y, bottom1 = pos1.y + size1.height;
    const left2 = pos2.x, right2 = pos2.x + size2.width;
    const top2 = pos2.y, bottom2 = pos2.y + size2.height;

    const horizontalDistance = Math.max(0, Math.max(left1 - right2, left2 - right1));
    const verticalDistance = Math.max(0, Math.max(top1 - bottom2, top2 - bottom1));

    return Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2);
  }
}