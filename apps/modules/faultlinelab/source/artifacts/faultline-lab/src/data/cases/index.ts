import { windowsAdCase } from './windows-ad-case';
import { networkingVpnCase } from './networking-vpn-case';
import { automotiveCase } from './automotive-case';
import { electronicsSensorCase } from './electronics-sensor-case';
import { networkOpsCases } from './packs/network-ops';
import { serverGraveyardCases } from './packs/server-graveyard';
import { garageDiagnosticsCases } from './packs/garage-diagnostics';
import { sensorMeshCases } from './packs/sensor-mesh';
import { mixedCascadesCases } from './packs/mixed-cascades';
import { healthcareImagingCases } from './packs/healthcare-imaging';
import type { CaseDefinition } from '@/types';

export const CASE_DEFINITIONS = {
  windowsAdCase,
  networkingVpnCase,
  automotiveCase,
  electronicsSensorCase,
} as const satisfies Record<string, CaseDefinition>;

export type CaseImplementationKey = keyof typeof CASE_DEFINITIONS;

export const allCases: CaseDefinition[] = [
  ...Object.values(CASE_DEFINITIONS),
  ...networkOpsCases,
  ...serverGraveyardCases,
  ...garageDiagnosticsCases,
  ...sensorMeshCases,
  ...mixedCascadesCases,
  ...healthcareImagingCases,
];

export function getCaseByImplementationKey(key: CaseImplementationKey): CaseDefinition {
  return CASE_DEFINITIONS[key];
}

export function getCaseById(id: string): CaseDefinition | undefined {
  return allCases.find(c => c.id === id);
}

export function getCasesByCategory(category: string): CaseDefinition[] {
  return allCases.filter(c => c.category === category);
}

export const categoryLabels: Record<string, string> = {
  'windows-ad': 'Windows / Active Directory',
  'networking': 'Networking / VPN',
  'automotive': 'Automotive Diagnostics',
  'electronics': 'Electronics / Sensor Mesh',
  'servers': 'Servers / Services',
  'mixed': 'Mixed Systems',
};

export const difficultyColors: Record<string, string> = {
  beginner: 'text-green-400',
  intermediate: 'text-yellow-400',
  advanced: 'text-orange-400',
  expert: 'text-red-400',
};

export const categoryIcons: Record<string, string> = {
  'windows-ad': 'Monitor',
  'networking': 'Network',
  'automotive': 'Car',
  'electronics': 'Cpu',
  'servers': 'Server',
  'mixed': 'Layers',
};
