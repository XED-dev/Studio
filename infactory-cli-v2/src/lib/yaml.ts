/**
 * lib/yaml.ts — Typisierter YAML-Loader + Preset-Schema-Interfaces
 *
 * Dünner Wrapper um js-yaml mit einheitlicher Fehler-Konversion nach BuildError.
 */

import {load as loadYaml} from 'js-yaml'
import {readFileSync} from 'node:fs'

import {BuildError} from './build-error.js'

/**
 * Ein Item in `preset.ghost.custom[]` — landet am Ende in `package.json`
 * unter `config.custom.<key>` (Ghost-Theme-Setting).
 */
export interface GhostCustomItem {
  default?: boolean | number | string
  description?: string
  key: string
  options?: string[]
  type?: 'boolean' | 'color' | 'image' | 'number' | 'select' | 'text'
}

/**
 * Preset-Schema (teilweise — nur die Felder, die der Build-Pipeline bekannt sind).
 * Unbekannte Felder sind via `unknown`-Passthrough zulässig.
 */
export interface Preset {
  description?: string
  ghost?: {
    custom?: GhostCustomItem[]
    members_enabled?: boolean
    posts_per_page?: number
  }
  icon?: string
  id: string
  layout?: {
    home?: string[]
  }
  name?: string
  tokens?: Record<string, unknown>
}

/**
 * Lädt eine YAML-Datei und parst sie typisiert.
 *
 * @throws BuildError bei I/O-Fehler oder invalid YAML (mit ursprünglicher
 * Fehlermeldung als Kontext).
 */
export function loadYamlFile<T>(path: string): T {
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    throw new BuildError(`Kann ${path} nicht lesen: ${(error as Error).message}`)
  }

  try {
    return loadYaml(content) as T
  } catch (error) {
    throw new BuildError(`YAML-Parse-Fehler in ${path}: ${(error as Error).message}`)
  }
}
