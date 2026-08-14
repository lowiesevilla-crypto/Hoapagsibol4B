#!/usr/bin/env bash

# Hostinger Web/Cloud hosting exposes supported Node.js runtimes under /opt/alt,
# but non-interactive SSH sessions do not automatically add the selected runtime
# to PATH. Keep deployment/backup jobs aligned with the production Node 22 runtime.
HOSTINGER_NODE_BIN="${HOSTINGER_NODE_BIN:-/opt/alt/alt-nodejs22/root/usr/bin}"

if [ -d "$HOSTINGER_NODE_BIN" ]; then
  export PATH="$HOSTINGER_NODE_BIN:$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Hostinger Node.js runtime is unavailable. Expected Node 22 under $HOSTINGER_NODE_BIN." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "Unsupported production Node.js runtime: $(node --version). HOAHub Hostinger production requires Node 22.x." >&2
  exit 1
fi

export HOSTINGER_NODE_BIN
echo "Hostinger runtime initialized: $(node --version)"
