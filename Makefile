.PHONY: start image up down logs typecheck fmt fmt-check

NETWORK ?= devnet

IMAGE ?= 0th-server
PORT ?= 8787

-include .env.$(NETWORK)
-include deployments/$(NETWORK).env
export

# Network targets: make <target> NETWORK=<devnet|sepolia|mainnet>, devnet by default

start:
	pnpm start

image:
	docker build -t $(IMAGE) .

# /relay fails on devnet: the container cannot reach the devnet RPC on localhost
up: image
	docker rm -f server-$(NETWORK) 2>/dev/null || true
	docker run -d --name server-$(NETWORK) --restart unless-stopped -p $(PORT):$(PORT) \
		-e RPC_URL -e PORT -e DEVNET -e SEED -e GOOGLE_CLIENT_ID -e RELAYER_ACCOUNT -e RELAYER_PRIVATE_KEY \
		-e REGISTRY -e VERIFIER -e ACCOUNT_CLASS_HASH $(IMAGE)

down:
	docker rm -f server-$(NETWORK)

logs:
	docker logs -f server-$(NETWORK)

typecheck:
	pnpm run typecheck

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
