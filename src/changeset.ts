import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, extname } from 'node:path';

export interface ChangesetFile {
  path: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  addedLines: string[];
  deletedLines: string[];
}

export interface TouchedDependency {
  name: string;
  version?: string;
  type: 'added' | 'changed' | 'removed';
  file: string;
}

export interface ParsedChangeset {
  files: ChangesetFile[];
  touchedPaths: string[];
  touchedDependencies: TouchedDependency[];
  extractedKeywords: string[];
  summaryText: string;
  rawDiff: string;
}

export interface ParseDiffOptions {
  cwd?: string;
  diffRef?: string;
  staged?: boolean;
  diffString?: string;
  summary?: string;
}

export class ChangesetParser {
  public static extractFromGit(options: ParseDiffOptions = {}): ParsedChangeset {
    const cwd = options.cwd || process.cwd();
    let diffOutput = options.diffString || '';

    if (!diffOutput) {
      try {
        if (options.diffRef) {
          diffOutput = execSync(`git diff ${options.diffRef}`, {
            cwd,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
          });
        } else if (options.staged) {
          diffOutput = execSync('git diff --staged', {
            cwd,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
          });
        } else {
          // Default: try staged first; if empty, try unstaged working tree diff
          const staged = execSync('git diff --staged', {
            cwd,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
          });
          if (staged.trim().length > 0) {
            diffOutput = staged;
          } else {
            diffOutput = execSync('git diff HEAD', {
              cwd,
              encoding: 'utf8',
              maxBuffer: 10 * 1024 * 1024,
            });
          }
        }
      } catch (err) {
        throw new Error(`Failed to capture git diff: ${(err as Error).message}`);
      }
    }

    return ChangesetParser.parseDiff(diffOutput, options.summary);
  }

  public static parseDiff(rawDiff: string, explicitSummary?: string): ParsedChangeset {
    const files: ChangesetFile[] = [];
    const touchedDependencies: TouchedDependency[] = [];
    const keywordSet = new Set<string>();

    const lines = rawDiff.split('\n');
    let currentFile: ChangesetFile | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('diff --git ')) {
        if (currentFile) {
          files.push(currentFile);
        }
        // Extract file path from b/path
        const match = line.match(/diff --git a\/(.+?) b\/(.+)$/);
        const path = match ? match[2] : 'unknown';
        currentFile = {
          path,
          changeType: 'modified',
          addedLines: [],
          deletedLines: [],
        };
        continue;
      }

      if (!currentFile) continue;

