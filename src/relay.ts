import {
  Account,
  type Call,
  CallData,
  RpcError,
  addAddressPadding,
  cairo,
  constants,
  defaultDeployer,
  hash,
} from "starknet";

const isInteger = (x: unknown): x is string =>
  typeof x === "string" && /^(0x[0-9a-f]+|\d+)$/i.test(x);

export const isFelts = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((x) => isInteger(x) && BigInt(x) < constants.PRIME);

// The identity hash is a BN254 field element, so no proof can carry a larger one
const BN254_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const isIdentity = (value: unknown): value is string =>
  isInteger(value) && BigInt(value) < BN254_ORDER;

// New accounts are funded here to cover deployment fees. Devnet only
const devnetMint = (nodeUrl: string, address: string) =>
  fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "devnet_mint",
      params: { address, amount: 2000000000000000000, unit: "FRI" },
    }),
  });

type RelayConfig = {
  relayer: Account;
  registry: string;
  verifier: string;
  accountClassHash: string;
  nodeUrl: string;
  devnet: boolean;
};

// Salt 0 and the deployer out of the hash, so the same login always lands on the same account
const udcAddress = (accountClassHash: string, constructorCalldata: string[]) =>
  addAddressPadding(
    hash.calculateContractAddressFromHash(
      0,
      accountClassHash,
      constructorCalldata,
      0,
    ),
  );

// Every login registers a session key, only the first one deploys
export async function relay(
  {
    relayer,
    registry,
    verifier,
    accountClassHash,
    nodeUrl,
    devnet,
  }: RelayConfig,
  identity: string,
  proof: string[],
) {
  // The account trusts the server's own registry and verifier, so a caller cannot make the relayer
  // deploy an account that accepts any proof
  const constructorCalldata = CallData.compile([
    registry,
    verifier,
    cairo.uint256(identity),
  ]);
  const address = udcAddress(accountClassHash, constructorCalldata);
  // A node error other than CONTRACT_NOT_FOUND is thrown: deploying an existing account reverts
  const deployed = await relayer.provider.getClassHashAt(address).catch((e) => {
    if (e instanceof RpcError && e.isType("CONTRACT_NOT_FOUND"))
      return undefined;
    throw e;
  });

  const calls: Call[] = [];
  if (!deployed) {
    if (devnet) await devnetMint(nodeUrl, address);
    calls.push(
      ...defaultDeployer.buildDeployerCall(
        {
          classHash: accountClassHash,
          salt: "0x0",
          unique: false,
          constructorCalldata,
        },
        relayer.address,
      ).calls,
    );
  }
  calls.push({
    contractAddress: address,
    entrypoint: "register_session",
    calldata: proof,
  });

  const { transaction_hash } = await relayer.execute(calls);
  await relayer.provider.waitForTransaction(transaction_hash);
  return address;
}
