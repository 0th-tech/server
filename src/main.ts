import { Account, RpcProvider, logger } from "starknet";
import { isFelts, isIdentity, relay } from "./relay.ts";
import { saltFor } from "./salt.ts";
import { need, serve } from "./serve.ts";

logger.setLogLevel("ERROR");

const rpcUrl = need("RPC_URL");
const seed = need("SEED");
const clientId = need("GOOGLE_CLIENT_ID");

const relayConfig = {
  relayer: new Account({
    provider: new RpcProvider({ nodeUrl: rpcUrl }),
    address: need("RELAYER_ACCOUNT"),
    signer: need("RELAYER_PRIVATE_KEY"),
  }),
  registry: need("REGISTRY"),
  verifier: need("VERIFIER"),
  accountClassHash: need("ACCOUNT_CLASS_HASH"),
  nodeUrl: rpcUrl,
  devnet: Boolean(process.env.DEVNET),
};

serve(
  {
    "/relay": async ({ identity, proof }) => {
      if (!isIdentity(identity))
        throw new Error("identity must be a BN254 field element");
      if (!isFelts(proof)) throw new Error("proof must be an array of felts");
      return { address: await relay(relayConfig, identity, proof) };
    },
    "/salt": async ({ jwt }) => {
      if (typeof jwt !== "string") throw new Error("jwt must be a string");
      return { salt: String(await saltFor(seed, clientId, jwt)) };
    },
  },
  Number(process.env.PORT ?? 8787),
);
