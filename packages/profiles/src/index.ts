export interface RunnerProfile {
  id: string;
  name: string;
  image: string;
  description: string;
  verifyCommands: VerifyCommand[];
}

export interface VerifyCommand {
  name: string;
  label: string;
  commands: string[];
}

function cmd(primary: string, ...fallbacks: string[]): string[] {
  return [primary, ...fallbacks];
}

export const NODE20_PROFILE: RunnerProfile = {
  id: 'node20',
  name: 'Node.js 20',
  image: 'node:20-bookworm',
  description: 'Node.js 20 LTS (Debian bookworm) with git and bash pre-installed. Enable corepack for pnpm support.',
  verifyCommands: [
    {
      name: 'lint',
      label: 'Lint',
      commands: cmd(
        'corepack enable 2>/dev/null; test -f pnpm-lock.yaml && pnpm lint || npm run lint',
      ),
    },
    {
      name: 'typecheck',
      label: 'Type Check',
      commands: cmd(
        'corepack enable 2>/dev/null; test -f pnpm-lock.yaml && pnpm check || (npm run check 2>/dev/null || npx tsc --noEmit)',
      ),
    },
    {
      name: 'test',
      label: 'Test',
      commands: cmd(
        'corepack enable 2>/dev/null; test -f pnpm-lock.yaml && pnpm test || npm test',
      ),
    },
  ],
};

const PROFILES: Record<string, RunnerProfile> = {
  node20: NODE20_PROFILE,
};

export function getProfile(profileId: string): RunnerProfile | undefined {
  return PROFILES[profileId];
}

export function listProfiles(): RunnerProfile[] {
  return Object.values(PROFILES);
}

export function getVerifyCommands(profileId: string): VerifyCommand[] {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  return profile.verifyCommands;
}

export function getProfileImage(profileId: string): string {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  return profile.image;
}
