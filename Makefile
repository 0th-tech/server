.PHONY: start typecheck fmt fmt-check

NETWORK ?= devnet

-include .env.$(NETWORK)
-include deployments/$(NETWORK).env
export

# Network targets: make <target> NETWORK=<devnet|sepolia|mainnet>, devnet by default

start:
	pnpm start

typecheck:
	pnpm run typecheck

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
