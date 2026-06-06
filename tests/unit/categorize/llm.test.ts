import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LlamaModel } from 'node-llama-cpp';
import {
  buildCategorizationPrompt,
  parseCategorization,
  categorizeBatch,
  type LlmCategory,
  type CategorizeItem,
} from '../../../src/main/categorize/llm';
import { runPrompt } from '../../../src/main/llm/llm';

vi.mock('../../../src/main/llm/llm', () => ({ runPrompt: vi.fn() }));

const CATEGORIES: LlmCategory[] = [
  { id: 'cat-food', name: 'Alimentation' },
  { id: 'cat-transport', name: 'Transport' },
  { id: 'cat-leisure', name: 'Loisirs' },
];

const ITEM_FOOD: CategorizeItem = { id: 'h1', label: 'CARREFOUR MARKET' };
const ITEM_SALARY: CategorizeItem = { id: 'h2', label: 'VIR RECU SALAIRE' };
const ITEMS: CategorizeItem[] = [ITEM_FOOD, ITEM_SALARY];

describe('buildCategorizationPrompt', () => {
  it('includes every category name', () => {
    const prompt = buildCategorizationPrompt(CATEGORIES, ITEMS);
    for (const cat of CATEGORIES) {
      expect(prompt).toContain(cat.name);
    }
  });

  it('includes every item label', () => {
    const prompt = buildCategorizationPrompt(CATEGORIES, ITEMS);
    for (const item of ITEMS) {
      expect(prompt).toContain(item.label);
    }
  });

  it('numbers items 1-based', () => {
    const prompt = buildCategorizationPrompt(CATEGORIES, ITEMS);
    expect(prompt).toContain('1. CARREFOUR MARKET');
    expect(prompt).toContain('2. VIR RECU SALAIRE');
  });

  it('demands strict JSON only and offers AUCUNE', () => {
    const prompt = buildCategorizationPrompt(CATEGORIES, ITEMS);
    expect(prompt).toContain('JSON');
    expect(prompt).toMatch(/UNIQUEMENT/i);
    expect(prompt).toContain('AUCUNE');
  });

  it('truncates long labels to 120 chars', () => {
    const longLabel = 'X'.repeat(300);
    const prompt = buildCategorizationPrompt(CATEGORIES, [{ id: 'h', label: longLabel }]);
    expect(prompt).toContain('X'.repeat(120));
    expect(prompt).not.toContain('X'.repeat(121));
  });
});

describe('parseCategorization', () => {
  it('maps named categories and AUCUNE to id / null', () => {
    const res = parseCategorization('{"1":"Alimentation","2":"AUCUNE"}', CATEGORIES, ITEMS);
    expect(res).toEqual([
      { id: 'h1', categoryId: 'cat-food' },
      { id: 'h2', categoryId: null },
    ]);
  });

  it('matches names accent- and case-insensitively', () => {
    const lower = parseCategorization('{"1":"alimentation"}', CATEGORIES, [ITEM_FOOD]);
    const upper = parseCategorization('{"1":"ALIMENTATION"}', CATEGORIES, [ITEM_FOOD]);
    expect(lower).toEqual([{ id: 'h1', categoryId: 'cat-food' }]);
    expect(upper).toEqual([{ id: 'h1', categoryId: 'cat-food' }]);
  });

  it('strips diacritics when matching', () => {
    const cats: LlmCategory[] = [{ id: 'cat-x', name: 'Énergie' }];
    const items: CategorizeItem[] = [{ id: 'h', label: 'EDF' }];
    const res = parseCategorization('{"1":"energie"}', cats, items);
    expect(res).toEqual([{ id: 'h', categoryId: 'cat-x' }]);
  });

  it('returns null for an unknown category name', () => {
    const res = parseCategorization('{"1":"Voyages"}', CATEGORIES, [ITEM_FOOD]);
    expect(res).toEqual([{ id: 'h1', categoryId: null }]);
  });

  it('returns all null on malformed JSON', () => {
    const res = parseCategorization('not json at all', CATEGORIES, ITEMS);
    expect(res).toEqual([
      { id: 'h1', categoryId: null },
      { id: 'h2', categoryId: null },
    ]);
  });

  it('returns all null when no JSON object is present', () => {
    const res = parseCategorization('the model refused', CATEGORIES, ITEMS);
    expect(res.every((r) => r.categoryId === null)).toBe(true);
  });

  it('extracts JSON wrapped in prose (tolerant)', () => {
    const res = parseCategorization(
      'Voici la réponse : {"1":"Transport","2":"Alimentation"} merci',
      CATEGORIES,
      ITEMS,
    );
    expect(res).toEqual([
      { id: 'h1', categoryId: 'cat-transport' },
      { id: 'h2', categoryId: 'cat-food' },
    ]);
  });

  it('leaves missing keys as null when fewer keys than items', () => {
    const res = parseCategorization('{"1":"Alimentation"}', CATEGORIES, ITEMS);
    expect(res).toEqual([
      { id: 'h1', categoryId: 'cat-food' },
      { id: 'h2', categoryId: null },
    ]);
  });

  it('returns exactly one result per item, in input order, preserving tx_hash', () => {
    const items: CategorizeItem[] = [
      { id: 'a', label: 'one' },
      { id: 'b', label: 'two' },
      { id: 'c', label: 'three' },
    ];
    const res = parseCategorization('{"1":"Transport","3":"Loisirs"}', CATEGORIES, items);
    expect(res).toEqual([
      { id: 'a', categoryId: 'cat-transport' },
      { id: 'b', categoryId: null },
      { id: 'c', categoryId: 'cat-leisure' },
    ]);
  });

  it('never emits an id absent from categories (a returned id is not a name)', () => {
    const res = parseCategorization('{"1":"cat-food","2":"Inconnu"}', CATEGORIES, ITEMS);
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const r of res) {
      if (r.categoryId !== null) expect(ids.has(r.categoryId)).toBe(true);
    }
    // "cat-food" is an id, not a name → not matched → null.
    expect(res).toEqual([
      { id: 'h1', categoryId: null },
      { id: 'h2', categoryId: null },
    ]);
  });

  it('handles a non-object JSON value as all null', () => {
    const res = parseCategorization('[1,2,3]', CATEGORIES, ITEMS);
    expect(res.every((r) => r.categoryId === null)).toBe(true);
  });
});

describe('categorizeBatch', () => {
  const runPromptMock = vi.mocked(runPrompt);

  beforeEach(() => {
    runPromptMock.mockReset();
  });

  it('maps the model JSON response into results', async () => {
    runPromptMock.mockResolvedValue('{"1":"Alimentation","2":"AUCUNE"}');
    const fakeModel = {} as LlamaModel;
    const res = await categorizeBatch(fakeModel, CATEGORIES, ITEMS);
    expect(runPromptMock).toHaveBeenCalledOnce();
    expect(res).toEqual([
      { id: 'h1', categoryId: 'cat-food' },
      { id: 'h2', categoryId: null },
    ]);
  });

  it('passes the built prompt to runPrompt', async () => {
    runPromptMock.mockResolvedValue('{}');
    const fakeModel = {} as LlamaModel;
    await categorizeBatch(fakeModel, CATEGORIES, ITEMS);
    const call = runPromptMock.mock.calls[0];
    expect(call).toBeDefined();
    const passedPrompt = call?.[1] ?? '';
    expect(passedPrompt).toContain('Alimentation');
    expect(passedPrompt).toContain('CARREFOUR MARKET');
  });
});
