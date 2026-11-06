import { describe, expect, it } from 'vitest';
import { db, scoped } from '@roi/database';
import { defaultGrants, PERMISSIONS } from '@roi/shared-types';
import { totp } from '@roi/shared-utils';
import { beginTotpEnrollment, confirmTotpEnrollment, createPasswordReset, registerCustomer, resetPassword, verifyCredentials, verifySecondFactor, LOCKOUT } from '@/server/auth-service';
import { makeCustomer } from './helpers';

describe('authentication (spec §6)', () => {
  it('registers a customer with workspace, profile and verification token; rejects weak passwords', async () => {
    expect((await registerCustomer({ name: 'Ann', businessName: 'Ann Co', email: 'weak@test.example', password: 'short', marketingOk: false })).ok).toBe(false);
    const r = await registerCustomer({ name: 'Ann', businessName: 'Ann Co', email: 'ann@test.example', password: 'a-long-enough-passphrase', marketingOk: true });
    expect(r.ok).toBe(true);
    const u = await db().user.findUniqueOrThrow({ where: { email: 'ann@test.example' }, include: { customer: true } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(u.customer?.workspaceId).toBeTruthy();
    expect((await registerCustomer({ name: 'Ann', businessName: 'Ann Co', email: 'ann@test.example', password: 'a-long-enough-passphrase', marketingOk: true })).ok).toBe(false);
  });
  it('locks out after repeated failures and gives the same error for unknown emails', async () => {
    await registerCustomer({ name: 'Lo', businessName: 'Lo Co', email: 'lock@test.example', password: 'correct-horse-battery', marketingOk: false });
    expect((await verifyCredentials('nobody@test.example', 'x', '1.1.1.1')).ok).toBe(false);
    for (let i = 0; i < LOCKOUT.attempts; i++) expect(await verifyCredentials('lock@test.example', 'wrong-password', '1.1.1.1')).toMatchObject({ ok: false, code: 'INVALID' });
    expect(await verifyCredentials('lock@test.example', 'correct-horse-battery', '1.1.1.1')).toMatchObject({ ok: false, code: 'LOCKED' });
  });
  it('password reset tokens work once and revoke sessions', async () => {
    await registerCustomer({ name: 'Re', businessName: 'Re Co', email: 'reset@test.example', password: 'original-password-1', marketingOk: false });
    const t = await createPasswordReset('reset@test.example');
    expect((await resetPassword(t!.token, 'brand-new-password-2')).ok).toBe(true);
    expect((await resetPassword(t!.token, 'another-password-3')).ok).toBe(false);
    expect((await verifyCredentials('reset@test.example', 'brand-new-password-2', null)).ok).toBe(true);
    expect(await createPasswordReset('missing@test.example')).toBeNull();
  });
  it('TOTP enrollment, verification, replay refusal and single-use recovery codes', async () => {
    const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@test.example' } });
    const s = await beginTotpEnrollment(admin.id);
    expect(s.ok).toBe(true);
    const r = await confirmTotpEnrollment(admin.id, totp((s as { secret: string }).secret));
    expect(r.ok).toBe(true);
    const codes = (r as { recoveryCodes: string[] }).recoveryCodes;
    expect(codes).toHaveLength(10);
    expect((await verifySecondFactor(admin.id, totp((s as { secret: string }).secret))).ok).toBe(false); // same step = replay
    expect((await verifySecondFactor(admin.id, codes[0])).ok).toBe(true);
    expect((await verifySecondFactor(admin.id, codes[0])).ok).toBe(false);
  });
  it('seeded first admin must change password', async () => {
    const admin = await db().user.findUniqueOrThrow({ where: { email: 'admin@test.example' } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.mustChangePassword).toBe(true);
  });
});

describe('tenant isolation (spec §5.3, cross-tenant tests)', () => {
  it('scoped() cannot read, update or delete another workspace’s rows', async () => {
    const a = await makeCustomer('tena');
    const b = await makeCustomer('tenb');
    const ticket = await db().supportTicket.create({ data: { workspaceId: b.ws.id, subject: 'B private', createdById: b.user.id } });
    const asA = scoped(a.ws.id);
    expect(await asA.supportTicket.findMany({})).toHaveLength(0);
    expect(await asA.supportTicket.findUnique({ where: { id: ticket.id } })).toBeNull();
    await expect(asA.supportTicket.update({ where: { id: ticket.id }, data: { subject: 'pwned' } })).rejects.toThrow(/TENANT_VIOLATION/);
    await expect(asA.supportTicket.delete({ where: { id: ticket.id } })).rejects.toThrow(/TENANT_VIOLATION/);
    expect((await asA.supportTicket.updateMany({ where: { id: ticket.id }, data: { subject: 'pwned' } })).count).toBe(0);
    expect((await db().supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).subject).toBe('B private');
    const created = await asA.supportTicket.create({ data: { workspaceId: b.ws.id, subject: 'mine', createdById: a.user.id } as never });
    expect(created.workspaceId).toBe(a.ws.id); // forced to own workspace
  });
  it('audit log is append-only at the database level', async () => {
    const row = await db().auditLog.create({ data: { action: 'test.append' } });
    await expect(db().auditLog.update({ where: { id: row.id }, data: { action: 'x' } })).rejects.toThrow();
    await expect(db().auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});

describe('permission matrix (spec §6 roles)', () => {
  it('seeded grants match the matrix for every role and permission', async () => {
    const rows = await db().rolePermission.findMany();
    for (const role of ['ADMIN', 'PM', 'MANAGER', 'CUSTOMER', 'AFFILIATE'] as const) {
      const granted = new Set(rows.filter((r) => r.roleName === role).map((r) => r.permissionKey));
      for (const key of Object.keys(PERMISSIONS)) expect(granted.has(key)).toBe(defaultGrants(role).includes(key));
    }
  });
  it('key rules: managers never see company finance; PM sees revenue by product only; customers get no staff permission; e-book sources staff-only', () => {
    expect(defaultGrants('MANAGER')).not.toContain('finance.view');
    expect(defaultGrants('PM')).not.toContain('finance.view');
    expect(defaultGrants('PM')).toContain('finance.revenue_by_product');
    expect(defaultGrants('CUSTOMER')).toEqual(['workspace.own']);
    for (const r of ['ADMIN', 'PM', 'MANAGER'] as const) expect(defaultGrants(r)).toContain('ebooks.source');
    expect(defaultGrants('CUSTOMER')).not.toContain('ebooks.source');
  });
});
