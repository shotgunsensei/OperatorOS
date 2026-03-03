import type { ExecFn, DetectionResult, PublishPlan, ArtifactsResult, ProofResult, PlanStep } from './types.js';

export async function analyzeWorkspace(workspaceId: string, exec: ExecFn): Promise<DetectionResult> {
  const fileExists = async (path: string) => {
    const r = await exec(`test -f /workspace/${path} && echo "yes" || echo "no"`);
    return r.stdout.trim() === 'yes';
  };

  const readFile = async (path: string) => {
    const r = await exec(`cat /workspace/${path} 2>/dev/null`);
    return r.exitCode === 0 ? r.stdout : null;
  };

  const dirExists = async (path: string) => {
    const r = await exec(`test -d /workspace/${path} && echo "yes" || echo "no"`);
    return r.stdout.trim() === 'yes';
  };

  let framework: DetectionResult['detected']['framework'] = 'unknown';
  let language: DetectionResult['detected']['language'] = 'unknown';
  const scripts: DetectionResult['detected']['scripts'] = {};
  let portsHint: number | undefined;

  const hasDockerfile = await fileExists('Dockerfile');
  const hasVercel = await fileExists('vercel.json');
  const hasRender = await fileExists('render.yaml');
  const hasRailway = await fileExists('railway.json') || await fileExists('railway.toml');
  const hasFly = await fileExists('fly.toml');
  const hasSupabase = await dirExists('supabase');
  const hasStripe = false;

  const pkgJson = await readFile('package.json');
  const goMod = await readFile('go.mod');
  const requirements = await fileExists('requirements.txt');
  const pyproject = await fileExists('pyproject.toml');
  const csproj = (await exec('find /workspace -maxdepth 2 -name "*.csproj" 2>/dev/null | head -1')).stdout.trim();
  const appJson = await readFile('app.json');
  const hasAndroid = await dirExists('android');
  const hasIos = await dirExists('ios');

  const nextConfig = await fileExists('next.config.js') || await fileExists('next.config.mjs') || await fileExists('next.config.ts');
  const viteConfig = await fileExists('vite.config.js') || await fileExists('vite.config.ts') || await fileExists('vite.config.mjs');

  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      language = 'ts';
      if (pkg.scripts?.build) scripts.build = pkg.scripts.build;
      if (pkg.scripts?.start) scripts.start = pkg.scripts.start;
      if (pkg.scripts?.test) scripts.test = pkg.scripts.test;
      scripts.install = await fileExists('pnpm-lock.yaml') ? 'pnpm install' :
        await fileExists('yarn.lock') ? 'yarn install' : 'npm install';

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hasTs = !!deps?.typescript || await fileExists('tsconfig.json');
      language = hasTs ? 'ts' : 'js';

      if (nextConfig || deps?.next) {
        framework = 'nextjs';
        portsHint = 3000;
      } else if (viteConfig && (deps?.react || deps?.vue || deps?.svelte)) {
        framework = 'react-vite';
      } else if (deps?.express || deps?.fastify || deps?.koa || deps?.hapi) {
        framework = 'express';
        portsHint = 3000;
      } else if (deps?.expo || appJson) {
        framework = 'expo';
      }
    } catch { /* invalid json */ }
  } else if (goMod) {
    framework = 'go';
    language = 'go';
    scripts.build = 'go build ./...';
    scripts.test = 'go test ./...';
    portsHint = 8080;
  } else if (requirements || pyproject) {
    language = 'py';
    const hasFastapi = requirements
      ? (await readFile('requirements.txt'))?.includes('fastapi')
      : (await readFile('pyproject.toml'))?.includes('fastapi');
    framework = hasFastapi ? 'fastapi' : 'unknown';
    scripts.install = requirements ? 'pip install -r requirements.txt' : 'pip install .';
    scripts.test = await fileExists('pytest.ini') || await fileExists('tests') ? 'pytest' : undefined;
    portsHint = 8000;
  } else if (csproj) {
    framework = 'dotnet';
    language = 'cs';
    scripts.install = 'dotnet restore';
    scripts.build = 'dotnet build';
    scripts.test = 'dotnet test';
    portsHint = 5000;
  }

  if (appJson && (hasAndroid || hasIos)) {
    framework = 'expo';
    language = language === 'unknown' ? 'ts' : language;
  }

  const risks: DetectionResult['risks'] = [];
  const recommendations: DetectionResult['recommendations'] = [];

  const hasPrisma = await dirExists('prisma');
  const hasDrizzle = await fileExists('drizzle.config.ts') || await fileExists('drizzle.config.js');
  const hasMigrations = await dirExists('migrations') || await dirExists('prisma/migrations');

  if (hasPrisma || hasDrizzle || hasMigrations) {
    risks.push({ code: 'DB_REQUIRED', message: 'Project uses a database — ensure DB is provisioned before deploy', fixable: false });
  }

  const hasEnvExample = await fileExists('.env.example') || await fileExists('.env.local.example');
  if (hasEnvExample) {
    risks.push({ code: 'ENV_VARS', message: 'Project has .env.example — set environment variables on deploy target', fixable: false });
  }

  if (!scripts.build && framework !== 'go' && framework !== 'fastapi') {
    risks.push({ code: 'NO_BUILD', message: 'No build script detected — deploy may need manual build configuration', fixable: true });
  }

  if (framework === 'nextjs') {
    recommendations.push({ target: 'vercel', reason: 'Next.js has first-class Vercel support with zero-config deploys' });
    recommendations.push({ target: 'render', reason: 'Render supports Next.js with Docker or native Node builds' });
    recommendations.push({ target: 'railway', reason: 'Railway auto-detects Next.js projects' });
  } else if (framework === 'react-vite') {
    recommendations.push({ target: 'netlify', reason: 'Static sites deploy instantly on Netlify' });
    recommendations.push({ target: 'vercel', reason: 'Vercel handles Vite/React static builds well' });
  } else if (framework === 'express' || framework === 'fastapi' || framework === 'go' || framework === 'dotnet') {
    recommendations.push({ target: 'render', reason: 'Render is great for backend services with managed infrastructure' });
    recommendations.push({ target: 'railway', reason: 'Railway offers easy deployments for backend apps' });
    recommendations.push({ target: 'fly', reason: 'Fly.io provides edge deployments with low latency' });
    recommendations.push({ target: 'docker-vps', reason: 'Docker on a VPS gives full control over the deployment' });
  } else if (framework === 'expo') {
    recommendations.push({ target: 'expo-eas', reason: 'EAS Build is the recommended way to build and publish Expo apps' });
  } else {
    recommendations.push({ target: 'docker-vps', reason: 'Docker provides a universal deployment approach for any project' });
    recommendations.push({ target: 'render', reason: 'Render auto-detects many project types' });
  }

  return {
    workspaceId,
    detected: {
      framework,
      language,
      hasDockerfile,
      hasVercel,
      hasRender,
      hasRailway,
      hasFly,
      hasSupabase,
      hasStripe,
      scripts,
      portsHint,
    },
    risks,
    recommendations,
  };
}

