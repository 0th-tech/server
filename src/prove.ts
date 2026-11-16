import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import { getZKHonkCallData, init as initGaraga } from "garaga";
import type { JWK } from "jose";

// noir-jwt 0.4.5's ESM build breaks in Node (extensionless imports), so load its CommonJS build
const { generateInputs } = createRequire(import.meta.url)(
  "noir-jwt",
) as typeof import("noir-jwt");

const run = promisify(execFile);

// Same bound as MAX_DATA_LENGTH in the login circuit. A Google letter is about 658 bytes
const MAX_DATA_LENGTH = 768;

// Index of identity_hash among the circuit's public inputs
const IDENTITY_INPUT = 20;

// A directory holding login.json and vk, the compiled circuit and the verification key the
// on-chain verifier was generated from
export type Circuit = {
  dir: string;
  program: CompiledCircuit;
  verificationKey: Uint8Array;
};

export async function loadCircuit(dir: string): Promise<Circuit> {
  const [program, verificationKey] = await Promise.all([
    readFile(join(dir, "login.json"), "utf8"),
    readFile(join(dir, "vk")),
    initGaraga(),
  ]);
  return {
    dir,
    program: JSON.parse(program) as CompiledCircuit,
    verificationKey: new Uint8Array(verificationKey),
  };
}

// Circuit inputs that are not derived from the letter
type SessionInputs = {
  publicKey: string;
  expiry: string;
  secret: string;
  salt: bigint;
};

// Garaga's calldata is span_len, count, (low, high) * count, so each input spans two felts
function publicInput(calldata: bigint[], i: number) {
  const count = calldata[1] ?? 0n;
  if (i >= count)
    throw new Error(`the proof has ${count} public inputs, not ${i + 1}`);
  return (calldata[3 + 2 * i]! << 128n) | calldata[2 + 2 * i]!;
}

// The calldata register_session takes, and the identity the proof is for
export async function prove(
  circuit: Circuit,
  letter: { jwt: string; providerKey: JWK },
  inputs: SessionInputs,
) {
  const letterInputs = await generateInputs({
    jwt: letter.jwt,
    pubkey: letter.providerKey,
    maxSignedDataLength: MAX_DATA_LENGTH,
  });
  // Fails here when the letter's nonce does not commit to this session key, expiry and secret
  const { witness } = await new Noir(circuit.program).execute({
    ...letterInputs,
    session_pubkey: inputs.publicKey,
    expiry: inputs.expiry,
    secret: inputs.secret,
    salt: String(inputs.salt),
  });

  const out = await mkdtemp(join(tmpdir(), "prove-"));
  try {
    await writeFile(join(out, "witness.gz"), witness);
    // The proof system the deployed verifier was generated for. bb uses every core for one proof
    await run("bb", [
      "prove",
      ...["-s", "ultra_honk", "--oracle_hash", "keccak"],
      ...["-b", join(circuit.dir, "login.json")],
      ...["-k", join(circuit.dir, "vk")],
      ...["-w", join(out, "witness.gz")],
      ...["-o", out],
    ]);
    const [proof, publicInputs] = await Promise.all([
      readFile(join(out, "proof")),
      readFile(join(out, "public_inputs")),
    ]);
    const calldata = getZKHonkCallData(
      new Uint8Array(proof),
      new Uint8Array(publicInputs),
      circuit.verificationKey,
    );
    return {
      proof: calldata.map(String),
      identity: String(publicInput(calldata, IDENTITY_INPUT)),
    };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
