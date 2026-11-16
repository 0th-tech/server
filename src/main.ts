import { Account, RpcProvider, logger } from "starknet";
import { loadCircuit, prove } from "./prove.ts";
import { isFelts, isIdentity, relay } from "./relay.ts";
import { readLetter, saltFrom } from "./salt.ts";
import { need, serve } from "./serve.ts";

logger.setLogLevel("ERROR");

const rpcUrl = need("RPC_URL");
const seed = need("SEED");
const clientId = need("GOOGLE_CLIENT_ID");
const circuit = await loadCircuit(need("CIRCUIT_DIR"));

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
      const { sub } = await readLetter(clientId, jwt);
      return { salt: String(saltFrom(seed, clientId, sub)) };
    },
    "/prove": async ({ jwt, publicKey, expiry, secret }) => {
      if (typeof jwt !== "string") throw new Error("jwt must be a string");
      const session = [publicKey, expiry, secret];
      if (!isFelts(session))
        throw new Error("publicKey, expiry and secret must be felts");
      const { sub, providerKey } = await readLetter(clientId, jwt);
      return prove(
        circuit,
        { jwt, providerKey },
        {
          publicKey: session[0]!,
          expiry: session[1]!,
          secret: session[2]!,
          salt: saltFrom(seed, clientId, sub),
        },
      );
    },
  },
  Number(process.env.PORT ?? 8787),
);
