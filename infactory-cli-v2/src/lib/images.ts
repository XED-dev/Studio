/**
 * lib/images.ts — Ghost-Image-Management (CLI-M5.5)
 *
 * TypeScript-Port von infactory-cli/src/images.js.
 *
 * Vier Subcommands:
 *   - audit    — scannt Pages nach externen Image-URLs + zeigt Archiv-Status
 *   - migrate  — Archiv-basiert: lädt aus lokalem Verzeichnis hoch + rewriteet
 *                Page-HTML. Lädt KEINE externen URLs runter (kein SSRF-Risiko).
 *   - list     — Inventur (Ghost-lokal vs. extern, gruppiert nach Hostname)
 *   - upload   — einzelne Files hochladen
 *
 * Architektur-Verbesserungen vs. Legacy:
 *   - Nutzt `uploadImage` aus ghost-api.ts (Legacy hatte Duplikat).
 *   - Nutzt `fetchAllPages` + `updatePage` aus ghost-api.ts (in M5.5 ergänzt).
 *   - Nutzt `resolveGhostConfig` + `requireValidCredentials` aus ghost-config.ts
 *     (geteilt mit deploy.ts seit M5.5).
 *   - **Path-Traversal-Härtung** in `urlToLocalPath`: Legacy hatte keinen
 *     Schutz vor `../`-Escape. M5.5 ergänzt path.resolve()+startsWith()-Check.
 *
 * Credential-Safety (siehe Memory `feedback_credential_policy_deploy`):
 *   - Admin-Key NIE in Logs/Errors. Nur key-ID (public-Teil) in Verbose-Logs.
 *   - Upload-Response-Body wird nicht in Error-Messages durchgereicht.
 *   - .infactory.json + ENV als Config-Quelle, NICHT preset.yaml.
 */

import {existsSync, statSync} from 'node:fs'
import {basename, isAbsolute, join, resolve, sep} from 'node:path'

import {
  fetchAllPages,
  type GhostConfig,
  type GhostPage,
  parseAdminKey,
  updatePage,
  uploadImage,
} from './ghost-api.js'
import {requireValidCredentials, type ResolvedConfig} from './ghost-config.js'
import {ImagesError} from './images-error.js'

// ── Pure Helpers ──────────────────────────────────────────────────────────────

/**
 * Validiert ResolvedConfig + wirft ImagesError bei fehlenden Credentials.
 * Dünner Wrapper um requireValidCredentials.
 */
export function validateImagesOptions(resolved: ResolvedConfig): GhostConfig {
  return requireValidCredentials(resolved, (msg) => new ImagesError(msg))
}

/**
 * Escapet einen Hostname für sichere Verwendung in einer RegExp.
 * Punkte → `\.`, sonst nichts (Hostnames haben keine anderen RegExp-Metas).
 */
export function escapeHostnamePattern(hostname: string): string {
  return hostname.replaceAll('.', String.raw`\.`)
}

/**
 * Extrahiert externe Image-URLs einer Page, die einem Hostname-Pattern matchen.
 *
 * Quellen: `feature_image` + `lexical` (JSON-String, regex-scan).
 * Lexical ist Ghost's Editor-State als String — URLs sind als unescape-quoted
 * Strings drin.
 */
export function extractImageUrls(page: GhostPage, hostnamePattern: string): Set<string> {
  const urls = new Set<string>()
  const re = new RegExp(String.raw`https?://` + hostnamePattern + String.raw`[^"\\]*`, 'g')

  if (page.feature_image) {
    const matches = page.feature_image.match(re)
    if (matches) for (const m of matches) urls.add(m)
  }

  if (page.lexical) {
    const matches = page.lexical.match(re)
    if (matches) for (const m of matches) urls.add(m)
  }

  return urls
}

