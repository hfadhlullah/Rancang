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

# Deploy Convex functions
CONVEX_URL=http://localhost:3230 \
CONVEX_ADMIN_KEY="rancang-convex|fee0248182c2b5a934dc17acab4c7637c3ce459f3fd683c40c7c8976025ff42a" \
  node node_modules/.bin/convex dev \
    --url http://localhost:3230 \
    --admin-key "rancang-convex|fee0248182c2b5a934dc17acab4c7637c3ce459f3fd683c40c7c8976025ff42a"
