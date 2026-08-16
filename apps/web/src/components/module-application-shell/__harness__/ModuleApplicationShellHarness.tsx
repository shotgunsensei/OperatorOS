'use client';

import { Activity, Grid2X2, HelpCircle, Settings, Waves } from 'lucide-react';
import { ModuleApplicationShell, type ModuleRouteManifestGroup, type ModuleThemeTokens } from '..';

export const HARNESS_THEME: ModuleThemeTokens = {
  id: 'phase48-ocean-harness',
  colorScheme: 'dark',
  colors: {
    background: '#03131b', panel: '#08232f', panelRaised: '#0d3040', text: '#ecfeff', muted: '#9ac2ca',
    border: '#235364', primary: '#22d3ee', secondary: '#38bdf8', accent: '#a78bfa', danger: '#fb7185',
    success: '#34d399', focus: '#f0abfc',
  },
  radius: { small: '4px', medium: '12px', large: '20px' },
  density: 'spacious',
  typography: { body: 'ui-sans-serif, system-ui', heading: 'Georgia, serif', accent: 'ui-monospace, monospace' },
};

export const HARNESS_ROUTES: readonly ModuleRouteManifestGroup[] = [{
  id: 'main', label: 'Explore', items: [
    { id: 'currents', canonicalPath: '/__harness/currents', label: 'Currents', icon: Waves, activeMatch: { kind: 'prefix' } },
    { id: 'signals', canonicalPath: '/__harness/signals', label: 'Signals', icon: Activity, activeMatch: { kind: 'prefix' }, badge: '3' },
  ],
}];

// Intentionally not mounted by a Next route. This compile-time harness proves
// that a visually unrelated module can consume the production shell contract
// without shipping a public test surface.
export default function ModuleApplicationShellHarness() {
  return (
    <ModuleApplicationShell
      moduleId="phase48-harness"
      moduleName="Tidal Relay"
      theme={HARNESS_THEME}
      currentPath="/__harness/currents"
      navigation={HARNESS_ROUTES}
      brand={<strong>Tidal Relay</strong>}
      organization={{ label: 'Fleet', value: 'North Atlantic' }}
      accessContext={{ label: 'Access', value: 'Observer' }}
      utilityActions={[
        { label: 'My Apps', href: '/app', icon: Grid2X2 },
        { label: 'Settings', href: '/__harness/settings', icon: Settings },
        { label: 'Help', href: '/john', icon: HelpCircle },
      ]}
      page={{ eyebrow: 'Ocean telemetry', title: 'Currents', subtitle: 'A dark cyan representative shell with no TradeFlowKit visual tokens.' }}
    >
      <p>Representative nonproduction content.</p>
    </ModuleApplicationShell>
  );
}