/**
 * Mappt eine externe Image-URL auf einen lokalen Archiv-Pfad.
 *
 * **Path-Traversal-Härtung (M5.5 vs. Legacy):** Stellt sicher dass der
 * resultierende Pfad innerhalb von `archiveDir` bleibt. Wirft `ImagesError`
 * bei `../`-Escapes oder absoluten Pfaden, die aus dem Archiv ausbrechen.
 *
 * Wird in `migrate` aufgerufen — dort kommen die URLs aus Ghost-Pages, die
 * potentiell von Content-Editoren bearbeitet wurden. Defense-in-depth.
 *
 * @param url URL ODER Pfad-Fragment (Tests übergeben oft nur den Pfad-Teil).
 * @param archiveDir Lokales Wurzel-Verzeichnis für die Image-Bibliothek.
 * @throws ImagesError wenn der resolvte Pfad außerhalb von archiveDir liegt.
 */
export function urlToLocalPath(url: string, archiveDir: string): string {
  // URL- oder Pfad-Fragment akzeptieren — Tests übergeben oft nur Pfade.
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url
  }

  const cleanPath = pathname.replace(/^\/+/, '')
  if (isAbsolute(cleanPath)) {
    // Sollte nicht passieren nach replace, aber Defense-in-depth.
    throw new ImagesError(`Pfad außerhalb des Archivs: ${url}`)
  }

  const archiveRoot = resolve(archiveDir)
  const candidate = resolve(join(archiveRoot, cleanPath))

  // startsWith mit Path-Separator, damit "/var/archive2" nicht als Prefix
  // von "/var/archive" gilt.
  if (candidate !== archiveRoot && !candidate.startsWith(archiveRoot + sep)) {
    throw new ImagesError(`Pfad außerhalb des Archivs: ${url}`)
  }

  return candidate
}

/**
 * Gruppiert URLs aus Pages nach URL → Set<page.slug>.
 * Pure Function für audit + migrate.
 */
export function buildUrlSlugMap(pages: GhostPage[], hostnamePattern: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const page of pages) {
    const urls = extractImageUrls(page, hostnamePattern)
    for (const url of urls) {
      let slugs = map.get(url)
      if (!slugs) {
        slugs = new Set()
        map.set(url, slugs)
      }

      slugs.add(page.slug)
    }
  }

  return map
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditOptions {
  archiveDir?: string
  ghostConfig: GhostConfig
  hostname: string
}

export interface AuditEntry {
  exists: boolean
  fileName: string
  localPath: null | string
  size: number
  slugs: string[]
  url: string
}

export interface AuditReport {
  available: number
  entries: AuditEntry[]
  external: number
  missing: number
}

export interface MigrateOptions {
  archiveDir: string
  dryRun?: boolean
  ghostConfig: GhostConfig
  hostname: string
  /** Optionaler Filter auf einen einzelnen Page-Slug. */
  slug?: string
}

export interface MigrateEntry {
  /** Null bei Success, sonst ImagesError-Message (kein Auth-Echo). */
  error: null | string
  fileName: string
  /** Ghost-URL nach Upload, null bei Fehler/dryRun. */
  newUrl: null | string
  url: string
}

export interface MigrateReport {
  dryRun: boolean
  pagesUpdated: number
  uploadEntries: MigrateEntry[]
  uploadErrors: number
  uploadOk: number
}

export interface ListReport {
  external: Map<string, Set<string>>
  ghostLocal: Set<string>
}

export interface UploadResult {
  /** Ghost-URL bei Success, ImagesError-Message bei Fehler. */
  errors: Array<{file: string; message: string}>
  ok: Array<{file: string; url: string}>
}

// ── audit ─────────────────────────────────────────────────────────────────────

/**
 * Scannt Ghost-Pages nach externen Image-URLs (von `hostname`) und prüft den
 * lokalen Archiv-Status.
 *
 * @throws ImagesError bei Pages-Fetch-Fehlern.
 */
