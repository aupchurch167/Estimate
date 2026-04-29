/**
 * Service-level unit tests for userService. Hits the real database with
 * disposable orgs so the boundary cases on changePassword (wrong current,
 * identical) and updateProfile are covered with real bcrypt + Prisma.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import { changePassword, signAvatarUpload, updateProfile } from '../../services/userService.js';
import { AuthError, ValidationError } from '../../lib/errors.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const trackedOrgIds = new Set<string>();

async function makeUser() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `User Svc ${counter} ${RUN_ID}`,
    email: `usersvc-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Old',
    lastName: 'Name',
  });
  trackedOrgIds.add(result.organization.id);
  return result;
}

afterAll(async () => {
  for (const orgId of trackedOrgIds) {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('userService.updateProfile', () => {
  it('updates firstName and lastName, returns SafeUser without sensitive fields', async () => {
    const { user } = await makeUser();
    const updated = await updateProfile(user.id, { firstName: 'New', lastName: 'Surname' });
    expect(updated.firstName).toBe('New');
    expect(updated.lastName).toBe('Surname');
    expect(updated).not.toHaveProperty('passwordHash');
    expect(updated).not.toHaveProperty('tokenVersion');
  });

  it('updates avatarUrl when provided, leaves untouched when omitted', async () => {
    const { user } = await makeUser();
    const a = await updateProfile(user.id, { avatarUrl: 'https://cdn.example.com/a.png' });
    expect(a.avatarUrl).toBe('https://cdn.example.com/a.png');
    const b = await updateProfile(user.id, { firstName: 'New First' });
    expect(b.avatarUrl).toBe('https://cdn.example.com/a.png');
    expect(b.firstName).toBe('New First');
  });

  it('clears avatarUrl when explicitly set to null', async () => {
    const { user } = await makeUser();
    await updateProfile(user.id, { avatarUrl: 'https://cdn.example.com/a.png' });
    const cleared = await updateProfile(user.id, { avatarUrl: null });
    expect(cleared.avatarUrl).toBeNull();
  });
});

describe('userService.changePassword', () => {
  it('succeeds when current password is correct and new differs', async () => {
    const { user } = await makeUser();
    await expect(
      changePassword(user.id, 'OriginalPass1!', 'NewPass-9876'),
    ).resolves.toBeUndefined();
    // verify bcrypt re-hashed: re-running with the original should fail
    await expect(changePassword(user.id, 'OriginalPass1!', 'AnotherPass1!')).rejects.toThrow(
      AuthError,
    );
  });

  it('throws AuthError on wrong current password', async () => {
    const { user } = await makeUser();
    await expect(changePassword(user.id, 'WRONG', 'NewPass-9876')).rejects.toThrow(AuthError);
  });

  it('throws ValidationError when new equals current', async () => {
    const { user } = await makeUser();
    await expect(changePassword(user.id, 'OriginalPass1!', 'OriginalPass1!')).rejects.toThrow(
      ValidationError,
    );
  });

  it('does not bump tokenVersion (user stays logged in)', async () => {
    const { user } = await makeUser();
    const before = (await prisma.user.findUnique({ where: { id: user.id } }))!.tokenVersion;
    await changePassword(user.id, 'OriginalPass1!', 'AnotherPass1!');
    const after = (await prisma.user.findUnique({ where: { id: user.id } }))!.tokenVersion;
    expect(after).toBe(before);
  });
});

describe('userService.signAvatarUpload', () => {
  it('returns a signed URL + computed key for a valid PNG payload', async () => {
    const { user } = await makeUser();
    const signed = await signAvatarUpload({
      userId: user.id,
      contentType: 'image/png',
      fileSizeBytes: 100_000,
    });
    expect(signed.url).toMatch(/^https?:\/\//);
    expect(signed.key).toContain(`users/${user.id}/avatars/`);
    expect(signed.key.endsWith('.png')).toBe(true);
    expect(signed.expiresIn).toBeGreaterThan(0);
  });

  it('rejects unsupported content types', async () => {
    const { user } = await makeUser();
    await expect(
      signAvatarUpload({
        userId: user.id,
        contentType: 'application/pdf',
        fileSizeBytes: 100,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects oversized payloads', async () => {
    const { user } = await makeUser();
    await expect(
      signAvatarUpload({
        userId: user.id,
        contentType: 'image/png',
        fileSizeBytes: 10 * 1024 * 1024,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('userService — admin management (Phase 7.1)', () => {
  // Helper: make an admin (signup creates them as OWNER) + a teammate in
  // the same org via a separate signup that we re-attach.
  async function makeAdminAndTeammate() {
    const owner = await makeUser();
    counter += 1;
    const teammateSignup = await serviceSignup({
      companyName: `Adm-Mate-${counter}-${RUN_ID}`,
      email: `adm-${counter}-${RUN_ID}@example.test`,
      password: 'OriginalPass1!',
      firstName: 'Mate',
      lastName: 'X',
    });
    trackedOrgIds.add(teammateSignup.organization.id);
    const teammate = await prisma.user.update({
      where: { id: teammateSignup.user.id },
      data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
    });
    return { ownerActor: { id: owner.user.id, role: owner.user.role }, teammate, organizationId: owner.organization.id };
  }

  it('changeRole flips role, bumps tokenVersion, writes USER_ROLE_CHANGED', async () => {
    const { ownerActor, teammate, organizationId } = await makeAdminAndTeammate();
    const { changeRole } = await import('../userService.js');
    const updated = await changeRole(ownerActor, organizationId, teammate.id, 'PM');
    expect(updated.role).toBe('PM');

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: teammate.id } });
    expect(fresh.tokenVersion).toBeGreaterThan(teammate.tokenVersion);

    const event = await prisma.activityEvent.findFirst({
      where: { organizationId, eventType: 'USER_ROLE_CHANGED', entityId: teammate.id },
    });
    expect(event).toBeTruthy();
    expect(event?.meta).toMatchObject({ fromRole: 'ESTIMATOR', toRole: 'PM' });
  });

  it('changeRole is a no-op when role is already correct (no tokenVersion bump)', async () => {
    const { ownerActor, teammate, organizationId } = await makeAdminAndTeammate();
    const { changeRole } = await import('../userService.js');
    const before = teammate.tokenVersion;
    await changeRole(ownerActor, organizationId, teammate.id, 'ESTIMATOR');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: teammate.id } });
    expect(after.tokenVersion).toBe(before);
  });

  it('rejects targeting OWNER and rejects promotion to OWNER', async () => {
    const { ownerActor, teammate, organizationId } = await makeAdminAndTeammate();
    const { changeRole } = await import('../userService.js');
    await expect(
      changeRole(ownerActor, organizationId, ownerActor.id, 'ESTIMATOR'),
    ).rejects.toThrow(/yourself/i);
    await expect(
      changeRole(ownerActor, organizationId, teammate.id, 'OWNER' as never),
    ).rejects.toThrow(/owner/i);
  });

  it('deactivate flips isActive, bumps tokenVersion, writes USER_DEACTIVATED', async () => {
    const { ownerActor, teammate, organizationId } = await makeAdminAndTeammate();
    const { deactivate } = await import('../userService.js');
    const before = teammate.tokenVersion;
    const result = await deactivate(ownerActor, organizationId, teammate.id);
    expect(result.isActive).toBe(false);

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: teammate.id } });
    expect(fresh.tokenVersion).toBeGreaterThan(before);

    const event = await prisma.activityEvent.findFirst({
      where: { organizationId, eventType: 'USER_DEACTIVATED', entityId: teammate.id },
    });
    expect(event).toBeTruthy();
  });

  it('deactivate refuses self and refuses OWNER', async () => {
    const { ownerActor, organizationId } = await makeAdminAndTeammate();
    const { deactivate } = await import('../userService.js');
    await expect(
      deactivate(ownerActor, organizationId, ownerActor.id),
    ).rejects.toThrow(/yourself/i);

    // Promote a peer to OWNER directly (we never expose this externally —
    // pure setup for the rejection test).
    counter += 1;
    const peerSignup = await serviceSignup({
      companyName: `Adm-Peer-${counter}-${RUN_ID}`,
      email: `peer-${counter}-${RUN_ID}@example.test`,
      password: 'OriginalPass1!',
      firstName: 'P',
      lastName: 'X',
    });
    trackedOrgIds.add(peerSignup.organization.id);
    const peer = await prisma.user.update({
      where: { id: peerSignup.user.id },
      data: { organizationId, role: 'OWNER' },
    });
    await expect(
      deactivate(ownerActor, organizationId, peer.id),
    ).rejects.toThrow(/owner/i);
  });

  it('reactivate flips isActive back; idempotent on already-active users', async () => {
    const { ownerActor, teammate, organizationId } = await makeAdminAndTeammate();
    const { deactivate, reactivate } = await import('../userService.js');
    await deactivate(ownerActor, organizationId, teammate.id);
    const back = await reactivate(ownerActor, organizationId, teammate.id);
    expect(back.isActive).toBe(true);
    const idempotent = await reactivate(ownerActor, organizationId, teammate.id);
    expect(idempotent.isActive).toBe(true);
  });

  it('non-admin actor (ESTIMATOR) cannot use admin endpoints', async () => {
    const { teammate, organizationId } = await makeAdminAndTeammate();
    const { changeRole, deactivate } = await import('../userService.js');
    counter += 1;
    const otherSignup = await serviceSignup({
      companyName: `Adm-Other-${counter}-${RUN_ID}`,
      email: `oth-${counter}-${RUN_ID}@example.test`,
      password: 'OriginalPass1!',
      firstName: 'O',
      lastName: 'X',
    });
    trackedOrgIds.add(otherSignup.organization.id);
    const other = await prisma.user.update({
      where: { id: otherSignup.user.id },
      data: { organizationId, role: 'ESTIMATOR' },
    });
    const intruder = { id: other.id, role: other.role };

    await expect(
      changeRole(intruder, organizationId, teammate.id, 'PM'),
    ).rejects.toThrow(/OWNER and ADMIN/);
    await expect(
      deactivate(intruder, organizationId, teammate.id),
    ).rejects.toThrow(/OWNER and ADMIN/);
  });

  it('cross-org targets are rejected as NotFound', async () => {
    const a = await makeAdminAndTeammate();
    const b = await makeAdminAndTeammate();
    const { changeRole } = await import('../userService.js');
    await expect(
      changeRole(a.ownerActor, a.organizationId, b.teammate.id, 'PM'),
    ).rejects.toThrow();
  });
});
