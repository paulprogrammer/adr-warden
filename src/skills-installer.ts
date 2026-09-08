import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWardenVersion } from './version.js';

export interface SkillInstallOptions {
  targetDir?: string;
  repo?: string;
  ref?: string;
  token?: string;
  force?: boolean;
  includeGemini?: boolean;
  localFallback?: boolean;
  onProgress?: (message: string) => void;
}

export interface SkillInstallResult {
  targetDir: string;
  sourceRef: string;
  installedSkills: string[];
  filesWritten: string[];
  skippedFiles: string[];
  downloadedFromGitHub: boolean;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  url: string;
}

export class SkillsInstaller {
  private static readonly DEFAULT_REPO = 'paulprogrammer/adr-warden';
  private static readonly KNOWN_SKILLS = [
    'adr-authoring-guard',
    'adr-changeset-alignment',
    'adr-graph-lifecycle',
  ];

  public static resolveTargetDir(rawTarget?: string): string {
    const base = resolve(process.cwd(), rawTarget || '.agents');
    // If the path ends with '.agents', place skills under '.agents/skills'
    if (basename(base) === '.agents') {
      return join(base, 'skills');
    }
    return base;
  }

  public static async install(options: SkillInstallOptions = {}): Promise<SkillInstallResult> {
    const repo = options.repo || this.DEFAULT_REPO;
    const targetDir = this.resolveTargetDir(options.targetDir);
    const force = options.force ?? true;
    const log = options.onProgress || (() => {});
    const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const wardenVersion = getWardenVersion();

    const candidateRefs: string[] = options.ref
      ? [options.ref]
      : [`v${wardenVersion}`, wardenVersion, 'main'];

    mkdirSync(targetDir, { recursive: true });

    let geminiDir: string | undefined;
    if (options.includeGemini) {
      geminiDir = resolve(process.cwd(), '.gemini/skills');
      mkdirSync(geminiDir, { recursive: true });
    }

    const filesWritten: string[] = [];
    const skippedFiles: string[] = [];
    const installedSkillsSet = new Set<string>();

    let successfulRef: string | null = null;
    let downloadedFromGitHub = false;

    // 1. Try downloading from GitHub for candidate refs
    for (const ref of candidateRefs) {
      log(`Checking GitHub repo ${repo} for skills at ref '${ref}'...`);
      try {
        const skillsFound = await this.fetchAndInstallFromGitHub(
          repo,
          ref,
          targetDir,
          geminiDir,
          token,
          force,
          filesWritten,
          skippedFiles,
          installedSkillsSet,
          log
        );

        if (skillsFound) {
          successfulRef = ref;
          downloadedFromGitHub = true;
          break;
        }
      } catch (err) {
        log(`Warning: Failed to fetch from GitHub ref '${ref}': ${(err as Error).message}`);
      }
    }

    // 2. If GitHub fetch failed or was blocked, attempt fallback to local bundled skills
    if (!downloadedFromGitHub && options.localFallback !== false) {
      log('Attempting fallback to locally bundled skills from adr-warden package...');
      const localSkillsDir = this.findLocalBundledSkillsDir();
      if (localSkillsDir && existsSync(localSkillsDir)) {
        this.copyFromLocalDir(
          localSkillsDir,
          targetDir,
          geminiDir,
          force,
          filesWritten,
          skippedFiles,
          installedSkillsSet,
          log
        );
        successfulRef = `local-bundle (${wardenVersion})`;
      } else {
        throw new Error(
          `Could not download skills from GitHub (${repo}) at refs [${candidateRefs.join(', ')}] and local bundled skills were not found.`
        );
      }
    }

    if (!successfulRef && filesWritten.length === 0 && skippedFiles.length === 0) {
      throw new Error(
        `Failed to install skills from GitHub repository ${repo}. Check network connection and ref.`
      );
    }

    return {
      targetDir,
      sourceRef: successfulRef || candidateRefs[0],
      installedSkills: Array.from(installedSkillsSet),
      filesWritten,
      skippedFiles,
      downloadedFromGitHub,
    };
  }

