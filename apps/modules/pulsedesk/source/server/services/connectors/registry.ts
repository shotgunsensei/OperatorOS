import type { ConnectorService, ConnectorProvider } from "./types";

const services = new Map<ConnectorProvider, ConnectorService>();

export function registerConnectorService(service: ConnectorService): void {
  services.set(service.provider, service);
}

export function getConnectorService(provider: ConnectorProvider): ConnectorService {
  const service = services.get(provider);
  if (!service) {
    throw new Error(`No connector service registered for provider: ${provider}`);
  }
  return service;
}

export function getAllConnectorServices(): ConnectorService[] {
  return Array.from(services.values());
}

export function hasConnectorService(provider: ConnectorProvider): boolean {
  return services.has(provider);
}
