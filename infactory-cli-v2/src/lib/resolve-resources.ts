/**
 * lib/resolve-resources.ts — Default-Lookup für Theme-Ressourcen
 *
 * Hintergrund (CLI-M5.2.1):
 * `presets/`, `base-theme/` und `sections/registry.json` liegen auf dem
 * produktiven Server weiterhin nur unter `/opt/infactory/infactory-cli/`.
 * Der native `infactory build`-Command soll ohne Flag-Gymnastik laufen —
 * dieser Resolver entscheidet wo er sucht.
 *
 * Priority:
 *   1. `explicit` Pfad (aus CLI-Flag) → direkt zurück, auch wenn nicht existiert.
 *      Explicit-Override darf nicht silent auf einen anderen Pfad fallbacken.
 *   2. `<cwd>/<name>` existiert → benutze es.
 *   3. `<legacyCliDir>/<name>` existiert → benutze es (Server-Fall).
 *   4. Sonst: throw BuildError mit allen geprüften Pfaden.
 *
 * Wird neben `build.ts` auch von `deploy.ts` (M5.3) und `qa.ts` (M5.4)
 * gebraucht — beide lesen ebenfalls presets.
 */

import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {BuildError} from './build-error.js'

export type ResourceName = 'base-theme' | 'presets' | 'sections'

export interface ResolveOptions {
  /** CWD-Override für Tests. Default: process.cwd(). */
  cwd?: string
  /** Legacy-CLI-Verzeichnis auf dem Server. Default: '/opt/infactory/infactory-cli'. */
  legacyCliDir?: string
}

const DEFAULT_LEGACY_CLI_DIR = '/opt/infactory/infactory-cli'

/**
 * Löst den Pfad zu einem Ressourcen-Verzeichnis auf.
 *
 * @throws BuildError wenn kein Kandidat gefunden wird und kein expliziter
 *         Pfad gesetzt ist.
 */
export function resolveResourcePath(
  explicit: string | undefined,
  name: ResourceName,
  opts: ResolveOptions = {},
): string {
  if (explicit) return explicit

  const cwd = opts.cwd ?? process.cwd()
  const legacyCliDir = opts.legacyCliDir ?? DEFAULT_LEGACY_CLI_DIR

  const candidates = [
    join(cwd, name),
    join(legacyCliDir, name),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new BuildError(
    `Kein ${name}/-Verzeichnis gefunden. Geprüft:\n`
    + candidates.map((c) => `  - ${c}`).join('\n')
    + `\nAbhilfe: --${name}=<pfad> oder lege ${name}/ im aktuellen Verzeichnis an.`,
  )
}

/**
 * Löst den Pfad zu `sections/registry.json` auf.
 * Nutzt `resolveResourcePath` für das `sections/`-Verzeichnis und hängt
 * `registry.json` an.
 *
 * @throws BuildError wenn weder explicit noch ein `sections/`-Verzeichnis
 *         gefunden wird.
 */
export function resolveRegistryPath(
  explicit: string | undefined,
  opts: ResolveOptions = {},
): string {
  if (explicit) return explicit

  const sectionsDir = resolveResourcePath(undefined, 'sections', opts)
  return join(sectionsDir, 'registry.json')
}
