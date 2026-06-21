import { constantTimeEqual } from "../crypto";

export const MIN_PASSWORD_LENGTH = 8;
const ITERATIONS = 100_000;
const DUMMY_SALT = "00000000000000000000000000000000";
const DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export function validatePasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const passwordSalt = salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(passwordSalt),
      iterations: ITERATIONS
    },
    key,
    256
  );

  return { hash: bytesToHex(new Uint8Array(bits)), salt: passwordSalt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const compareSalt = salt.length > 0 ? salt : DUMMY_SALT;
  const compareHash = hash.length > 0 ? hash : DUMMY_HASH;
  const next = await hashPassword(password, compareSalt);
  return timingSafeEqual(next.hash, compareHash);
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) ?? 0) ^ (right.charCodeAt(index) ?? 0);
  }

  return diff === 0;
}
