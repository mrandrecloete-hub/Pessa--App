import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const derive = (pw: string, salt: Buffer, n = N, r = R, p = P) => new Promise<Buffer>((res, rej) =>
  scrypt(pw.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16); const k = await derive(pw, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${k.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, s, h] = stored.split('$'); if (alg !== 'scrypt') return false;
  const expected = Buffer.from(h, 'base64'); const got = await derive(pw, Buffer.from(s, 'base64'), +n, +r, +p);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
/** Password policy: 10+ characters, not a single repeated character, not the email. */
export function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 128) return 'Password must be at most 128 characters.';
  if (/^(.)\1+$/.test(pw)) return 'Password cannot be one repeated character.';
  if (pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'Password cannot contain your email name.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password needs at least one letter and one number.';
  return null;
}
