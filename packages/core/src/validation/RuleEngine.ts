import { EventEmitter } from '../EventEmitter';
import type { 
  IRuleEngine, 
  IValidationRule, 
  IRuleGroup, 
  ValidationContext, 
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion
} from './types';

/**
 * Rule engine implementation for managing and executing validation rules
 */
export class RuleEngine extends EventEmitter implements IRuleEngine {
  private rules = new Map<string, IValidationRule>();
  private ruleGroups = new Map<string, IRuleGroup>();
  private rulesByGroup = new Map<string, Set<string>>();

  constructor() {
    super();
  }

  registerRule(rule: IValidationRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with ID '${rule.id}' is already registered`);
    }

    this.rules.set(rule.id, rule);
    (this as any).emit('rule:registered', { rule });
  }

  unregisterRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return; // Rule doesn't exist, nothing to do
    }

    this.rules.delete(ruleId);

    // Remove from any groups
    for (const [groupId, ruleIds] of this.rulesByGroup.entries()) {
      if (ruleIds.has(ruleId)) {
        ruleIds.delete(ruleId);
        if (ruleIds.size === 0) {
          this.rulesByGroup.delete(groupId);
        }
      }
    }

    (this as any).emit('rule:unregistered', { rule });
  }

  registerRuleGroup(group: IRuleGroup): void {
    if (this.ruleGroups.has(group.id)) {
      throw new Error(`Rule group with ID '${group.id}' is already registered`);
    }

    this.ruleGroups.set(group.id, group);
    const ruleIds = new Set<string>();

    // Register individual rules and track them in the group
    for (const rule of group.rules) {
      this.registerRule(rule);
      ruleIds.add(rule.id);
    }

    this.rulesByGroup.set(group.id, ruleIds);
    (this as any).emit('rule-group:registered', { group });
  }

  getRules(): IValidationRule[] {
    return Array.from(this.rules.values());
  }

  getRulesByGroup(groupId: string): IValidationRule[] {
    const ruleIds = this.rulesByGroup.get(groupId);
    if (!ruleIds) {
      return [];
    }

    return Array.from(ruleIds)
      .map(id => this.rules.get(id))
      .filter((rule): rule is IValidationRule => rule != null);
  }

  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule with ID '${ruleId}' not found`);
    }

    // Create a new rule instance with updated enabled state
    const updatedRule = { ...rule, enabled };
    this.rules.set(ruleId, updatedRule);

    (this as any).emit('rule:enabled-changed', { ruleId, enabled });
  }

  setRuleGroupEnabled(groupId: string, enabled: boolean): void {
    const group = this.ruleGroups.get(groupId);
    if (!group) {
      throw new Error(`Rule group with ID '${groupId}' not found`);
    }

    // Update group enabled state
    const updatedGroup = { ...group, enabled };
    this.ruleGroups.set(groupId, updatedGroup);

    // Update all rules in the group
    const ruleIds = this.rulesByGroup.get(groupId);
    if (ruleIds) {
      for (const ruleId of ruleIds) {
        this.setRuleEnabled(ruleId, enabled);
      }
    }

    (this as any).emit('rule-group:enabled-changed', { groupId, enabled });
  }

  validate(context: ValidationContext): ValidationResult {
    const applicableRules = this.getApplicableRules(context);
    return this.executeRules(applicableRules, context);
  }

  validateWithRules(context: ValidationContext, ruleIds: string[]): ValidationResult {
    const rules = ruleIds
      .map(id => this.rules.get(id))
      .filter((rule): rule is IValidationRule => rule != null && rule.enabled);

    return this.executeRules(rules, context);
  }

  // Public utility methods

  /**
   * Get all rules that apply to the given context
   */
  getApplicableRules(context: ValidationContext): IValidationRule[] {
    return this.getRules()
      .filter(rule => rule.enabled && rule.appliesTo(context))
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  /**
   * Get validation statistics
   */
  getStatistics(): {
    totalRules: number;
    enabledRules: number;
    ruleGroups: number;
    rulesByType: Record<string, number>;
  } {
    const rules = this.getRules();
    const rulesByType: Record<string, number> = {};

    for (const rule of rules) {
      const type = (rule as any).type || 'unknown';
      rulesByType[type] = (rulesByType[type] || 0) + 1;
    }

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      ruleGroups: this.ruleGroups.size,
      rulesByType,
    };
  }

  // Private methods

  private executeRules(rules: IValidationRule[], context: ValidationContext): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    const allSuggestions: ValidationSuggestion[] = [];
    const ruleResults: Record<string, ValidationResult> = {};

    let hasErrors = false;

    for (const rule of rules) {
      try {
        (this as any).emit('rule:executing', { rule, context });
        
        const result = rule.validate(context);
        ruleResults[rule.id] = result;

        if (result.errors) {
          allErrors.push(...result.errors);
          hasErrors = true;
        }

        if (result.warnings) {
          allWarnings.push(...result.warnings);
        }

        if (result.suggestions) {
          allSuggestions.push(...result.suggestions);
        }

        (this as any).emit('rule:executed', { rule, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        const ruleError: ValidationError = {
          code: 'RULE_EXECUTION_ERROR',
          message: `Rule '${rule.name}' failed to execute: ${errorMessage}`,
          context: { ruleId: rule.id, ruleName: rule.name }
        };

        allErrors.push(ruleError);
        hasErrors = true;

        (this as any).emit('rule:error', { rule, error: ruleError });
      }
    }

    const finalResult: ValidationResult = {
      valid: !hasErrors,
      errors: allErrors.length > 0 ? allErrors : undefined,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
      metadata: {
        rulesExecuted: rules.length,
        ruleResults,
        executionTimestamp: Date.now(),
      }
    };

    (this as any).emit('validation:completed', { context, result: finalResult });
    return finalResult;
  }

  /**
   * Clear all rules and groups
   */
  clear(): void {
    const rulesCleared = this.rules.size;
    const groupsCleared = this.ruleGroups.size;

    this.rules.clear();
    this.ruleGroups.clear();
    this.rulesByGroup.clear();

    (this as any).emit('rules:cleared', { rulesCleared, groupsCleared });
  }

  /**
   * Export rules configuration for persistence
   */
  exportConfig(): {
    rules: Array<{ id: string; enabled: boolean }>;
    groups: Array<{ id: string; enabled: boolean }>;
  } {
    return {
      rules: this.getRules().map(rule => ({
        id: rule.id,
        enabled: rule.enabled,
      })),
      groups: Array.from(this.ruleGroups.values()).map(group => ({
        id: group.id,
        enabled: group.enabled,
      })),
    };
  }

  /**
   * Import rules configuration from persistence
   */
  importConfig(config: {
    rules?: Array<{ id: string; enabled: boolean }>;
    groups?: Array<{ id: string; enabled: boolean }>;
  }): void {
    if (config.rules) {
      for (const { id, enabled } of config.rules) {
        try {
          this.setRuleEnabled(id, enabled);
        } catch (error) {
          console.warn(`Failed to set rule enabled state for ${id}:`, error);
        }
      }
    }

    if (config.groups) {
      for (const { id, enabled } of config.groups) {
        try {
          this.setRuleGroupEnabled(id, enabled);
        } catch (error) {
          console.warn(`Failed to set rule group enabled state for ${id}:`, error);
        }
      }
    }

    (this as any).emit('config:imported', { config });
  }
}