export function generatePlan(
  detection: DetectionResult,
  intent: 'web-domain' | 'mobile-store' | 'pwa',
  preferences?: { platform?: string },
): PublishPlan {
  const planId = `plan-${Date.now().toString(36)}`;
  const { framework } = detection.detected;

  let platform: string;
  let type: 'web' | 'mobile' = 'web';

  if (preferences?.platform) {
    platform = preferences.platform;
  } else if (intent === 'mobile-store') {
    platform = 'expo-eas';
    type = 'mobile';
  } else if (framework === 'expo') {
    platform = intent === 'mobile-store' ? 'expo-eas' : 'vercel';
    type = intent === 'mobile-store' ? 'mobile' : 'web';
  } else if (framework === 'nextjs') {
    platform = 'vercel';
  } else if (framework === 'react-vite') {
    platform = 'netlify';
  } else if (['express', 'fastapi', 'go', 'dotnet'].includes(framework)) {
    platform = 'render';
  } else {
    platform = 'docker-vps';
  }

  const steps: PlanStep[] = [];
  let stepId = 1;

  steps.push({
    id: `step-${stepId++}`,
    title: 'Run Proof (Build + Verify)',
    description: 'Ensure the project builds and passes tests before deploying',
    userAction: false,
    canAutoFix: false,
    verification: 'build',
  });

  if (!detection.detected.hasDockerfile && ['render', 'railway', 'fly', 'docker-vps'].includes(platform)) {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Generate Deployment Artifacts',
      description: `Generate required config files for ${platform} (Dockerfile, config, etc.)`,
      userAction: false,
      canAutoFix: true,
      autoFixAction: 'generateArtifacts',
    });
  }

  if (platform === 'vercel' && !detection.detected.hasVercel) {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Generate vercel.json',
      description: 'Create Vercel configuration for optimal deployment',
      userAction: false,
      canAutoFix: true,
      autoFixAction: 'generateArtifacts',
    });
  }

  const requiredEnvVars: PublishPlan['requiredEnvVars'] = [];
  if (detection.risks.some((r) => r.code === 'ENV_VARS') || detection.risks.some((r) => r.code === 'DB_REQUIRED')) {
    requiredEnvVars.push({ key: 'DATABASE_URL', description: 'Database connection string', example: 'postgresql://user:pass@host:5432/db' });
  }

  if (platform === 'vercel' || platform === 'netlify') {
    steps.push({
      id: `step-${stepId++}`,
      title: `Connect to ${platform}`,
      description: `Import your repository on ${platform} dashboard and configure project settings`,
      userAction: true,
      canAutoFix: false,
    });
  } else if (platform === 'render' || platform === 'railway') {
    steps.push({
      id: `step-${stepId++}`,
      title: `Create ${platform} service`,
      description: `Create a new Web Service on ${platform} and connect your repository`,
      userAction: true,
      canAutoFix: false,
    });
  } else if (platform === 'fly') {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Deploy to Fly.io',
      description: 'Run `fly launch` and `fly deploy` from your terminal',
      userAction: true,
      canAutoFix: false,
    });
  } else if (platform === 'docker-vps') {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Deploy Docker Container',
      description: 'Build and push Docker image, then deploy to your VPS',
      userAction: true,
      canAutoFix: false,
    });
  } else if (platform === 'expo-eas') {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Configure EAS Build',
      description: 'Run `eas build:configure` and set up build profiles',
      userAction: true,
      canAutoFix: false,
    });
  }

  if (requiredEnvVars.length > 0) {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Set Environment Variables',
      description: `Configure required environment variables on ${platform}`,
      userAction: true,
      canAutoFix: false,
    });
  }

  if (intent === 'web-domain') {
    steps.push({
      id: `step-${stepId++}`,
      title: 'Configure Domain',
      description: 'Set up DNS records to point your domain to the deployment',
      userAction: true,
      canAutoFix: false,
    });
  }

  steps.push({
    id: `step-${stepId++}`,
    title: 'Publish Checklist',
    description: 'Final verification: confirm deployment is live and accessible',
    userAction: true,
    canAutoFix: false,
    verification: 'healthcheck',
  });

  const dnsGuide = intent === 'web-domain' ? {
    records: [
      { type: 'CNAME' as const, name: 'www', value: `${platform === 'vercel' ? 'cname.vercel-dns.com' : platform === 'netlify' ? 'your-site.netlify.app' : 'your-app.onrender.com'}` },
      { type: 'A' as const, name: '@', value: '76.76.21.21' },
    ],
    notes: [`Add these DNS records to your domain registrar`, `It may take up to 48 hours for DNS changes to propagate`],
  } : undefined;

  const storeGuide = intent === 'mobile-store' ? {
    tracks: ['internal', 'alpha', 'beta', 'production'],
    assets: ['App icon (1024x1024)', 'Feature graphic (1024x500)', 'Screenshots (phone + tablet)', 'Privacy policy URL'],
  } : undefined;

  return {
    ok: true,
    planId,
    selectedTarget: { platform, type },
    steps,
    requiredEnvVars,
    dnsGuide,
    storeGuide,
  };
}

