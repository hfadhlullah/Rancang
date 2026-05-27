#!/usr/bin/env bash
set -e

# Start Rancang self-hosted Convex backend
docker compose up -d

echo "Waiting for Convex backend..."
until curl -s http://localhost:3230/version > /dev/null 2>&1; do
  sleep 1
done
echo "Convex ready at http://localhost:3230"
echo "Dashboard at http://localhost:6793"

# Generate a fresh admin key from the backend
ADMIN_KEY=$(docker compose exec -T convex ./generate_admin_key.sh | grep -v "Admin key:" | tr -d '[:space:]')
echo "Admin key: $ADMIN_KEY"

# Deploy Convex functions using self-hosted env vars
CONVEX_SELF_HOSTED_URL=http://localhost:3230 \
CONVEX_SELF_HOSTED_ADMIN_KEY="$ADMIN_KEY" \
  bunx convex dev \
    --url http://localhost:3230 \
    --admin-key "$ADMIN_KEY"
