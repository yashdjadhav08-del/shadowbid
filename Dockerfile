# ============================================================================
# ShadowBid — build stage
#
# Pinned Midnight toolchain (per docs.midnight.network support matrix):
#   compact toolchain manager 0.5.2 + compiler (compactc) 0.31.1
#   -> pairs with @midnight-ntwrk/compact-runtime 0.16.0
#
# Steps: compile the contract, run the test suite, build the React frontend,
# and bundle the compiled ZK artifacts for HTTP serving.
# ============================================================================
FROM node:22-bookworm-slim AS build

ARG TARGETPLATFORM
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils unzip \
    && rm -rf /var/lib/apt/lists/*

# --- Install pinned Compact toolchain ---------------------------------------
# Map Docker TARGETPLATFORM to the release artifact architecture.
RUN set -eux; \
    case "$TARGETPLATFORM" in \
      linux/arm64) ARCH=aarch64 ;; \
      *)           ARCH=x86_64 ;; \
    esac; \
    MANAGER_URL="https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-${ARCH}-unknown-linux-musl.tar.xz"; \
    COMPILER_URL="https://github.com/midnightntwrk/compact/releases/download/compactc-v0.31.1/compactc_v0.31.1_${ARCH}-unknown-linux-musl.zip"; \
    curl --proto '=https' --tlsv1.2 -fsSL "$MANAGER_URL" -o /tmp/cmgr.tar.xz; \
    mkdir -p /tmp/cmgr && tar xJf /tmp/cmgr.tar.xz -C /tmp/cmgr; \
    install -m 0755 "/tmp/cmgr/compact-${ARCH}-unknown-linux-musl/compact" /usr/local/bin/compact; \
    VERS_DIR="/root/.compact/versions/0.31.1/${ARCH}-unknown-linux-musl"; \
    mkdir -p "$VERS_DIR" /root/.compact/bin; \
    curl --proto '=https' --tlsv1.2 -fsSL "$COMPILER_URL" -o /tmp/cc.zip; \
    unzip -q -o /tmp/cc.zip -d "$VERS_DIR"; \
    ln -sf "$VERS_DIR/compactc" /root/.compact/bin/compactc; \
    ln -sf "$VERS_DIR/fixup-compact" /root/.compact/bin/fixup-compact; \
    ln -sf "$VERS_DIR/format-compact" /root/.compact/bin/format-compact; \
    compact --version && compact compile --version

WORKDIR /app

# --- Node dependencies ---
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# --- Contract sources & project files ---
COPY contracts ./contracts
COPY scripts ./scripts
COPY tests ./tests
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src

# --- Compile the Compact contract (prover/verifier keys + ZKIR) ---
# Produces managed/shadowbid/{contract,keys,zkir}
RUN compact compile contracts/shadowbid.compact managed/shadowbid

# --- Sync ZK artifacts into public/, run the test suite, build the frontend ---
RUN npm run sync-assets && npm test && npm run build

# ============================================================================
# Serve stage — static hosting for the dApp and its ZK artifacts
# ============================================================================
FROM nginx:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