export async function auditImages(opts: AuditOptions): Promise<AuditReport> {
  const {archiveDir, ghostConfig, hostname} = opts
  const hostPattern = escapeHostnamePattern(hostname)

  let pages: GhostPage[]
  try {
    pages = await fetchAllPages(ghostConfig)
  } catch (error) {
    throw new ImagesError(`Pages-Fetch fehlgeschlagen: ${(error as Error).message}`)
  }

  const urlMap = buildUrlSlugMap(pages, hostPattern)
  const entries: AuditEntry[] = []
  let available = 0
  let missing = 0

  for (const [url, slugs] of urlMap) {
    const fileName = basename(new URL(url).pathname)
    let localPath: null | string = null
    let exists = false
    let size = 0

    if (archiveDir) {
      try {
        localPath = urlToLocalPath(url, archiveDir)
        if (existsSync(localPath)) {
          exists = true
          size = statSync(localPath).size
          available++
        } else {
          missing++
        }
      } catch {
        // ImagesError aus urlToLocalPath (Path-Traversal) → wir zählen als missing
        missing++
      }
    } else {
      missing++
    }

    entries.push({exists, fileName, localPath, size, slugs: [...slugs], url})
  }

  return {available, entries, external: urlMap.size, missing}
}

// ── migrate ───────────────────────────────────────────────────────────────────

/**
 * Pipeline:
 *   1. Pages laden, externe URLs sammeln (gefiltert nach `slug` falls gesetzt)
 *   2. Pro URL: Archiv-Datei lesen + uploadImage zu Ghost (oder dryRun-Skip)
 *   3. Pages mit Replacement-Map aktualisieren (lexical + feature_image)
 *
 * Bei Upload-Fehlern wird Phase 3 NICHT ausgeführt (außer dryRun) — partielle
 * Migrationen würden den Page-State inkonsistent lassen.
 *
 * @throws ImagesError bei Pages-Fetch-Fehlern oder unrettbaren Upload-Failures.
 */
export async function migrateImages(opts: MigrateOptions): Promise<MigrateReport> {
  const {archiveDir, dryRun = false, ghostConfig, hostname, slug} = opts
  const hostPattern = escapeHostnamePattern(hostname)

  let pages: GhostPage[]
  try {
    pages = await fetchAllPages(ghostConfig)
  } catch (error) {
    throw new ImagesError(`Pages-Fetch fehlgeschlagen: ${(error as Error).message}`)
  }

  const targetPages = slug ? pages.filter((p) => p.slug === slug) : pages
  const urlMap = buildUrlSlugMap(targetPages, hostPattern)

  // Phase 2: Upload
  const replaceMap = new Map<string, string>()
  const uploadEntries: MigrateEntry[] = []

  for (const url of urlMap.keys()) {
    const fileName = basename(new URL(url).pathname)
    let localPath: string
    try {
      localPath = urlToLocalPath(url, archiveDir)
    } catch (error) {
      uploadEntries.push({error: (error as Error).message, fileName, newUrl: null, url})
      continue
    }

    if (!existsSync(localPath)) {
      uploadEntries.push({error: `Archiv-Datei fehlt: ${localPath}`, fileName, newUrl: null, url})
      continue
    }

    if (dryRun) {
      const placeholder = `[DRY-RUN:${fileName}]`
      replaceMap.set(url, placeholder)
      uploadEntries.push({error: null, fileName, newUrl: placeholder, url})
      continue
    }

    // eslint-disable-next-line no-await-in-loop -- Ghost-Uploads sequentiell, parallel könnte Rate-Limits triggern
    const result = await uploadImage(ghostConfig, localPath, url)
    if (!result.ok || !result.data?.images?.[0]?.url) {
      uploadEntries.push({error: `Upload fehlgeschlagen (HTTP ${result.status})`, fileName, newUrl: null, url})
      continue
    }

    const newUrl = result.data.images[0].url
    replaceMap.set(url, newUrl)
    uploadEntries.push({error: null, fileName, newUrl, url})
  }

  const uploadOk = uploadEntries.filter((e) => e.error === null).length
  const uploadErrors = uploadEntries.length - uploadOk

  if (uploadErrors > 0 && !dryRun) {
    return {dryRun, pagesUpdated: 0, uploadEntries, uploadErrors, uploadOk}
  }

  // Phase 3: Pages updaten
  let pagesUpdated = 0
  for (const page of targetPages) {
    const urls = extractImageUrls(page, hostPattern)
    if (urls.size === 0) continue

    let newLexical = page.lexical ?? null
    let newFeatureImage = page.feature_image ?? null
    let changes = 0

    for (const [oldUrl, newUrl] of replaceMap) {
      if (newLexical && newLexical.includes(oldUrl)) {
        newLexical = newLexical.split(oldUrl).join(newUrl)
        changes++
      }

      if (newFeatureImage === oldUrl) {
        newFeatureImage = newUrl
        changes++
      }
    }

    if (changes === 0) continue

    if (dryRun) {
      pagesUpdated++
      continue
    }

    // eslint-disable-next-line no-await-in-loop -- Page-Updates sequentiell, optimistic-concurrency via updated_at
    const result = await updatePage(ghostConfig, page, {
      // eslint-disable-next-line camelcase -- Ghost API nutzt snake_case (external schema).
      feature_image: newFeatureImage,
      lexical: newLexical,
    })
    if (result.ok) pagesUpdated++
  }

  return {dryRun, pagesUpdated, uploadEntries, uploadErrors, uploadOk}
}

