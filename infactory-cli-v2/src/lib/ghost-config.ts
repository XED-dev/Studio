/**
 * lib/ghost-config.ts — Geteilte Ghost-Credential-Resolution für deploy/images
 *
 * Hintergrund (CLI-M5.5): `deploy.ts` (M5.3) hatte resolveDeployConfig +
 * validateDeployOptions intern. `images.ts` (M5.5) braucht dieselbe Logik —
 * "right time for extraction" mit zwei Konsumenten (statt premature abstraction).
 *
 * Source-of-Truth-Kette für ghost-url + admin-key:
 *   1. CLI-Flag (cliOpts)
 *   2. ENV: INFACTORY_GHOST_URL / INFACTORY_GHOST_KEY
 *   3. .infactory.json im CWD: Feld deploy.url / deploy.key
 *   4. (NICHT preset.yaml — siehe CC §Design-Entscheidungen / Credential-Policy)
 *
 * Error-Pattern: Validation kann mit beliebigem Error-Type werfen (errorFactory
 * als optionaler Parameter). Caller injiziert seine eigene Error-Klasse
 * (DeployError, ImagesError, …) — kein Wrap-Boilerplate beim Aufruf.
 */

import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {type GhostConfig, parseAdminKey} from './ghost-api.js'

export interface ResolvedConfig {
  adminKey: null | string
  ghostUrl: null | string
}

interface ProjectConfig {
  deploy?: {
    key?: string
    url?: string
  }
}

function readProjectConfig(cwd: string): null | ProjectConfig {
  const path = join(cwd, '.infactory.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProjectConfig
  } catch {
    return null
  }
}

/**
 * Pure Config-Resolution. Wirft NICHT — null-Felder zeigen fehlende Quelle.
 */
export function resolveGhostConfig(
  cliOpts: {adminKey?: string; ghostUrl?: string},
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): ResolvedConfig {
  const project = readProjectConfig(cwd)

  return {
    adminKey:
      cliOpts.adminKey
      ?? env.INFACTORY_GHOST_KEY
      ?? project?.deploy?.key
      ?? null,
    ghostUrl:
      cliOpts.ghostUrl
      ?? env.INFACTORY_GHOST_URL
      ?? project?.deploy?.url
      ?? null,
  }
}

/**
 * Validiert ResolvedConfig + parseAdminKey-Format. Bei Fehler: wirft via
 * `errorFactory(msg)` — Caller bestimmt den konkreten Error-Type.
 *
 * Bei Erfolg: normalisierte GhostConfig (URL ohne trailing slash).
 *
 * **Credential-Safety:** Die Error-Messages enthalten NIE den Admin-Key
 * oder Teile davon — auch nicht bei "Ungültiges Format". Der parseAdminKey-
 * Throw wird gefangen + generisch re-thrown (parseAdminKey selbst leakt
 * sonst den Key in die Standard-Message).
 */
export function requireValidCredentials(
  resolved: ResolvedConfig,
  errorFactory: (msg: string) => Error = (msg) => new Error(msg),
): GhostConfig {
  if (!resolved.ghostUrl) {
    throw errorFactory(
      '--ghost-url fehlt. Beispiel: --ghost-url=https://mein.blog '
      + '(oder ENV INFACTORY_GHOST_URL, oder .infactory.json deploy.url)',
    )
  }

  if (!resolved.adminKey) {
    throw errorFactory(
      '--admin-key fehlt. Ghost Admin → Settings → Integrations → Custom Integration. '
      + 'Format: <id>:<secret> (oder ENV INFACTORY_GHOST_KEY, oder .infactory.json deploy.key)',
    )
  }

  try {
    parseAdminKey(resolved.adminKey)
  } catch {
    throw errorFactory(
      'Ungültiges Admin-Key-Format. Erwartet: <id>:<secret> (aus Ghost Admin → Integrations)',
    )
  }

  return {
    adminKey: resolved.adminKey,
    url: resolved.ghostUrl.replace(/\/+$/, ''),
  }
}
