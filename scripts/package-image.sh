#!/usr/bin/env bash
set -euo pipefail
# Run after npm ci, prisma generate and npm run build. Do not install concurrently.
test -f node_modules/prisma/build/index.js
test -f .next/standalone/server.js
node scripts/sanitize-build.mjs
# Exclude build-only native compilers and tests; traced @next/env stays in standalone.
tar --exclude='.env' --exclude='.env.*' --exclude='public/uploads/*' \
  --exclude='node_modules/@next/swc-*' --exclude='node_modules/typescript' \
  --exclude='node_modules/@tailwindcss' --exclude='node_modules/tailwindcss' \
  --exclude='node_modules/lightningcss*' --exclude='node_modules/@playwright' \
  --exclude='node_modules/playwright*' \
  --transform='s|^\.next/standalone/||' --transform='s|^\.next/standalone$|.|' \
  -cf - Dockerfile.prebuilt .next/standalone .next/static public prisma scripts lib node_modules package.json \
  | docker build -f Dockerfile.prebuilt -t phishing-quiz:local -
