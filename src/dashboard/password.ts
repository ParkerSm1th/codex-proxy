const ITERATIONS = 100_000;

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
  const next = await hashPassword(password, salt);
  return timingSafeEqual(next.hash, hash);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}
