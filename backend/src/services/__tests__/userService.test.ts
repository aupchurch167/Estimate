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
