import type { RuleDTO, RuleInput } from '@shared/types/rules';
import type { RulesMutationResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  InvalidRuleError,
} from '../../categorize/rulesManage';

export function handleRulesList(): { rules: RuleDTO[] } {
  return { rules: listRules(getDb()) };
}

export function handleRulesCreate(payload: RuleInput): RulesMutationResponse {
  try {
    const { rule, applied } = createRule(getDb(), payload);
    return { ok: true, rule, applied };
  } catch (e) {
    if (e instanceof InvalidRuleError) return { ok: false, error: 'invalid_rule' };
    throw e;
  }
}

export function handleRulesUpdate(payload: RuleInput & { id: string }): RulesMutationResponse {
  try {
    const { rule, applied } = updateRule(getDb(), payload);
    return { ok: true, rule, applied };
  } catch (e) {
    if (e instanceof InvalidRuleError) return { ok: false, error: 'invalid_rule' };
    throw e;
  }
}

export function handleRulesDelete(payload: { id: string }): { ok: true } {
  deleteRule(getDb(), payload.id);
  return { ok: true };
}
