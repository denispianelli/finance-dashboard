// The label-key logic lives in shared/ (the renderer needs suggestRuleToken for
// the rule-creation prefill); this shim keeps the historical main-process import
// path stable.
export { stableLabelKey, suggestRuleToken, type RuleSuggestion } from '@shared/categorize/labelKey';
