import argon2 from 'argon2';

/** argon2id with library defaults (SPEC §12, ADR-0004). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When there is no hash (unknown email or placeholder user) it still runs a
 * verification against a dummy hash, so response time doesn't reveal whether the account exists.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
}