      if (line.startsWith('new file mode')) {
        currentFile.changeType = 'added';
      } else if (line.startsWith('deleted file mode')) {
        currentFile.changeType = 'deleted';
      } else if (line.startsWith('similarity index') || line.startsWith('rename from')) {
        currentFile.changeType = 'renamed';
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.addedLines.push(line.slice(1));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletedLines.push(line.slice(1));
      }
    }

    if (currentFile) {
      files.push(currentFile);
    }

    // Inspect files for dependencies and domain keywords
    for (const f of files) {
      const p = f.path.toLowerCase();

      // Extract path segments as keywords
      const segments = p.split(/[\/\\]/);
      for (const seg of segments) {
        const clean = seg.replace(/\.[^.]+$/, '').toLowerCase();
        if (clean.length > 2 && !['src', 'lib', 'test', 'tests', 'dist', 'app'].includes(clean)) {
          keywordSet.add(clean);
        }
      }

      // Detect package manager files
      if (p.endsWith('package.json')) {
        ChangesetParser.extractNpmDependencies(f, touchedDependencies);
      } else if (p.endsWith('go.mod')) {
        ChangesetParser.extractGoDependencies(f, touchedDependencies);
      } else if (p.endsWith('requirements.txt') || p.endsWith('pyproject.toml')) {
        ChangesetParser.extractPythonDependencies(f, touchedDependencies);
      } else if (p.endsWith('pom.xml') || p.endsWith('build.gradle')) {
        ChangesetParser.extractJavaDependencies(f, touchedDependencies);
      }

      // Extract imports and technical entity mentions from added lines
      for (const added of f.addedLines.slice(0, 100)) {
        const trimmed = added.trim();
        // Common import patterns (import ... from '...', require('...'), using ..., import ...)
        const importMatch = trimmed.match(/(?:import|require|from|using)\s+['"]?([@\w\/\.-]+)['"]?/);
        if (importMatch && importMatch[1]) {
          const mod = importMatch[1].replace(/['";]/g, '').toLowerCase();
          if (mod.length > 2 && !mod.startsWith('.')) {
            keywordSet.add(mod);
          }
        }

        // Keywords like postgres, redis, kafka, grpc, jwt, otel, etc.
        const matches = trimmed.match(/\b(postgres|postgresql|mysql|sqlite|redis|kafka|rabbitmq|grpc|protobuf|rest|graphql|oauth|jwt|openid|docker|kubernetes|helm|terraform|vault|aws|azure|gcp|s3|sqs|sns|dynamodb|tracer|otel|opentelemetry|zap|winston|prometheus)\b/gi);
        if (matches) {
          for (const m of matches) {
            keywordSet.add(m.toLowerCase());
          }
        }
      }
    }

    for (const dep of touchedDependencies) {
      keywordSet.add(dep.name.toLowerCase());
    }

    // Synthesize human-readable summary
    const paths = files.map((f) => f.path);
    let summaryText = explicitSummary ? `${explicitSummary}\n\n` : '';
    summaryText += `Modified ${files.length} files: ${paths.slice(0, 15).join(', ')}${paths.length > 15 ? ` (+${paths.length - 15} more)` : ''}.\n`;
    if (touchedDependencies.length > 0) {
      summaryText += `Touched dependencies: ${touchedDependencies.map((d) => `${d.name} (${d.type})`).join(', ')}.\n`;
    }
    if (keywordSet.size > 0) {
      summaryText += `Domain topics: ${Array.from(keywordSet).slice(0, 20).join(', ')}.`;
    }

    return {
      files,
      touchedPaths: paths,
      touchedDependencies,
      extractedKeywords: Array.from(keywordSet),
      summaryText,
      rawDiff,
    };
  }

  private static extractNpmDependencies(
    file: ChangesetFile,
    touchedDependencies: TouchedDependency[]
  ): void {
    for (const line of file.addedLines) {
      const match = line.match(/"([^"]+)":\s*"([^"]+)"/);
      if (match) {
        const [, name, version] = match;
        if (!name.startsWith('@types/')) {
          touchedDependencies.push({
            name,
            version,
            type: 'added',
            file: file.path,
          });
        }
      }
    }
  }

  private static extractGoDependencies(
    file: ChangesetFile,
    touchedDependencies: TouchedDependency[]
  ): void {
    for (const line of file.addedLines) {
      const match = line.match(/^\s*([a-zA-Z0-9\.\-\/]+)\s+v([0-9a-zA-Z\.\-\+]+)/);
      if (match) {
        touchedDependencies.push({
          name: match[1],
          version: `v${match[2]}`,
          type: 'added',
          file: file.path,
        });
      }
    }
  }

  private static extractPythonDependencies(
    file: ChangesetFile,
    touchedDependencies: TouchedDependency[]
  ): void {
    for (const line of file.addedLines) {
      const match = line.match(/^([a-zA-Z0-9_\-]+)\s*(?:==|>=|<=|~=)\s*([a-zA-Z0-9\.\-]+)/);
      if (match) {
        touchedDependencies.push({
          name: match[1],
          version: match[2],
          type: 'added',
          file: file.path,
        });
      }
    }
  }

  private static extractJavaDependencies(
    file: ChangesetFile,
    touchedDependencies: TouchedDependency[]
  ): void {
    for (let i = 0; i < file.addedLines.length; i++) {
      const line = file.addedLines[i];
      if (line.includes('<artifactId>')) {
        const match = line.match(/<artifactId>([^<]+)<\/artifactId>/);
        if (match) {
          touchedDependencies.push({
            name: match[1],
            type: 'added',
            file: file.path,
          });
        }
      }
    }
  }
}
