#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-operatoros}"

echo "Destroying k3d cluster: ${CLUSTER_NAME}"
k3d cluster delete "${CLUSTER_NAME}" 2>/dev/null || true
echo "Cluster ${CLUSTER_NAME} destroyed."
