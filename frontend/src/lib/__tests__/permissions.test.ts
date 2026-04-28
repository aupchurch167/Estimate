import { describe, expect, it } from 'vitest';
import {
  canCreateEstimate,
  canDeleteEstimate,
  canEditEstimate,
  canManageOrg,
  canManagePricing,
  canManageUsers,
  canSendEstimate,
  canViewCostData,
  type PermissionEstimate,
  type UserRole,
} from '@/lib/permissions';

const ALL_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ESTIMATOR', 'PM', 'VIEWER'];

const userOf = (role: UserRole, id = 'u1') => ({ id, role });
const estimate = (overrides: Partial<PermissionEstimate> = {}): PermissionEstimate => ({
  drafterId: 'u-drafter',
  reviewerId: 'u-reviewer',
  status: 'DRAFT',
  ...overrides,
});

describe('frontend permissions mirror', () => {
  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['ESTIMATOR', false],
    ['PM', false],
    ['VIEWER', false],
  ])('canManageUsers/Pricing/Org(%s) → %s', (role, expected) => {
    expect(canManageUsers(role)).toBe(expected);
    expect(canManagePricing(role)).toBe(expected);
    expect(canManageOrg(role)).toBe(expected);
  });

  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['ESTIMATOR', true],
    ['PM', false],
    ['VIEWER', false],
  ])('canCreateEstimate(%s) → %s', (role, expected) => {
    expect(canCreateEstimate(role)).toBe(expected);
  });

  it('canEditEstimate: ESTIMATOR drafter/reviewer yes; ESTIMATOR other no; admins always yes', () => {
    const e = estimate();
    expect(canEditEstimate(userOf('OWNER', 'x'), e)).toBe(true);
    expect(canEditEstimate(userOf('ADMIN', 'x'), e)).toBe(true);
    expect(canEditEstimate(userOf('ESTIMATOR', 'u-drafter'), e)).toBe(true);
    expect(canEditEstimate(userOf('ESTIMATOR', 'u-reviewer'), e)).toBe(true);
    expect(canEditEstimate(userOf('ESTIMATOR', 'x'), e)).toBe(false);
    expect(canEditEstimate(userOf('PM', 'u-drafter'), e)).toBe(false);
    expect(canEditEstimate(userOf('VIEWER', 'u-reviewer'), e)).toBe(false);
  });

  it('canDeleteEstimate: ESTIMATOR own DRAFT only; admins always', () => {
    expect(canDeleteEstimate(userOf('ESTIMATOR', 'u-drafter'), estimate({ status: 'DRAFT' }))).toBe(
      true,
    );
    expect(
      canDeleteEstimate(userOf('ESTIMATOR', 'u-drafter'), estimate({ status: 'IN_REVIEW' })),
    ).toBe(false);
    expect(canDeleteEstimate(userOf('ESTIMATOR', 'x'), estimate({ status: 'DRAFT' }))).toBe(false);
    expect(canDeleteEstimate(userOf('OWNER', 'x'), estimate({ status: 'SENT' }))).toBe(true);
    expect(canDeleteEstimate(userOf('PM', 'u-drafter'), estimate({ status: 'DRAFT' }))).toBe(false);
  });

  it('canSendEstimate: gates on role AND drafterCanSend AND drafter/reviewer relationship', () => {
    const e = estimate({ status: 'APPROVED' });
    expect(canSendEstimate(userOf('OWNER', 'x'), e, { drafterCanSend: false })).toBe(true);
    expect(canSendEstimate(userOf('ADMIN', 'x'), e, { drafterCanSend: false })).toBe(true);
    expect(canSendEstimate(userOf('ESTIMATOR', 'u-drafter'), e, { drafterCanSend: true })).toBe(
      true,
    );
    expect(canSendEstimate(userOf('ESTIMATOR', 'u-drafter'), e, { drafterCanSend: false })).toBe(
      false,
    );
    expect(canSendEstimate(userOf('ESTIMATOR', 'u-reviewer'), e, { drafterCanSend: true })).toBe(
      true,
    );
    expect(canSendEstimate(userOf('ESTIMATOR', 'x'), e, { drafterCanSend: true })).toBe(false);
    expect(canSendEstimate(userOf('PM', 'u-drafter'), e, { drafterCanSend: true })).toBe(false);
    expect(canSendEstimate(userOf('VIEWER', 'u-drafter'), e, { drafterCanSend: true })).toBe(false);
  });

  it('canViewCostData: every role can view cost in MVP', () => {
    for (const role of ALL_ROLES) {
      expect(canViewCostData(role)).toBe(true);
    }
  });
});
