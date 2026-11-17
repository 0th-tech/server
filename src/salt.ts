import { hkdfSync } from "node:crypto";
import { type JWTVerifyGetKey, exportJWK, jwtVerify } from "jose";

const GOOGLE_ISS = "https://accounts.google.com";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Checks the provider's signature on the letter and returns the user's sub and the signing key
export async function readLetter(
  keys: JWTVerifyGetKey,
  clientId: string,
  jwt: string,
  expiredFor = 0,
) {
  const { payload, key } = await jwtVerify(jwt, keys, {
    issuer: GOOGLE_ISS,
    audience: clientId,
    clockTolerance: expiredFor,
  });
  if (typeof payload.sub !== "string") throw new Error("letter has no sub");
  return { sub: payload.sub, providerKey: await exportJWK(key) };
}

export function saltFrom(seed: string, clientId: string, sub: string) {
  // The same seed gives a different salt for each dapp and each login provider
  const salt = hkdfSync("sha256", seed, `${GOOGLE_ISS}|${clientId}`, sub, 31);
  return BigInt(`0x${Buffer.from(salt).toString("hex")}`);
}
