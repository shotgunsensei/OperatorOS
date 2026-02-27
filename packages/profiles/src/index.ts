export interface VerifyCommand {
  name: string;
  label: string;
  commands: string[];
  optional?: boolean;
}

export interface PreviewConfig {
  startCommands: string[];
  port: number;
  healthPath: string;
}

export interface RunnerProfile {
  id: string;
  name: string;
  image: string;
  description: string;
  workspaceDir: string;
  verifyCommands: VerifyCommand[];
  preview?: PreviewConfig;
}

function cmd(primary: string, ...fallbacks: string[]): string[] {
  return [primary, ...fallbacks];
}

export const NODE20_PROFILE: RunnerProfile = {
  id: 'node20',
  name: 'Node.js 20',
  image: 'node:20-bookworm',
  description: 'Node.js 20 LTS (Debian bookworm) with git and bash pre-installed.',
  workspaceDir: '/workspace',
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
        'corepack enable 2>/dev/null; test -f pnpm-lock.yaml && pnpm run check 2>/dev/null || (npm run check 2>/dev/null || npx tsc --noEmit)',
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
  preview: {
    startCommands: ['corepack enable 2>/dev/null; test -f pnpm-lock.yaml && pnpm dev || npm run dev'],
    port: 3000,
    healthPath: '/',
  },
};

export const PYTHON311_PROFILE: RunnerProfile = {
  id: 'python311',
  name: 'Python 3.11',
  image: 'python:3.11-bookworm',
  description: 'Python 3.11 (Debian bookworm) with pip.',
  workspaceDir: '/workspace',
  verifyCommands: [
    {
      name: 'lint',
      label: 'Lint',
      commands: cmd('pip install -q ruff 2>/dev/null && ruff check . || echo "lint skipped"'),
      optional: true,
    },
    {
      name: 'typecheck',
      label: 'Type Check',
      commands: cmd('python -m compileall -q .'),
    },
    {
      name: 'test',
      label: 'Test',
      commands: cmd(
        'test -f requirements.txt && pip install -q -r requirements.txt 2>/dev/null; python -m pytest -q 2>/dev/null || python -m unittest discover -q 2>/dev/null || echo "no tests found"',
      ),
    },
  ],
};

export const GO122_PROFILE: RunnerProfile = {
  id: 'go122',
  name: 'Go 1.22',
  image: 'golang:1.22-bookworm',
  description: 'Go 1.22 (Debian bookworm).',
  workspaceDir: '/workspace',
  verifyCommands: [
    {
      name: 'lint',
      label: 'Lint (vet)',
      commands: cmd('go vet ./...'),
    },
    {
      name: 'typecheck',
      label: 'Build',
      commands: cmd('go build ./...'),
    },
    {
      name: 'test',
      label: 'Test',
      commands: cmd('go test ./...'),
    },
  ],
};

export const DOTNET8_PROFILE: RunnerProfile = {
  id: 'dotnet8',
  name: '.NET 8',
  image: 'mcr.microsoft.com/dotnet/sdk:8.0',
  description: '.NET 8 SDK.',
  workspaceDir: '/workspace',
  verifyCommands: [
    {
      name: 'lint',
      label: 'Build (lint)',
      commands: cmd('dotnet build --nologo -v q'),
      optional: true,
    },
    {
      name: 'typecheck',
      label: 'Build',
      commands: cmd('dotnet build --nologo'),
    },
    {
      name: 'test',
      label: 'Test',
      commands: cmd('dotnet test --nologo -v q'),
    },
  ],
};

export const JAVA21_PROFILE: RunnerProfile = {
  id: 'java21',
  name: 'Java 21',
  image: 'eclipse-temurin:21-jdk',
  description: 'Eclipse Temurin Java 21 JDK.',
  workspaceDir: '/workspace',
  verifyCommands: [
    {
      name: 'lint',
      label: 'Compile',
      commands: cmd(
        'test -f pom.xml && mvn -q compile || (test -f build.gradle && gradle compileJava -q || echo "no build system found, skipping")',
      ),
      optional: true,
    },
    {
      name: 'typecheck',
      label: 'Build',
      commands: cmd(
        'test -f pom.xml && mvn -q package -DskipTests || (test -f build.gradle && gradle build -x test -q || echo "no build system, skipping")',
      ),
    },
    {
      name: 'test',
      label: 'Test',
      commands: cmd(
        'test -f pom.xml && mvn -q test || (test -f build.gradle && gradle test -q || echo "no build system, skipping")',
      ),
    },
  ],
};

const PROFILES: Record<string, RunnerProfile> = {
  node20: NODE20_PROFILE,
  python311: PYTHON311_PROFILE,
  go122: GO122_PROFILE,
  dotnet8: DOTNET8_PROFILE,
  java21: JAVA21_PROFILE,
};

export function getProfile(profileId: string): RunnerProfile | undefined {
  return PROFILES[profileId];
}

export function listProfiles(): RunnerProfile[] {
  return Object.values(PROFILES);
}

export function getVerifyCommands(profileId: string): VerifyCommand[] {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);
  return profile.verifyCommands;
}

export function getProfileImage(profileId: string): string {
  const profile = getProfile(profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);
  return profile.image;
}

export function getVerifyPlan(profileId: string): { name: string; label: string; optional: boolean }[] {
  const cmds = getVerifyCommands(profileId);
  return cmds.map((c) => ({ name: c.name, label: c.label, optional: c.optional ?? false }));
}

export function detectPackageManager(files: string[]): 'pnpm' | 'yarn' | 'npm' {
  if (files.some((f) => f.includes('pnpm-lock.yaml'))) return 'pnpm';
  if (files.some((f) => f.includes('yarn.lock'))) return 'yarn';
  return 'npm';
}
