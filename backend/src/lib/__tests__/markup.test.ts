import { describe, expect, it } from 'vitest';
import { resolveMarkup, type MarkupRuleSlim } from '../markup.js';

const ORG = { defaultMarkupPercent: '0.10' };
const SECTION = { name: 'Demolition', markupPercent: '0.30' };
const CATEGORY = { id: 'cat-1', name: 'Demolition', defaultMarkupPercent: '0.20' };

const rule = (overrides: Partial<MarkupRuleSlim> = {}): MarkupRuleSlim => ({
  appliesTo: 'CATEGORY',
  matchValue: 'cat-1',
  markupPercent: '0.50',
  priority: 100,
  isActive: true,
  priceBookId: null,
  ...overrides,
});

describe('resolveMarkup cascade', () => {
  it('1. Line override wins over everything', () => {
    expect(
      resolveMarkup({
        lineMarkup: '0.80',
        section: SECTION,
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: [rule()],
      }),
    ).toBe('0.80');
  });

  it('2. Section markup wins over rules + category + org defaults', () => {
    expect(
      resolveMarkup({
        section: SECTION,
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: [rule()],
      }),
    ).toBe('0.30');
  });

  it('3. Highest-priority active CATEGORY rule wins when no line/section markup', () => {
    const rules = [
      rule({ priority: 10, markupPercent: '0.40' }),
      rule({ priority: 99, markupPercent: '0.55' }),
      rule({ priority: 50, markupPercent: '0.45', isActive: false }),
    ];
    expect(
      resolveMarkup({
        section: { name: SECTION.name },
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: rules,
      }),
    ).toBe('0.55');
  });

  it('3b. SECTION_NAME_MATCH rule fires on substring match', () => {
    const rules = [
      rule({
        appliesTo: 'SECTION_NAME_MATCH',
        matchValue: 'demo',
        markupPercent: '0.42',
      }),
    ];
    expect(
      resolveMarkup({
        section: { name: 'Demolition + Disposal' },
        category: { ...CATEGORY, defaultMarkupPercent: '0.20' },
        orgSettings: ORG,
        markupRules: rules,
      }),
    ).toBe('0.42');
  });

  it('3c. LINE_DESCRIPTION_MATCH rule fires when line description contains matchValue', () => {
    const rules = [
      rule({
        appliesTo: 'LINE_DESCRIPTION_MATCH',
        matchValue: 'sub-quote',
        markupPercent: '0.05',
      }),
    ];
    expect(
      resolveMarkup({
        lineDescription: 'HVAC sub-quote, supply only',
        section: { name: 'HVAC' },
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: rules,
      }),
    ).toBe('0.05');
  });

  it('4. Category default wins when no rule matches', () => {
    expect(
      resolveMarkup({
        section: { name: 'Demolition' },
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: [rule({ matchValue: 'something-else' })],
      }),
    ).toBe('0.20');
  });

  it('5. Org default fallback when category has none', () => {
    expect(
      resolveMarkup({
        section: { name: 'Demolition' },
        category: { ...CATEGORY, defaultMarkupPercent: null },
        orgSettings: ORG,
        markupRules: [],
      }),
    ).toBe('0.10');
  });

  it('6. Final fallback to "0" when org default is missing', () => {
    expect(
      resolveMarkup({
        section: { name: 'Demolition' },
        category: { ...CATEGORY, defaultMarkupPercent: null },
        orgSettings: { defaultMarkupPercent: null },
        markupRules: [],
      }),
    ).toBe('0');
  });

  it('inactive rules are ignored even if highest priority', () => {
    const rules = [
      rule({ priority: 999, markupPercent: '0.99', isActive: false }),
      rule({ priority: 1, markupPercent: '0.55' }),
    ];
    expect(
      resolveMarkup({
        section: { name: 'Demolition' },
        category: CATEGORY,
        orgSettings: ORG,
        markupRules: rules,
      }),
    ).toBe('0.55');
  });
});
