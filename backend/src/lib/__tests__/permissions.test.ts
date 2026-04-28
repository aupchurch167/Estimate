import { describe, expect, it } from 'vitest';
import type { UserRole } from '@prisma/client';
import {
  canCloseOutEstimate,
  canCreateEstimate,
  canDeleteEstimate,
  canEditEstimate,
  canManageOrg,
  canManagePricing,
  canManageUsers,
  canReviewEstimate,
  canSendEstimate,
  canSubmitEstimateForReview,
  canUnlockApprovedEstimate,
  canViewCostData,
} from '../permissions.js';

const ALL_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'ESTIMATOR', 'PM', 'VIEWER'];

const adminUser = (role: UserRole, id = 'u1') => ({ id, role });
const estimate = (overrides: Partial<{ drafterId: string; reviewerId: string | null; status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SENT' | 'WON' | 'LOST' | 'REVISED' }> = {}) => ({
  drafterId: 'u-drafter',
  reviewerId: 'u-reviewer',
  status: 'DRAFT' as const,
  ...overrides,
});

describe('canManageUsers / canManagePricing / canManageOrg', () => {
  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['ESTIMATOR', false],
    ['PM', false],
    ['VIEWER', false],
  ])('canManageUsers(%s) → %s', (role, expected) => {
    expect(canManageUsers(role)).toBe(expected);
    expect(canManagePricing(role)).toBe(expected);
    expect(canManageOrg(role)).toBe(expected);
  });
});

describe('canCreateEstimate', () => {
  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['ESTIMATOR', true],
    ['PM', false],
    ['VIEWER', false],
  ])('canCreateEstimate(%s) → %s', (role, expected) => {
    expect(canCreateEstimate(role)).toBe(expected);
  });
});

describe('canEditEstimate', () => {
  const e = estimate();
  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['PM', false],
    ['VIEWER', false],
  ])('non-estimator role: canEditEstimate(%s) → %s regardless of relationship', (role, expected) => {
    expect(canEditEstimate(adminUser(role, 'u-other'), e)).toBe(expected);
  });

  it('ESTIMATOR can edit when drafter', () => {
    expect(canEditEstimate(adminUser('ESTIMATOR', 'u-drafter'), e)).toBe(true);
  });
  it('ESTIMATOR can edit when reviewer', () => {
    expect(canEditEstimate(adminUser('ESTIMATOR', 'u-reviewer'), e)).toBe(true);
  });
  it('ESTIMATOR cannot edit when not drafter or reviewer', () => {
    expect(canEditEstimate(adminUser('ESTIMATOR', 'u-other'), e)).toBe(false);
  });
});

describe('canDeleteEstimate', () => {
  it('OWNER/ADMIN can delete in any status', () => {
    expect(canDeleteEstimate(adminUser('OWNER', 'u-other'), estimate({ status: 'SENT' }))).toBe(true);
    expect(canDeleteEstimate(adminUser('ADMIN', 'u-other'), estimate({ status: 'WON' }))).toBe(true);
  });

  it('ESTIMATOR can delete only own DRAFT', () => {
    expect(canDeleteEstimate(adminUser('ESTIMATOR', 'u-drafter'), estimate({ status: 'DRAFT' }))).toBe(true);
  });
  it('ESTIMATOR cannot delete own non-DRAFT', () => {
    expect(canDeleteEstimate(adminUser('ESTIMATOR', 'u-drafter'), estimate({ status: 'IN_REVIEW' }))).toBe(false);
  });
  it('ESTIMATOR cannot delete others drafts', () => {
    expect(canDeleteEstimate(adminUser('ESTIMATOR', 'u-other'), estimate({ status: 'DRAFT' }))).toBe(false);
  });
  it('PM and VIEWER cannot delete anything', () => {
    expect(canDeleteEstimate(adminUser('PM', 'u-drafter'), estimate())).toBe(false);
    expect(canDeleteEstimate(adminUser('VIEWER', 'u-drafter'), estimate())).toBe(false);
  });
});

describe('canSendEstimate', () => {
  const sendable = estimate({ status: 'APPROVED' });

  it('OWNER/ADMIN can always send regardless of drafterCanSend', () => {
    expect(canSendEstimate(adminUser('OWNER', 'u-other'), sendable, { drafterCanSend: false })).toBe(true);
    expect(canSendEstimate(adminUser('ADMIN', 'u-other'), sendable, { drafterCanSend: false })).toBe(true);
  });

  it('ESTIMATOR (drafter) can send only when drafterCanSend=true', () => {
    expect(canSendEstimate(adminUser('ESTIMATOR', 'u-drafter'), sendable, { drafterCanSend: true })).toBe(true);
    expect(canSendEstimate(adminUser('ESTIMATOR', 'u-drafter'), sendable, { drafterCanSend: false })).toBe(false);
  });

  it('ESTIMATOR (reviewer) can send when drafterCanSend=true', () => {
    expect(canSendEstimate(adminUser('ESTIMATOR', 'u-reviewer'), sendable, { drafterCanSend: true })).toBe(true);
  });

  it('ESTIMATOR unrelated to estimate cannot send', () => {
    expect(canSendEstimate(adminUser('ESTIMATOR', 'u-other'), sendable, { drafterCanSend: true })).toBe(false);
  });

  it('PM and VIEWER never send', () => {
    expect(canSendEstimate(adminUser('PM', 'u-drafter'), sendable, { drafterCanSend: true })).toBe(false);
    expect(canSendEstimate(adminUser('VIEWER', 'u-drafter'), sendable, { drafterCanSend: true })).toBe(false);
  });
});

