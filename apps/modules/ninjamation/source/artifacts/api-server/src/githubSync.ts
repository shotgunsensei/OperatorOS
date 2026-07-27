import { storage } from './storage';
import { logger } from './lib/logger';

const GITHUB_REPO = 'shotgunsensei/AutomationPacks';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

interface GitHubFile {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
  size: number;
}

const FORMAT_MAP: Record<string, string> = {
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
  '.cmd': 'Batch',
  '.py': 'Python',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.vbs': 'VBScript',
  '.js': 'JavaScript',
  '.ts': 'TypeScript',
  '.ahk': 'AutoHotkey',
  '.reg': 'Registry',
  '.xml': 'XML',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
};

function getFormat(fileName: string): string {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return FORMAT_MAP[ext] || 'Other';
}

function getCategory(path: string): string {
  const parts = path.split('/');
  if (parts.length > 1) {
    return parts[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'General';
}

function generateDescription(name: string, format: string, category: string): string {
  const cleanName = name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  return `${cleanName} - A ${format} automation script for ${category.toLowerCase()} tasks.`;
}

async function fetchRepoContents(path: string = ''): Promise<GitHubFile[]> {
  const url = `${GITHUB_API}/contents/${path}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Ninjamation',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<GitHubFile[]>;
}

async function fetchFileContent(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  return response.text();
}

async function processDirectory(path: string = ''): Promise<Array<{
  name: string;
  description: string;
  content: string;
  fileName: string;
  format: string;
  category: string;
  source: string;
  githubPath: string;
}>> {
  const scripts: Array<{
    name: string;
    description: string;
    content: string;
    fileName: string;
    format: string;
    category: string;
    source: string;
    githubPath: string;
  }> = [];

  try {
    const items = await fetchRepoContents(path);

    for (const item of items) {
      if (item.type === 'dir') {
        const subScripts = await processDirectory(item.path);
        scripts.push(...subScripts);
      } else if (item.type === 'file' && item.download_url) {
        const ext = item.name.substring(item.name.lastIndexOf('.')).toLowerCase();
        if (FORMAT_MAP[ext]) {
          try {
            const content = await fetchFileContent(item.download_url);
            const format = getFormat(item.name);
            const category = getCategory(item.path);
            const cleanName = item.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            scripts.push({
              name: cleanName,
              description: generateDescription(item.name, format, category),
              content,
              fileName: item.name,
              format,
              category,
              source: 'github',
              githubPath: item.path,
            });
          } catch (err) {
            logger.warn({ file: item.path, error: err }, 'Failed to fetch file content');
          }
        }
      }
    }
  } catch (err) {
    logger.error({ path, error: err }, 'Failed to process directory');
  }

  return scripts;
}

export async function syncFromGithub(): Promise<{ synced: number; message: string }> {
  logger.info('Starting GitHub sync from ' + GITHUB_REPO);

  try {
    const scripts = await processDirectory();
    let newCount = 0;
    let updatedCount = 0;

    for (const scriptData of scripts) {
      const result = await storage.upsertScript(scriptData);
      if (result.isNew) {
        newCount++;
      } else {
        updatedCount++;
      }
    }

    const message = `Synced ${scripts.length} scripts (${newCount} new, ${updatedCount} updated)`;
    logger.info(message);
    return { synced: scripts.length, message };
  } catch (err) {
    const message = `GitHub sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    logger.error({ error: err }, message);
    return { synced: 0, message };
  }
}
