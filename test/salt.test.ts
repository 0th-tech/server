import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { readLetter, saltFrom } from "../src/salt.ts";

const ISS = "https://accounts.google.com";
const CLIENT_ID = "dapp.apps.googleusercontent.com";
const SUB = "123456789012345678901";
const HOUR = 3600;

const provider = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const keys = createLocalJWKSet({
  keys: [await exportJWK(provider.publicKey)],
});

// A letter as the provider signs it, valid for an hour unless a claim is replaced
const letter = ({
  key = provider.privateKey,
  expiresIn = HOUR,
  ...claims
}: {
  key?: CryptoKey;
  expiresIn?: number;
  iss?: string;
  aud?: string;
  sub?: string | undefined;
} = {}) =>
  new SignJWT({ iss: ISS, aud: CLIENT_ID, sub: SUB, ...claims })
    .setProtectedHeader({ alg: "RS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(key);

test("saltFrom gives each seed, dapp and user its own salt", () => {
  const salt = saltFrom("seed", CLIENT_ID, SUB);

  // A change of this value moves every account to another address
  assert.equal(
    salt,
    0x7eb4794db50e73799109ae0b71fc53b62559fd5c6e695568d2f748ac189f8an,
  );
  assert.notEqual(saltFrom("other seed", CLIENT_ID, SUB), salt);
  assert.notEqual(saltFrom("seed", "other dapp", SUB), salt);
  assert.notEqual(saltFrom("seed", CLIENT_ID, "other user"), salt);
});

test("readLetter returns the sub and the key of a letter the provider signed", async () => {
  const { sub, providerKey } = await readLetter(
    keys,
    CLIENT_ID,
    await letter(),
  );

  assert.equal(sub, SUB);
  assert.deepEqual(providerKey, await exportJWK(provider.publicKey));
});

const refused = [
  [
    "signed by another key",
    { key: stranger.privateKey },
    { code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" },
  ],
  ["for another dapp", { aud: "other dapp" }, { claim: "aud" }],
  ["from another provider", { iss: "https://example.com" }, { claim: "iss" }],
  ["that has expired", { expiresIn: -HOUR }, { code: "ERR_JWT_EXPIRED" }],
  ["with no sub", { sub: undefined }, { message: "letter has no sub" }],
] as const;

for (const [name, change, error] of refused)
  test(`readLetter refuses a letter ${name}`, async () => {
    const jwt = await letter(change);

    await assert.rejects(readLetter(keys, CLIENT_ID, jwt), error);
  });

test("readLetter accepts an expired letter for expiredFor seconds", async () => {
  const jwt = await letter({ expiresIn: -2 * HOUR });

  await assert.rejects(readLetter(keys, CLIENT_ID, jwt, HOUR), {
    code: "ERR_JWT_EXPIRED",
  });
  await readLetter(keys, CLIENT_ID, jwt, 3 * HOUR);
});
