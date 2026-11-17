.PHONY: start image up down logs test typecheck fmt fmt-check

NETWORK ?= devnet

# A download that fails leaves no partial file behind
.DELETE_ON_ERROR:

IMAGE ?= 0th-server
PORT ?= 8787

CIRCUIT_VERSION ?= v0.1.0
CIRCUIT_RELEASE = https://github.com/0th-tech/circuit/releases/download/$(CIRCUIT_VERSION)
CIRCUIT_DIR ?= target/circuit

-include .env.$(NETWORK)
-include deployments/$(NETWORK).env
export

# A file from the circuit's release, downloaded again whenever this Makefile changes, since it pins the version.
# The image holds its own copy
target/circuit/%: Makefile
	mkdir -p $(@D)
	curl -fsSL $(CIRCUIT_RELEASE)/$* -o $@

# Network targets: make <target> NETWORK=<devnet|sepolia|mainnet>, devnet by default

# /prove calls bb, which the image holds and a host may lack
start: $(CIRCUIT_DIR)/login.json $(CIRCUIT_DIR)/vk
	pnpm start

image:
	docker build -t $(IMAGE) .

# /relay fails on devnet: the container cannot reach the devnet RPC on localhost
up: image
	docker rm -f server-$(NETWORK) 2>/dev/null || true
	docker run -d --name server-$(NETWORK) --restart unless-stopped -p $(PORT):$(PORT) \
		-e RPC_URL -e PORT -e DEVNET -e SEED -e GOOGLE_CLIENT_ID -e JWKS_URL -e RELAYER_ACCOUNT -e RELAYER_PRIVATE_KEY \
		-e REGISTRY -e VERIFIER -e ACCOUNT_CLASS_HASH $(IMAGE)

down:
	docker rm -f server-$(NETWORK)

logs:
	docker logs -f server-$(NETWORK)

test:
	pnpm test

typecheck:
	pnpm run typecheck

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