  private static async fetchAndInstallFromGitHub(
    repo: string,
    ref: string,
    targetDir: string,
    geminiDir: string | undefined,
    token: string | undefined,
    force: boolean,
    filesWritten: string[],
    skippedFiles: string[],
    installedSkillsSet: Set<string>,
    log: (msg: string) => void
  ): Promise<boolean> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'adr-warden',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiUrl = `https://api.github.com/repos/${repo}/contents/skills?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(apiUrl, { headers });

    if (res.status === 404) {
      log(`Ref '${ref}' not found on GitHub.`);
      return false;
    }

    // If rate-limited or forbidden, fall back to raw content download for known skills
    if (res.status === 403) {
      log(`GitHub API rate-limited (status 403). Falling back to raw file downloads...`);
      return await this.fetchRawKnownSkills(
        repo,
        ref,
        targetDir,
        geminiDir,
        token,
        force,
        filesWritten,
        skippedFiles,
        installedSkillsSet,
        log
      );
    }

    if (!res.ok) {
      log(`GitHub API returned status ${res.status}: ${res.statusText}`);
      return false;
    }

    const items = (await res.json()) as GitHubContentItem[];
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }

    const skillDirs = items.filter((i) => i.type === 'dir');
    if (skillDirs.length === 0) {
      return false;
    }

    for (const skill of skillDirs) {
      log(`Downloading skill '${skill.name}' from ${ref}...`);
      await this.downloadDirectory(
        repo,
        ref,
        skill.path,
        join(targetDir, skill.name),
        geminiDir ? join(geminiDir, skill.name) : undefined,
        headers,
        force,
        filesWritten,
        skippedFiles,
        log
      );
      installedSkillsSet.add(skill.name);
    }

    return true;
  }

  private static async downloadDirectory(
    repo: string,
    ref: string,
    remotePath: string,
    localDestDir: string,
    geminiDestDir: string | undefined,
    headers: Record<string, string>,
    force: boolean,
    filesWritten: string[],
    skippedFiles: string[],
    log: (msg: string) => void
  ): Promise<void> {
    mkdirSync(localDestDir, { recursive: true });
    if (geminiDestDir) {
      mkdirSync(geminiDestDir, { recursive: true });
    }

    const url = `https://api.github.com/repos/${repo}/contents/${remotePath}?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to list directory ${remotePath}: ${res.statusText}`);
    }

    const items = (await res.json()) as GitHubContentItem[];
    for (const item of items) {
      const localFilePath = join(localDestDir, item.name);
      const geminiFilePath = geminiDestDir ? join(geminiDestDir, item.name) : undefined;

      if (item.type === 'dir') {
        await this.downloadDirectory(
          repo,
          ref,
          item.path,
          localFilePath,
          geminiFilePath,
          headers,
          force,
          filesWritten,
          skippedFiles,
          log
        );
      } else if (item.type === 'file') {
        if (!force && existsSync(localFilePath)) {
          skippedFiles.push(localFilePath);
          continue;
        }

        const content = await this.downloadFileContent(item, headers);
        writeFileSync(localFilePath, content, 'utf8');
        filesWritten.push(localFilePath);

        if (geminiFilePath) {
          writeFileSync(geminiFilePath, content, 'utf8');
          filesWritten.push(geminiFilePath);
        }
        log(`Installed: ${item.name} -> ${localDestDir}`);
      }
    }
  }

  private static async downloadFileContent(
    item: GitHubContentItem,
    headers: Record<string, string>
  ): Promise<string> {
    if (item.download_url) {
      const res = await fetch(item.download_url, { headers });
      if (res.ok) {
        return await res.text();
      }
    }

    // Fallback using raw media type via API
    const res = await fetch(item.url, {
      headers: { ...headers, Accept: 'application/vnd.github.v3.raw' },
    });
    if (!res.ok) {
      throw new Error(`Failed to download ${item.path}: ${res.statusText}`);
    }
    return await res.text();
  }

  private static async fetchRawKnownSkills(
    repo: string,
    ref: string,
    targetDir: string,
    geminiDir: string | undefined,
    token: string | undefined,
    force: boolean,
    filesWritten: string[],
    skippedFiles: string[],
    installedSkillsSet: Set<string>,
    log: (msg: string) => void
  ): Promise<boolean> {
    const rawHeaders: Record<string, string> = {
      'User-Agent': 'adr-warden',
    };
    if (token) {
      rawHeaders['Authorization'] = `Bearer ${token}`;
    }

    let installedCount = 0;

    for (const skillName of this.KNOWN_SKILLS) {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${ref}/skills/${skillName}/SKILL.md`;
      const res = await fetch(rawUrl, { headers: rawHeaders });
      if (res.ok) {
        const text = await res.text();
        const destDir = join(targetDir, skillName);
        mkdirSync(destDir, { recursive: true });

        const destFile = join(destDir, 'SKILL.md');
        if (!force && existsSync(destFile)) {
          skippedFiles.push(destFile);
        } else {
          writeFileSync(destFile, text, 'utf8');
          filesWritten.push(destFile);
          log(`Installed: SKILL.md -> ${destDir}`);
        }

        if (geminiDir) {
          const geminiSkillDir = join(geminiDir, skillName);
          mkdirSync(geminiSkillDir, { recursive: true });
          const geminiFile = join(geminiSkillDir, 'SKILL.md');
          writeFileSync(geminiFile, text, 'utf8');
          filesWritten.push(geminiFile);
        }

        installedSkillsSet.add(skillName);
        installedCount++;
      }
    }

    return installedCount > 0;
  }

  private static findLocalBundledSkillsDir(): string | null {
    try {
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        resolve(currentDir, '../skills'),
        resolve(currentDir, '../../skills'),
        resolve(process.cwd(), 'skills'),
      ];

      for (const cand of candidates) {
        if (existsSync(cand) && statSync(cand).isDirectory()) {
          return cand;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private static copyFromLocalDir(
    sourceDir: string,
    targetDir: string,
    geminiDir: string | undefined,
    force: boolean,
    filesWritten: string[],
    skippedFiles: string[],
    installedSkillsSet: Set<string>,
    log: (msg: string) => void
  ): void {
    const entries = readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillName = entry.name;
        const srcSkillDir = join(sourceDir, skillName);
        const destSkillDir = join(targetDir, skillName);
        const geminiSkillDir = geminiDir ? join(geminiDir, skillName) : undefined;

        mkdirSync(destSkillDir, { recursive: true });
        if (geminiSkillDir) mkdirSync(geminiSkillDir, { recursive: true });

        const skillFiles = readdirSync(srcSkillDir, { withFileTypes: true });
        for (const file of skillFiles) {
          if (file.isFile()) {
            const srcFile = join(srcSkillDir, file.name);
            const destFile = join(destSkillDir, file.name);
            const gemFile = geminiSkillDir ? join(geminiSkillDir, file.name) : undefined;

            if (!force && existsSync(destFile)) {
              skippedFiles.push(destFile);
              continue;
            }

            copyFileSync(srcFile, destFile);
            filesWritten.push(destFile);

            if (gemFile) {
              copyFileSync(srcFile, gemFile);
              filesWritten.push(gemFile);
            }

            log(`Copied: ${file.name} -> ${destSkillDir}`);
          }
        }

        installedSkillsSet.add(skillName);
      }
    }
  }
}
