import assert from "node:assert/strict";
import { test } from "node:test";
import { type Account, type Call, RpcError, constants } from "starknet";
import { isFelts, isIdentity, relay } from "../src/relay.ts";

const REGISTRY = "0x1";
const VERIFIER = "0x2";
const ACCOUNT_CLASS_HASH = "0x3";
const IDENTITY = "5";
const PROOF = ["7", "8"];

// A relayer that records the calls it is asked to send, on a chain where the account exists or not
function relayer(getClassHashAt: () => Promise<string>) {
  const sent: Call[][] = [];
  const account = {
    address: "0x9",
    provider: { getClassHashAt, waitForTransaction: async () => {} },
    execute: async (calls: Call[]) => {
      sent.push(calls);
      return { transaction_hash: "0x0" };
    },
  } as unknown as Account;
  const config = {
    relayer: account,
    registry: REGISTRY,
    verifier: VERIFIER,
    accountClassHash: ACCOUNT_CLASS_HASH,
    nodeUrl: "",
    devnet: false,
  };
  return { config, sent };
}

const deployed = async () => ACCOUNT_CLASS_HASH;
const notDeployed = async () => {
  throw new RpcError(
    { code: 20, message: "Contract not found" },
    "starknet_getClassHashAt",
    [],
  );
};

test("isFelts takes integers below the Stark prime", () => {
  assert.ok(isFelts(["0", "12", "0x1f", String(constants.PRIME - 1n)]));

  for (const value of ["hello", "0x", "-1", "1.5", "", String(constants.PRIME)])
    assert.ok(!isFelts([value]), `"${value}" is taken`);
  assert.ok(!isFelts([5]));
  assert.ok(!isFelts("5"));
});

test("isIdentity takes an integer below the BN254 order", () => {
  const order =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  assert.ok(isIdentity(String(order - 1n)));
  assert.ok(!isIdentity(String(order)));
  assert.ok(!isIdentity("hello"));
  assert.ok(!isIdentity(5));
});

test("relay deploys a new account, then registers the session key", async () => {
  const { config, sent } = relayer(notDeployed);

  const address = await relay(config, IDENTITY, PROOF);

  // A change of this value moves every account to another address
  assert.equal(
    address,
    "0x04d5411beda5b726c154579638df1d3d42e96eff2cf2dd09d0a94b4565450a57",
  );
  assert.equal(sent.length, 1);
  const [deploy, register] = sent[0]!;
  // Class hash, salt, unique, then the constructor: 4 felts, the identity as a u256
  assert.deepEqual((deploy!.calldata as string[]).map(BigInt), [
    BigInt(ACCOUNT_CLASS_HASH),
    0n,
    0n,
    4n,
    BigInt(REGISTRY),
    BigInt(VERIFIER),
    BigInt(IDENTITY),
    0n,
  ]);
  assert.deepEqual(register, {
    contractAddress: address,
    entrypoint: "register_session",
    calldata: PROOF,
  });
});

test("relay only registers the session key on a deployed account", async () => {
  const { config, sent } = relayer(deployed);

  const address = await relay(config, IDENTITY, PROOF);

  assert.deepEqual(sent, [
    [
      {
        contractAddress: address,
        entrypoint: "register_session",
        calldata: PROOF,
      },
    ],
  ]);
});

test("relay sends nothing when the node cannot tell whether the account exists", async () => {
  const { config, sent } = relayer(async () => {
    throw new Error("node unreachable");
  });

  await assert.rejects(relay(config, IDENTITY, PROOF), {
    message: "node unreachable",
  });
  assert.deepEqual(sent, []);
});
