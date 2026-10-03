import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { randomBytes } from 'node:crypto';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} baseURL
 * @param {{secret?: string, production?: boolean}} [configuration]
 */
export async function createAuth(db, baseURL, { secret = process.env.BETTER_AUTH_SECRET, production = process.env.NODE_ENV === 'production' } = {}) {
  if (production && (!secret || secret.length < 32 || !baseURL.startsWith('https://'))) {
    throw new Error('Production requires HTTPS and BETTER_AUTH_SECRET (32+ characters)');
  }
  if (secret && secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  // A process-only local development secret is never written or printed. Restart
  // invalidates dev sessions; persisted accounts and sports records remain intact.
  /** @type {import('better-auth').BetterAuthOptions} */
  const options = {
    database: db, baseURL, secret: secret || randomBytes(48).toString('base64url'),
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, requireEmailVerification: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 } } },
    advanced: { useSecureCookies: production, ipAddress: { ipAddressHeaders: ['x-dwnc-client-ip'] } },
  };
  const migrations = await getMigrations(options);
  await migrations.runMigrations();
  const auth = betterAuth(options);
  const context = await auth.$context;
  await context.checkSchema?.();
  return auth;
}
