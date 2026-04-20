/**
 * lib/ghost-api.ts — Ghost Admin API Client für inFactory CLI
 *
 * TypeScript-Port von infactory-cli/src/ghost-api.js (CLI-M5.1).
 *
 * Scope in dieser Version:
 *   - parseAdminKey, generateJwt, buildAdminUrl (pure, testbar)
 *   - ghostRequest<T> (generic HTTP wrapper, result-type-basiert)
 *   - uploadTheme, activateTheme (Theme-Management für M5.3 deploy)
 *   - uploadImage (Multipart für M5.5 images)
 *
 * NICHT portiert in M5.1 (kommt mit html-to-lexical.ts):
 *   - createPage, createPost (brauchen htmlToLexical() aus 597-LOC-Modul)
 *
 * Architektur-Entscheidungen:
 *   - JWT hier, nicht in deploy. Löst den circular-import aus der alten CLI
 *     (ghost-api.js importierte generateJWT aus deploy.js).
 *   - Result-Type `GhostHttpResponse<T>` statt throws. Konsistent mit der
 *     alten uploadTheme-Logik, einheitlicher für Caller.
 *
 * HINWEIS M5.3: deploy.js hat weiterhin seine EIGENE generateJWT — solange
 * deploy via Legacy-Delegation läuft, nutzt es die alte JWT-Implementierung.
 * Bei der deploy-Portierung in M5.3 MUSS der native Command `generateJwt()`
 * aus diesem Modul importieren und die eigene JWT-Logik entsorgen.
 */

import {createHmac} from 'node:crypto'
import {existsSync, readFileSync, statSync} from 'node:fs'
import {request as httpRequest} from 'node:http'
import {request} from 'node:https'
import {basename} from 'node:path'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GhostConfig {
  /** Admin API Key im Format `<id>:<secret>` aus Ghost Admin → Integrations */
  adminKey: string
  /** Base-URL der Ghost-Instanz, z.B. `https://mein.blog` (ohne trailing slash) */
  url: string
}

export interface GhostTheme {
  active: boolean
  gscan?: Record<string, unknown>
  name: string
  package?: Record<string, unknown>
  templates?: string[]
}

export interface GhostImage {
  ref?: null | string
  url: string
}

/**
 * Einheitliches Response-Format für alle Ghost-API-Calls.
 * `ok` ist true bei HTTP 2xx, `data` ist dann typisiert parsed JSON.
 * Bei Netzwerk-Fehler: `ok=false, status=0, data=null, body=<error-message>`.
 */
export interface GhostHttpResponse<T> {
  body: string
  data: null | T
  ok: boolean
  status: number
}

// ── Pure Functions (testbar) ───────────────────────────────────────────────

/**
 * Zerlegt den Admin-Key in `<id>:<secret>` und validiert das Format.
 * Wirft bei ungültigem Format.
 */
