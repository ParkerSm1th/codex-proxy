import { PROXY_KEY_PREFIX } from "./constants";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function generateProxyApiKey(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return `${PROXY_KEY_PREFIX}${bytesToBase64Url(random)}`;
}

export async function hashApiKey(apiKey: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(apiKey));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyApiKeyHash(apiKey: string, expectedHash: string, pepper: string): Promise<boolean> {
  const actualHash = await hashApiKey(apiKey, pepper);
  return constantTimeEqual(base64UrlToBytes(actualHash), base64UrlToBytes(expectedHash));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const raw = decodeSecretKey(secret);
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function decodeSecretKey(secret: string): Uint8Array {
  if (/^[0-9a-f]{64}$/iu.test(secret)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(secret.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  return base64UrlToBytes(secret);
}

export async function encryptJson(value: unknown, secret: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const plaintext = textEncoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptJson<T>(encrypted: string, secret: string): Promise<T> {
  const [encodedIv, encodedCiphertext] = encrypted.split(".");
  if (!encodedIv || !encodedCiphertext) {
    throw new Error("Encrypted value must be formatted as iv.ciphertext");
  }

  const key = await importAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(encodedIv)) },
    key,
    toArrayBuffer(base64UrlToBytes(encodedCiphertext))
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