export function generateArtifacts(
  detection: DetectionResult,
  platform: string,
): ArtifactsResult {
  const files: Array<{ path: string; purpose: string }> = [];
  const notes: string[] = [];
  let diff = '';

  const { framework, scripts, portsHint } = detection.detected;

  if (['render', 'railway', 'fly', 'docker-vps'].includes(platform) && !detection.detected.hasDockerfile) {
    let dockerfileContent = '';
    if (framework === 'nextjs' || framework === 'express' || framework === 'react-vite') {
      const installCmd = scripts.install ?? 'npm install';
      const buildCmd = scripts.build ?? 'npm run build';
      const startCmd = scripts.start ?? 'npm start';
      const port = portsHint ?? 3000;
      dockerfileContent = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml* yarn.lock* ./
RUN ${installCmd.replace('pnpm', 'corepack enable && pnpm')}
COPY . .
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
ENV NODE_ENV=production
ENV PORT=${port}
EXPOSE ${port}
CMD ["sh", "-c", "${startCmd}"]
`;
    } else if (framework === 'fastapi') {
      const port = portsHint ?? 8000;
      dockerfileContent = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt* pyproject.toml* ./
RUN pip install --no-cache-dir -r requirements.txt 2>/dev/null || pip install --no-cache-dir .
COPY . .
ENV PORT=${port}
EXPOSE ${port}
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${port}"]
`;
    } else if (framework === 'go') {
      const port = portsHint ?? 8080;
      dockerfileContent = `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/server .
ENV PORT=${port}
EXPOSE ${port}
CMD ["./server"]
`;
    } else if (framework === 'dotnet') {
      const port = portsHint ?? 5000;
      dockerfileContent = `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY . .
RUN dotnet restore && dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .
ENV ASPNETCORE_URLS=http://+:${port}
EXPOSE ${port}
ENTRYPOINT ["dotnet", "$(ls *.dll | head -1)"]
`;
    }

    if (dockerfileContent) {
      files.push({ path: 'Dockerfile', purpose: 'Multi-stage Docker build for production deployment' });
      diff += `--- /dev/null\n+++ b/Dockerfile\n@@ -0,0 +1,${dockerfileContent.split('\n').length} @@\n`;
      dockerfileContent.split('\n').forEach((line) => {
        diff += `+${line}\n`;
      });
    }
  }

  if (platform === 'render' && !detection.detected.hasRender) {
    const port = portsHint ?? 3000;
    const renderYaml = `services:
  - type: web
    name: ${framework}-app
    runtime: ${framework === 'go' ? 'go' : framework === 'dotnet' ? 'docker' : 'node'}
    buildCommand: ${scripts.install ?? 'npm install'} && ${scripts.build ?? 'npm run build'}
    startCommand: ${scripts.start ?? 'npm start'}
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: ${port}
`;
    files.push({ path: 'render.yaml', purpose: 'Render deployment configuration' });
    diff += `--- /dev/null\n+++ b/render.yaml\n@@ -0,0 +1,${renderYaml.split('\n').length} @@\n`;
    renderYaml.split('\n').forEach((line) => {
      diff += `+${line}\n`;
    });
  }

  if (platform === 'vercel' && !detection.detected.hasVercel) {
    const vercelJson = framework === 'nextjs'
      ? `{
  "framework": "nextjs",
  "buildCommand": "${scripts.build ?? 'next build'}",
  "outputDirectory": ".next"
}`
      : `{
  "buildCommand": "${scripts.build ?? 'npm run build'}",
  "outputDirectory": "${framework === 'react-vite' ? 'dist' : '.next'}"
}`;
    files.push({ path: 'vercel.json', purpose: 'Vercel deployment configuration' });
    diff += `--- /dev/null\n+++ b/vercel.json\n@@ -0,0 +1,${vercelJson.split('\n').length} @@\n`;
    vercelJson.split('\n').forEach((line) => {
      diff += `+${line}\n`;
    });
  }

  if (platform === 'fly' && !detection.detected.hasFly) {
    const port = portsHint ?? 3000;
    const flyToml = `app = "${framework}-app"
primary_region = "iad"

[build]

[http_service]
  internal_port = ${port}
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
`;
    files.push({ path: 'fly.toml', purpose: 'Fly.io deployment configuration' });
    diff += `--- /dev/null\n+++ b/fly.toml\n@@ -0,0 +1,${flyToml.split('\n').length} @@\n`;
    flyToml.split('\n').forEach((line) => {
      diff += `+${line}\n`;
    });
  }

  if (files.length === 0) {
    notes.push('No additional artifacts needed — project already has deployment configuration');
  } else {
    notes.push(`Generated ${files.length} deployment file(s) for ${platform}`);
    notes.push('Review the diff below and apply it to your workspace');
  }

  return {
    ok: true,
    proposedChanges: { files, diff },
    notes,
  };
}

