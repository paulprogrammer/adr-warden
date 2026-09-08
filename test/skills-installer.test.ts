import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SkillsInstaller } from '../src/skills-installer.js';
import { getWardenVersion } from '../src/version.js';

describe('SkillsInstaller and Version Alignment', () => {
  const testDir = resolve(__dirname, '../.test-skills-install');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('correctly reports the package version', () => {
    const version = getWardenVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('resolves target directories ensuring .agents maps to .agents/skills', () => {
    const defaultTarget = SkillsInstaller.resolveTargetDir();
    expect(defaultTarget.endsWith('.agents/skills')).toBe(true);

    const explicitAgents = SkillsInstaller.resolveTargetDir('.agents');
    expect(explicitAgents.endsWith('.agents/skills')).toBe(true);

    const customTarget = SkillsInstaller.resolveTargetDir('custom/path');
    expect(customTarget.endsWith('custom/path')).toBe(true);
  });

  it('installs skills aligned to version and writes skill files', async () => {
    const targetDir = join(testDir, 'skills');
    const result = await SkillsInstaller.install({
      targetDir,
      force: true,
      localFallback: true,
    });

    expect(result.installedSkills.length).toBeGreaterThan(0);
    expect(result.filesWritten.length).toBeGreaterThan(0);

    // Verify files were actually written to target
    for (const file of result.filesWritten) {
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('---');
    }
  });

  it('skips existing files when force is false', async () => {
    const targetDir = join(testDir, 'skills');
    const skillDir = join(targetDir, 'adr-authoring-guard');
    mkdirSync(skillDir, { recursive: true });
    const existingFile = join(skillDir, 'SKILL.md');
    writeFileSync(existingFile, 'PRE-EXISTING CONTENT', 'utf8');

    const result = await SkillsInstaller.install({
      targetDir,
      force: false,
      localFallback: true,
    });

    expect(result.skippedFiles).toContain(existingFile);
    expect(readFileSync(existingFile, 'utf8')).toBe('PRE-EXISTING CONTENT');
  });
});
