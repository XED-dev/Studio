/**
 * lib/http.ts — HTTP-Hilfsfunktionen für inFactory CLI
 *
 * Verwendet curl als Unterbau (auf dem Server immer verfügbar, kein zusätzlicher npm-Dep).
 */

import {execSync} from 'node:child_process'

/**
 * HTTP GET Request. Gibt den Response-Body als String zurück, oder null bei Fehler.
 */
export function httpGet(url: string, timeoutSec = 5): null | string {
  try {
    return execSync(
      `curl -sf --max-time ${timeoutSec} "${url}"`,
      {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
    )
  } catch {
    return null
  }
}

/**
 * HTTP POST Request mit JSON-Body. Gibt den Response-Body als String zurück, oder null bei Fehler.
 */
export function httpPostJson(url: string, body: Record<string, unknown>, timeoutSec = 10): null | string {
  try {
    const jsonStr = JSON.stringify(body)
    return execSync(
      `curl -sf --max-time ${timeoutSec} "${url}" -X POST -H "Content-Type: application/json" -d '${jsonStr.replaceAll("'", String.raw`'\''`)}'`,
      {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
    )
  } catch {
    return null
  }
}

/**
 * HTTP-Statuscode abfragen (z.B. 200, 404, 0 bei Netzwerk-Fehler/Timeout).
 *
 * WICHTIG — kein `-f` (fail-on-http-error): Wir wollen den HTTP-Code zurueck,
 * auch bei 4xx/5xx. Mit `-f` wuerde curl bei non-200 einen non-zero Exit-Code
 * liefern, zusammen mit `|| echo "000"` ergab das frueher Ausgaben wie
 * `404000` (parseInt → 404000 als Zahl) — siehe CLI-M4(f) Server-Test 2026-04-15.
 *
 * Bei echtem Netzwerk-Fehler (DNS, connection refused, timeout) schlaegt curl
 * auch ohne `-f` fehl → execSync wirft → catch → return 0.
 */
export function httpStatusCode(url: string, timeoutSec = 5): number {
  try {
    const code = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time ${timeoutSec} "${url}"`,
      {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']},
    ).trim()
    return Number.parseInt(code, 10) || 0
  } catch {
    return 0
  }
}
