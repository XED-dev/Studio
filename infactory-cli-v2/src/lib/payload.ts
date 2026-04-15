/**
 * lib/payload.ts — pnpm-Subprocess-Wrapper für das Studio-Payload Target-Projekt
 *
 * /opt/studio-payload/ nutzt intern pnpm + Payload CMS 3 + Next.js 16.
 * Dieses Modul kapselt die drei relevanten pnpm-Aufrufe:
 *   - install:  pnpm install --frozen-lockfile (mit Fallback auf non-frozen)
 *   - migrate:  pnpm payload migrate (DB-Tabellen anlegen/migrieren)
 *   - build:    pnpm build (Next.js Production-Build)
 *
 * Jede Funktion akzeptiert optional envFile — wenn gesetzt, werden die Variablen
 * für den Subprozess geladen (wichtig für DATABASE_URI bei migrate, für
 * NEXT_PUBLIC_* bei build).
 */

import {execSync} from 'node:child_process'

import {readEnv} from './site.js'

/**
 * Führt ein Kommando im Target-Projekt-Verzeichnis aus, mit optional geladenen Env-Vars.
 * Gibt true zurück bei Erfolg, false bei Non-Zero-Exit.
 * stdout/stderr werden durchgereicht, damit der User pnpm-Fortschritt sieht.
 */
function runInDir(cwd: string, cmd: string, envFile?: string): boolean {
  const env = {...process.env}
  if (envFile) {
    const vars = readEnv(envFile)
    for (const [k, v] of Object.entries(vars)) {
      env[k] = v
    }
  }

  try {
    execSync(cmd, {cwd, env, stdio: 'inherit'})
    return true
  } catch {
    return false
  }
}

/**
 * pnpm install im Target-Verzeichnis. Erst frozen-lockfile versuchen
 * (stabiler Stand), bei Fehler auf normales install zurückfallen.
 */
export function runInstall(installDir: string): boolean {
  if (runInDir(installDir, 'pnpm install --frozen-lockfile --silent')) return true
  return runInDir(installDir, 'pnpm install --silent')
}

/**
 * pnpm payload migrate im Target-Verzeichnis.
 * Benötigt mindestens DATABASE_URI + PAYLOAD_SECRET aus der site-Env.
 */
export function runMigrate(installDir: string, envFile: string): boolean {
  return runInDir(installDir, 'pnpm payload migrate', envFile)
}

/**
 * pnpm build (Next.js Production-Build) im Target-Verzeichnis.
 * Benötigt NEXT_PUBLIC_* Variablen (basePath, server-URL) zur Build-Zeit.
 */
export function runBuild(installDir: string, envFile?: string): boolean {
  return runInDir(installDir, 'pnpm build', envFile)
}

/**
 * Prüft ob pnpm auf dem System verfügbar ist. Gibt die Version zurück oder null.
 */
export function pnpmVersion(): null | string {
  try {
    return execSync('pnpm --version', {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim()
  } catch {
    return null
  }
}

/**
 * Prüft ob node die Mindestversion erfüllt (erforderlich: v18+).
 * Gibt die Major-Version zurück oder 0 bei Fehler.
 */
export function nodeMajor(): number {
  try {
    const v = execSync('node -e "console.log(process.versions.node.split(\'.\')[0])"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return Number.parseInt(v, 10) || 0
  } catch {
    return 0
  }
}

/**
 * Prüft ob git verfügbar ist. Gibt die Version zurück oder null.
 */
export function gitVersion(): null | string {
  try {
    const out = execSync('git --version', {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim()
    // "git version 2.43.0" → "2.43.0"
    return out.split(' ')[2] ?? out
  } catch {
    return null
  }
}

// ── Git-Operationen im Target-Verzeichnis ──────────────────────────────────

export interface GitUpdateResult {
  changed: boolean
  newHead: string
  ok: boolean
  oldHead: string
}

/**
 * git fetch + hard reset auf origin/main im Target-Verzeichnis.
 * Überlebt dirty working trees, Mode-Bit-Drift und local modifications
 * (wie install.sh seit Commit bba5051, Session 20).
 */
export function gitFetchResetMain(dir: string): GitUpdateResult {
  const result: GitUpdateResult = {changed: false, newHead: '?', ok: false, oldHead: '?'}

  try {
    result.oldHead = execSync('git rev-parse --short HEAD', {
      cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch { /* fresh clone, HEAD noch unbekannt */ }

  try {
    execSync('git fetch --quiet origin main', {cwd: dir, stdio: 'pipe'})
  } catch {
    return result
  }

  try {
    result.newHead = execSync('git rev-parse --short origin/main', {
      cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return result
  }

  if (result.oldHead !== result.newHead) {
    try {
      execSync('git reset --hard --quiet origin/main', {cwd: dir, stdio: 'pipe'})
      result.changed = true
    } catch {
      return result
    }
  }

  result.ok = true
  return result
}

/**
 * Initial-Clone (depth 1) eines Repos in ein Zielverzeichnis.
 */
export function gitCloneShallow(repoUrl: string, targetDir: string): boolean {
  try {
    execSync(`git clone --depth 1 "${repoUrl}" "${targetDir}"`, {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

/**
 * Liest die aktuelle HEAD-Short-Commit-ID in einem Repo. `?` bei Fehler.
 */
export function headShort(dir: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return '?'
  }
}

/**
 * Liest die package.json Version im Zielverzeichnis. `?` bei Fehler.
 */
export function packageVersion(dir: string): string {
  try {
    return execSync(`node -p "require('${dir}/package.json').version"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return '?'
  }
}