export async function runProof(workspaceId: string, exec: ExecFn, detection: DetectionResult): Promise<ProofResult> {
  const { scripts, framework } = detection.detected;

  let installCmd = scripts.install ?? 'npm install';
  let buildCmd = scripts.build;
  let testCmd = scripts.test;

  if (framework === 'go') {
    installCmd = 'go mod download';
    buildCmd = buildCmd ?? 'go build ./...';
    testCmd = testCmd ?? 'go test ./...';
  } else if (framework === 'dotnet') {
    installCmd = 'dotnet restore';
    buildCmd = buildCmd ?? 'dotnet build';
    testCmd = testCmd ?? 'dotnet test';
  } else if (framework === 'fastapi') {
    installCmd = scripts.install ?? 'pip install -r requirements.txt';
    testCmd = testCmd ?? 'pytest';
  }

  const buildSteps: Array<{ name: string; cmd: string }> = [
    { name: 'install', cmd: installCmd },
  ];
  if (buildCmd) buildSteps.push({ name: 'build', cmd: buildCmd });

  let buildOk = true;
  let buildTail = '';
  let buildDuration = 0;

  for (const step of buildSteps) {
    const start = Date.now();
    const r = await exec(`cd /workspace && ${step.cmd}`, 120);
    buildDuration += Date.now() - start;
    const tail = (r.stdout + '\n' + r.stderr).trim().split('\n').slice(-20).join('\n');
    buildTail += `\n--- ${step.name} ---\n${tail}`;
    if (r.exitCode !== 0) {
      buildOk = false;
      break;
    }
  }

  const verifySteps: Array<{ name: string; ok: boolean; tail: string }> = [];
  if (testCmd) {
    const r = await exec(`cd /workspace && ${testCmd}`, 120);
    const tail = (r.stdout + '\n' + r.stderr).trim().split('\n').slice(-15).join('\n');
    verifySteps.push({ name: 'test', ok: r.exitCode === 0, tail });
  }

  const nextActions: string[] = [];
  if (!buildOk) {
    nextActions.push('Fix build errors before deploying');
  } else if (verifySteps.some((s) => !s.ok)) {
    nextActions.push('Fix failing tests (optional but recommended)');
    nextActions.push('Proceed with deployment if tests are non-critical');
  } else {
    nextActions.push('Project is ready for deployment!');
    nextActions.push('Generate artifacts and follow the deployment plan');
  }

  return {
    ok: buildOk && verifySteps.every((s) => s.ok),
    build: { ok: buildOk, tail: buildTail.trim().slice(-2000), durationMs: buildDuration },
    verify: { ok: verifySteps.every((s) => s.ok), steps: verifySteps },
    nextActions,
  };
}
