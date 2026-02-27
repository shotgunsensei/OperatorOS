#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-veridian}"
REGISTRY_NAME="${REGISTRY_NAME:-veridian-registry}"
REGISTRY_PORT="${REGISTRY_PORT:-5111}"

echo "==> Creating k3d cluster: ${CLUSTER_NAME}"

if k3d cluster list | grep -q "${CLUSTER_NAME}"; then
  echo "Cluster '${CLUSTER_NAME}' already exists. Delete with: k3d cluster delete ${CLUSTER_NAME}"
  exit 0
fi

if ! k3d registry list | grep -q "${REGISTRY_NAME}"; then
  echo "==> Creating local registry: ${REGISTRY_NAME}:${REGISTRY_PORT}"
  k3d registry create "${REGISTRY_NAME}" --port "${REGISTRY_PORT}"
fi

k3d cluster create "${CLUSTER_NAME}" \
  --servers 1 \
  --agents 1 \
  --registry-use "k3d-${REGISTRY_NAME}:${REGISTRY_PORT}" \
  --port "4000:80@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0" \
  --wait

echo "==> Cluster '${CLUSTER_NAME}' created successfully"
echo ""
echo "Next steps:"
echo "  kubectl apply -f infra/k8s/base/namespace.yaml"
echo "  kubectl apply -f infra/k8s/base/rbac.yaml"
echo "  kubectl apply -f infra/k8s/base/storage.yaml"
echo ""
echo "Registry available at: k3d-${REGISTRY_NAME}:${REGISTRY_PORT}"
echo "  Tag and push images:  docker tag myimg k3d-${REGISTRY_NAME}:${REGISTRY_PORT}/myimg"
echo "                        docker push k3d-${REGISTRY_NAME}:${REGISTRY_PORT}/myimg"
