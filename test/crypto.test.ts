import { describe, expect, it } from "vitest";
import {
  bytesToBase64Url,
  decryptJson,
  encryptJson,
  generateProxyApiKey,
  hashApiKey,
  verifyApiKeyHash
} from "../src/crypto";

const secret = bytesToBase64Url(new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1)));

describe("crypto helpers", () => {
  it("hashes proxy keys with a pepper and verifies hashes", async () => {
    const apiKey = generateProxyApiKey();
    const hash = await hashApiKey(apiKey, "test-pepper");

    expect(apiKey).toMatch(/^cpk_/u);
    expect(hash).not.toContain(apiKey);
    await expect(verifyApiKeyHash(apiKey, hash, "test-pepper")).resolves.toBe(true);
    await expect(verifyApiKeyHash(`${apiKey}x`, hash, "test-pepper")).resolves.toBe(false);
  });

  it("encrypts and decrypts token bundles with AES-GCM", async () => {
    const encrypted = await encryptJson({ access_token: "access", refresh_token: "refresh" }, secret);

    expect(encrypted).not.toContain("access");
    await expect(decryptJson(encrypted, secret)).resolves.toEqual({
      access_token: "access",
      refresh_token: "refresh"
    });
  });
});
