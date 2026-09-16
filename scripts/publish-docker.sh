#!/bin/sh
set -eu

version="${1:?A semantic version is required}"
image="${DOCKER_IMAGE:?DOCKER_IMAGE is required}"
major="${version%%.*}"
minor="${version%.*}"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg "VERSION=${version}" \
  --build-arg "REVISION=${GITHUB_SHA:-unknown}" \
  --build-arg "SOURCE_URL=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-jeremygovi/planning-poker}" \
  --tag "${image}:${version}" \
  --tag "${image}:${minor}" \
  --tag "${image}:${major}" \
  --tag "${image}:latest" \
  --push \
  .