// ── list ──────────────────────────────────────────────────────────────────────

const IMAGE_URL_REGEX = /https?:\/\/[^"\\]*\.(?:jpg|jpeg|png|gif|svg|webp|avif|ico)/gi

/**
 * Sammelt alle Image-URLs einer Page (lexical + feature_image), klassifiziert
 * sie nach Ghost-lokal vs. extern (gruppiert nach Hostname).
 */
export async function listImages(ghostConfig: GhostConfig): Promise<ListReport> {
  let pages: GhostPage[]
  try {
    pages = await fetchAllPages(ghostConfig)
  } catch (error) {
    throw new ImagesError(`Pages-Fetch fehlgeschlagen: ${(error as Error).message}`)
  }

  const ghostLocal = new Set<string>()
  const external = new Map<string, Set<string>>()
  const ghostHost = new URL(ghostConfig.url).hostname

  for (const page of pages) {
    const urls = new Set<string>()
    if (page.feature_image) urls.add(page.feature_image)
    if (page.lexical) {
      const matches = page.lexical.match(IMAGE_URL_REGEX)
      if (matches) for (const m of matches) urls.add(m)
    }

    for (const url of urls) {
      try {
        const host = new URL(url).hostname
        if (host === ghostHost) {
          ghostLocal.add(url)
        } else {
          let slugs = external.get(host)
          if (!slugs) {
            slugs = new Set()
            external.set(host, slugs)
          }

          slugs.add(url)
        }
      } catch { /* invalid URL — skip */ }
    }
  }

  return {external, ghostLocal}
}

// ── upload ────────────────────────────────────────────────────────────────────

/**
 * Lädt N lokale Bilder zu Ghost hoch.
 *
 * Sequentiell (parallel könnte Ghost-Rate-Limits triggern). Einzelne Fehler
 * sind non-fatal — gehen in `errors[]`. Caller entscheidet ob Exit-Code 1.
 */
export async function uploadImages(ghostConfig: GhostConfig, files: string[]): Promise<UploadResult> {
  const ok: UploadResult['ok'] = []
  const errors: UploadResult['errors'] = []

  for (const file of files) {
    const absPath = resolve(file)
    if (!existsSync(absPath)) {
      errors.push({file, message: 'Datei nicht gefunden'})
      continue
    }

    if (!statSync(absPath).isFile()) {
      errors.push({file, message: 'Pfad ist keine Datei'})
      continue
    }

    // eslint-disable-next-line no-await-in-loop -- siehe migrate-Erklärung
    const result = await uploadImage(ghostConfig, absPath)
    if (!result.ok || !result.data?.images?.[0]?.url) {
      errors.push({file, message: `Upload fehlgeschlagen (HTTP ${result.status})`})
      continue
    }

    ok.push({file, url: result.data.images[0].url})
  }

  return {errors, ok}
}

// ── Helper-Re-Export für Verbose-Logs in Commands ─────────────────────────────

/**
 * Liefert die public key-ID (Teil vor `:`) — für Verbose-Logs OK.
 * Wirft NICHT — bei invalid Format leer-String (Caller sollte vorher
 * `validateImagesOptions` aufgerufen haben, das wirft).
 */
export function publicKeyId(adminKey: string): string {
  try {
    return parseAdminKey(adminKey).keyId
  } catch {
    return ''
  }
}
