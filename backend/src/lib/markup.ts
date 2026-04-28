/**
 * Markup resolution cascade — brief Section 3.
 *
 *   LineItem.markupPercent
 *     > ScopeSection.markupPercent
 *     > matched MarkupRule (highest priority active rule)
 *     > PriceBookCategory.defaultMarkupPercent
 *     > OrgSettings.defaultMarkupPercent
 *     > 0 (final fallback)
 *
 * MarkupRule scope matching:
 *   - CATEGORY: matchValue is a PriceBookCategory id (or name — we accept
 *     both for forgiveness).
 *   - SECTION_NAME_MATCH: matchValue substring-matches the section name
 *     (case-insensitive).
 *   - LINE_DESCRIPTION_MATCH: matchValue substring-matches the line
 *     description (case-insensitive).
 *
 * Pure function — no DB calls. Caller is responsible for fetching the
 * relevant rules + section + category and passing them in.
 */

import type { MarkupRuleScope } from '@prisma/client';

/**
 * The shape we need from a MarkupRule for cascade evaluation. Decimal
 * fields accept either Prisma's `Decimal` instances (from the DB) or plain
 * strings (tests + future fixtures); we always stringify before
 * comparing.
 */
export interface MarkupRuleSlim {
  appliesTo: MarkupRuleScope;
  matchValue: string;
  markupPercent: unknown;
  priority: number;
  isActive: boolean;
  priceBookId?: string | null;
}

export interface ResolveMarkupArgs {
  lineMarkup?: string | null;
  lineDescription?: string;
  section?: {
    name?: string;
    markupPercent?: string | null;
  } | null;
  category?: {
    id?: string;
    name?: string;
    defaultMarkupPercent?: string | null;
  } | null;
  orgSettings: { defaultMarkupPercent?: string | null };
  markupRules: MarkupRuleSlim[];
}

export function resolveMarkup(args: ResolveMarkupArgs): string {
  if (notEmpty(args.lineMarkup)) return String(args.lineMarkup);
  if (notEmpty(args.section?.markupPercent)) return String(args.section!.markupPercent);

  const ruleMatch = pickRule(args);
  if (ruleMatch) return String(ruleMatch.markupPercent);

  if (notEmpty(args.category?.defaultMarkupPercent)) {
    return String(args.category!.defaultMarkupPercent);
  }
  if (notEmpty(args.orgSettings.defaultMarkupPercent)) {
    return String(args.orgSettings.defaultMarkupPercent);
  }
  return '0';
}

function pickRule(args: ResolveMarkupArgs): MarkupRuleSlim | undefined {
  const candidates = args.markupRules
    .filter((r) => r.isActive && ruleMatches(r, args))
    .sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

function ruleMatches(rule: MarkupRuleSlim, args: ResolveMarkupArgs): boolean {
  const target = rule.matchValue.trim().toLowerCase();
  if (target.length === 0) return false;
  switch (rule.appliesTo) {
    case 'CATEGORY':
      return (
        target === args.category?.id?.toLowerCase() ||
        target === args.category?.name?.toLowerCase()
      );
    case 'SECTION_NAME_MATCH':
      return Boolean(args.section?.name && args.section.name.toLowerCase().includes(target));
    case 'LINE_DESCRIPTION_MATCH':
      return Boolean(
        args.lineDescription && args.lineDescription.toLowerCase().includes(target),
      );
    default:
      return false;
  }
}

function notEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s.length > 0;
}