describe('canViewCostData', () => {
  it.each(ALL_ROLES)('every role can view cost in MVP: %s', (role) => {
    expect(canViewCostData(role)).toBe(true);
  });
});

describe('canSubmitEstimateForReview', () => {
  it('drafter (ESTIMATOR) can submit own DRAFT or REVISED', () => {
    expect(
      canSubmitEstimateForReview(adminUser('ESTIMATOR', 'u-drafter'), estimate({ status: 'DRAFT' })),
    ).toBe(true);
    expect(
      canSubmitEstimateForReview(
        adminUser('ESTIMATOR', 'u-drafter'),
        estimate({ status: 'REVISED' }),
      ),
    ).toBe(true);
  });
  it('admins can submit any DRAFT/REVISED regardless of relationship', () => {
    expect(
      canSubmitEstimateForReview(adminUser('OWNER', 'u-other'), estimate({ status: 'DRAFT' })),
    ).toBe(true);
    expect(
      canSubmitEstimateForReview(adminUser('ADMIN', 'u-other'), estimate({ status: 'REVISED' })),
    ).toBe(true);
  });
  it('non-drafter ESTIMATOR cannot submit', () => {
    expect(
      canSubmitEstimateForReview(adminUser('ESTIMATOR', 'u-reviewer'), estimate({ status: 'DRAFT' })),
    ).toBe(false);
  });
  it('rejects when status is not DRAFT or REVISED', () => {
    expect(
      canSubmitEstimateForReview(adminUser('OWNER', 'u-other'), estimate({ status: 'IN_REVIEW' })),
    ).toBe(false);
    expect(
      canSubmitEstimateForReview(adminUser('OWNER', 'u-other'), estimate({ status: 'APPROVED' })),
    ).toBe(false);
  });
  it('PM and VIEWER cannot submit', () => {
    expect(canSubmitEstimateForReview(adminUser('PM', 'u-drafter'), estimate())).toBe(false);
    expect(canSubmitEstimateForReview(adminUser('VIEWER', 'u-drafter'), estimate())).toBe(false);
  });
});

describe('canReviewEstimate', () => {
  const inReview = estimate({ status: 'IN_REVIEW' });
  it('assigned reviewer (ESTIMATOR) can review', () => {
    expect(canReviewEstimate(adminUser('ESTIMATOR', 'u-reviewer'), inReview)).toBe(true);
  });
  it('admins can review any IN_REVIEW', () => {
    expect(canReviewEstimate(adminUser('OWNER', 'u-other'), inReview)).toBe(true);
    expect(canReviewEstimate(adminUser('ADMIN', 'u-other'), inReview)).toBe(true);
  });
  it('non-reviewer ESTIMATOR cannot review', () => {
    expect(canReviewEstimate(adminUser('ESTIMATOR', 'u-drafter'), inReview)).toBe(false);
  });
  it('rejects when status is not IN_REVIEW', () => {
    expect(canReviewEstimate(adminUser('OWNER', 'u-other'), estimate({ status: 'DRAFT' }))).toBe(
      false,
    );
    expect(
      canReviewEstimate(adminUser('OWNER', 'u-other'), estimate({ status: 'APPROVED' })),
    ).toBe(false);
  });
  it('PM and VIEWER cannot review', () => {
    expect(canReviewEstimate(adminUser('PM', 'u-reviewer'), inReview)).toBe(false);
    expect(canReviewEstimate(adminUser('VIEWER', 'u-reviewer'), inReview)).toBe(false);
  });
});

describe('canUnlockApprovedEstimate', () => {
  it.each<[UserRole, boolean]>([
    ['OWNER', true],
    ['ADMIN', true],
    ['ESTIMATOR', false],
    ['PM', false],
    ['VIEWER', false],
  ])('canUnlockApprovedEstimate(%s) → %s', (role, expected) => {
    expect(canUnlockApprovedEstimate(role)).toBe(expected);
  });
});

describe('canCloseOutEstimate', () => {
  const sent = estimate({ status: 'SENT' });

  it('admin can always close out a SENT estimate', () => {
    expect(canCloseOutEstimate(adminUser('OWNER', 'u-other'), sent)).toBe(true);
    expect(canCloseOutEstimate(adminUser('ADMIN', 'u-other'), sent)).toBe(true);
  });

  it('ESTIMATOR drafter or reviewer can close out', () => {
    expect(canCloseOutEstimate(adminUser('ESTIMATOR', 'u-drafter'), sent)).toBe(true);
    expect(canCloseOutEstimate(adminUser('ESTIMATOR', 'u-reviewer'), sent)).toBe(true);
  });

  it('ESTIMATOR unrelated to the estimate cannot close out', () => {
    expect(canCloseOutEstimate(adminUser('ESTIMATOR', 'u-other'), sent)).toBe(false);
  });

  it('PM and VIEWER never close out', () => {
    expect(canCloseOutEstimate(adminUser('PM', 'u-drafter'), sent)).toBe(false);
    expect(canCloseOutEstimate(adminUser('VIEWER', 'u-drafter'), sent)).toBe(false);
  });

  it('returns false when status is not SENT', () => {
    expect(
      canCloseOutEstimate(adminUser('OWNER', 'u-other'), estimate({ status: 'APPROVED' })),
    ).toBe(false);
    expect(
      canCloseOutEstimate(adminUser('OWNER', 'u-other'), estimate({ status: 'WON' })),
    ).toBe(false);
  });
});