export function parseAdminKey(adminKey: string): {keyId: string; keySecret: string} {
  const parts = adminKey.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Ungültiges Admin-Key-Format: "${adminKey}"\n  Erwartet: <id>:<secret> (aus Ghost Admin → Integrations)`,
    )
  }

  return {keyId: parts[0], keySecret: parts[1]}
}

/**
 * Ghost Admin API JWT generieren (HS256).
 * Spec: https://ghost.org/docs/admin-api/#token-authentication
 *
 * Header: { alg: "HS256", typ: "JWT", kid: keyId }
 * Payload: { iat, exp (+5min), aud: "/admin/" }
 * Signature: HMAC-SHA256 mit hex-decodiertem secret
 *
 * @param adminKey — `<id>:<secret>` Format
 * @param now — Unix-Timestamp in Sekunden (Default: aktuelle Zeit) — Tests
 *              können einen fixen Wert übergeben für Snapshots.
 */
export function generateJwt(adminKey: string, now?: number): string {
  const {keyId, keySecret} = parseAdminKey(adminKey)
  const iat = now ?? Math.floor(Date.now() / 1000)
  const exp = iat + 5 * 60

  const header = b64url(JSON.stringify({alg: 'HS256', kid: keyId, typ: 'JWT'}))
  const payload = b64url(JSON.stringify({aud: '/admin/', exp, iat}))

  const signingInput = `${header}.${payload}`
  const secretBytes = Buffer.from(keySecret, 'hex')

  const signature = createHmac('sha256', secretBytes).update(signingInput).digest('base64url')

  return `${signingInput}.${signature}`
}

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

/**
 * Baut eine vollständige Admin-API-URL aus Base + Endpoint-Pfad.
 *
 * Normalisiert doppelte Slashes und trailing slashes auf der Base-URL.
 * Der Endpoint-Pfad wird angehängt wie er ist (sollte mit `/` beginnen).
 *
 * @example
 *   buildAdminUrl('https://mein.blog/', '/ghost/api/admin/posts/')
 *   → 'https://mein.blog/ghost/api/admin/posts/'
 *
 *   buildAdminUrl('https://mein.blog', '/ghost/api/admin/themes/upload/')
 *   → 'https://mein.blog/ghost/api/admin/themes/upload/'
 */
export function buildAdminUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}

// ── HTTP-Core (execSync/request-basiert, NICHT getestet) ──────────────────

type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT'

/**
 * Low-level HTTP-Request mit node:http/https. Gibt immer `GhostHttpResponse`
 * zurück — auch bei Netzwerk-Fehlern (`ok=false, status=0`).
 */
function httpCall<T>(
  url: string,
  method: HttpMethod,
  headers: Record<string, number | string>,
  body: Buffer | null,
): Promise<GhostHttpResponse<T>> {
  return new Promise((resolve) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const fn = isHttps ? request : httpRequest

    const options = {
      headers,
      hostname: parsed.hostname,
      method,
      path: parsed.pathname + parsed.search,
      port: parsed.port || (isHttps ? 443 : 80),
    }

    const req = fn(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        let parsedData: null | T = null
        try {
          parsedData = JSON.parse(data) as T
        } catch { /* body is not JSON — leave data null */ }

        resolve({
          body: data,
          data: parsedData,
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode ?? 0,
        })
      })
    })

    req.on('error', (err) => {
      resolve({body: err.message, data: null, ok: false, status: 0})
    })

    if (body) req.write(body)
    req.end()
  })
}

/**
 * Generic Ghost-Admin-API-Request mit JWT-Auth + JSON-Body.
 *
 * @template T - erwarteter Shape der Response (wird als JSON geparsed)
 * @example
 *   const res = await ghostRequest<{posts: GhostPost[]}>(config, 'GET', '/ghost/api/admin/posts/')
 *   if (res.ok) console.log(res.data?.posts)
 */
export async function ghostRequest<T = unknown>(
  config: GhostConfig,
  method: HttpMethod,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<GhostHttpResponse<T>> {
  const token = generateJwt(config.adminKey)
  const url = buildAdminUrl(config.url, endpoint)

  const headers: Record<string, number | string> = {
    'Accept': 'application/json',
    'Accept-Version': 'v5.0',
    'Authorization': `Ghost ${token}`,
    'Content-Type': 'application/json',
  }

  let bodyBuf: Buffer | null = null
  if (body) {
    const jsonStr = JSON.stringify(body)
    bodyBuf = Buffer.from(jsonStr)
    headers['Content-Length'] = bodyBuf.length
  }

  return httpCall<T>(url, method, headers, bodyBuf)
}

// ── Multipart-Upload-Helper (für Theme/Image-Upload) ──────────────────────

interface MultipartFile {
  content: Buffer
  contentType: string
  fieldName: string
  filename: string
}

/**
 * Baut den Multipart-Body manuell (keine externe form-data Dependency).
 */
function buildMultipartBody(file: MultipartFile): {body: Buffer; contentType: string} {
  const boundary = `----InFactoryBoundary${Date.now().toString(36)}`
  const prefix = Buffer.from(
    `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`
      + `Content-Type: ${file.contentType}\r\n\r\n`,
  )
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([prefix, file.content, suffix])

  return {body, contentType: `multipart/form-data; boundary=${boundary}`}
}

// ── Theme-Management (für M5.3 deploy) ────────────────────────────────────

/**
 * Theme-ZIP hochladen.
 * POST /ghost/api/admin/themes/upload/ mit multipart/form-data.
 */
export async function uploadTheme(
  config: GhostConfig,
  zipPath: string,
): Promise<GhostHttpResponse<{themes: GhostTheme[]}>> {
  if (!existsSync(zipPath)) {
    return {body: `ZIP nicht gefunden: ${zipPath}`, data: null, ok: false, status: 0}
  }

  const token = generateJwt(config.adminKey)
  const url = buildAdminUrl(config.url, '/ghost/api/admin/themes/upload/')

  const {body, contentType} = buildMultipartBody({
    content: readFileSync(zipPath),
    contentType: 'application/zip',
    fieldName: 'file',
    filename: basename(zipPath),
  })

  const headers: Record<string, number | string> = {
    'Accept': 'application/json',
    'Accept-Version': 'v5.0',
    'Authorization': `Ghost ${token}`,
    'Content-Length': body.length,
    'Content-Type': contentType,
  }

  return httpCall<{themes: GhostTheme[]}>(url, 'POST', headers, body)
}

/**
 * Theme aktivieren.
 * PUT /ghost/api/admin/themes/:name/activate/
 */
export async function activateTheme(
  config: GhostConfig,
  name: string,
): Promise<GhostHttpResponse<{themes: GhostTheme[]}>> {
  const endpoint = `/ghost/api/admin/themes/${encodeURIComponent(name)}/activate/`
  return ghostRequest<{themes: GhostTheme[]}>(config, 'PUT', endpoint)
}

// ── Image-Upload (für M5.5 images) ─────────────────────────────────────────

const IMAGE_MIME: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/**
 * Bild hochladen. Gibt die Ghost-hosted URL zurück.
 * POST /ghost/api/admin/images/upload/ mit multipart/form-data.
 *
 * @param config — Ghost-Konfiguration (URL + adminKey)
 * @param imagePath — lokaler Pfad zur Bilddatei
 * @param ref — optionale Referenz-ID (z.B. ursprüngliche URL), hilft Ghost
 *              beim Deduplizieren von Uploads.
 */
export async function uploadImage(
  config: GhostConfig,
  imagePath: string,
  ref?: string,
): Promise<GhostHttpResponse<{images: GhostImage[]}>> {
  if (!existsSync(imagePath)) {
    return {body: `Bild nicht gefunden: ${imagePath}`, data: null, ok: false, status: 0}
  }

  if (!statSync(imagePath).isFile()) {
    return {body: `Pfad ist keine Datei: ${imagePath}`, data: null, ok: false, status: 0}
  }

  const ext = imagePath.slice(imagePath.lastIndexOf('.')).toLowerCase()
  const mime = IMAGE_MIME[ext] ?? 'application/octet-stream'

  const token = generateJwt(config.adminKey)
  const endpoint = ref
    ? `/ghost/api/admin/images/upload/?ref=${encodeURIComponent(ref)}`
    : '/ghost/api/admin/images/upload/'
  const url = buildAdminUrl(config.url, endpoint)

  const {body, contentType} = buildMultipartBody({
    content: readFileSync(imagePath),
    contentType: mime,
    fieldName: 'file',
    filename: basename(imagePath),
  })

  const headers: Record<string, number | string> = {
    'Accept': 'application/json',
    'Accept-Version': 'v5.0',
    'Authorization': `Ghost ${token}`,
    'Content-Length': body.length,
    'Content-Type': contentType,
  }

  return httpCall<{images: GhostImage[]}>(url, 'POST', headers, body)
}
