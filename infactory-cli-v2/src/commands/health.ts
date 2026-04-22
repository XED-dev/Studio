import {Command, Flags} from '@oclif/core'
import {existsSync} from 'node:fs'

import {discoverSites} from '../lib/config.js'
import {httpGet, httpStatusCode} from '../lib/http.js'
import {color, icon} from '../lib/output.js'
import {resolvePlaywrightBrowsersPath, resolvePythonScript, resolveVenv} from '../lib/resolve-venv.js'
import {isServiceActive, restartService} from '../lib/systemd.js'

// ── Health-Check Logik ─────────────────────────────────────────────────────

interface HealthResult {
  errors: number
  fixes: number
}

function checkNginx(fix: boolean, result: HealthResult, log: (msg: string) => void): void {
  if (isServiceActive('nginx')) {
    log(`  ${icon.ok} nginx — active`)
  } else {
    log(`  ${icon.err} nginx — DOWN`)
    result.errors++
    if (fix) {
      log(`  ${icon.info} Restart: nginx...`)
      if (restartService('nginx', 1)) {
        log(`  ${icon.ok} nginx neugestartet`)
        result.fixes++
      } else {
        log(`  ${icon.err} nginx Restart fehlgeschlagen`)
      }
    }
  }
}

function checkInfactoryService(
  svc: string, port: number, fix: boolean, result: HealthResult, log: (msg: string) => void,
): void {
  if (isServiceActive(svc)) {
    log(`  ${icon.ok} ${svc} (Port ${port}) — active`)
  } else {
    log(`  ${icon.err} ${svc} (Port ${port}) — DOWN`)
    result.errors++
    if (fix) {
      log(`  ${icon.info} Restart: ${svc}...`)
      if (restartService(svc, 2)) {
        log(`  ${icon.ok} ${svc} neugestartet`)
        result.fixes++
      } else {
        log(`  ${icon.err} ${svc} Restart fehlgeschlagen — journalctl -u ${svc} -n 20`)
      }
    }
  }

  // Health-Endpunkt prüfen.
  // WICHTIG: Direkt an 127.0.0.1:port, OHNE `/xed/` Prefix — der Express-Server
  // mountet die Routes auf `/api/*`. Das `/xed/` sieht nur NGINX (Regel:
  // `location /xed/ { proxy_pass http://127.0.0.1:PORT/; }` strippt `/xed/`
  // beim Proxy-Pass). Lokal ohne NGINX heisst der Pfad `/api/health`.
  if (isServiceActive(svc)) {
    const body = httpGet(`http://127.0.0.1:${port}/api/health`)
    if (body) {
      let version = '?'
      try {
        version = JSON.parse(body).server?.version ?? '?'
      } catch { /* ignore */ }

      log(`  ${icon.ok}   /api/health \u2192 v${version}`)
    } else {
      log(`  ${icon.warn}   /api/health nicht erreichbar (Service läuft, aber kein Response)`)
    }
  }
}

function checkPayloadService(
  svc: string, port: number, fix: boolean, result: HealthResult, log: (msg: string) => void,
): void {
  if (isServiceActive(svc)) {
    log(`  ${icon.ok} ${svc} (Port ${port}) — active`)
  } else {
    log(`  ${icon.err} ${svc} (Port ${port}) — DOWN`)
    result.errors++
    if (fix) {
      log(`  ${icon.info} Restart: ${svc}...`)
      if (restartService(svc, 3)) {
        log(`  ${icon.ok} ${svc} neugestartet`)
        result.fixes++
      } else {
        log(`  ${icon.err} ${svc} Restart fehlgeschlagen — journalctl -u ${svc} -n 20`)
      }
    }
  }

  // HTTP-Check: Payload/Next.js hat basePath=/studio → `/` liefert 404/308.
  // Der echte Site-Root ist `/studio/` — dort erwartet wir 200.
  if (isServiceActive(svc)) {
    const code = httpStatusCode(`http://127.0.0.1:${port}/studio/`)
    if (code >= 200 && code < 400) {
      log(`  ${icon.ok}   HTTP localhost:${port}/studio/ \u2192 ${code}`)
    } else {
      log(`  ${icon.warn}   HTTP localhost:${port}/studio/ \u2192 ${code}`)
    }
  }
}

/**
 * QA-Dependencies-Preflight (M5.4.1).
 *
 * Validiert die externen Abhängigkeiten von `qa compare`/`qa batch`:
 *   - Python-venv mit shot-scraper-Shim
 *   - Playwright-Chromium-Browsers-Verzeichnis
 *   - `extract-structure.py` Helper für Sensor 3
 *
 * Bei Fehler: konkrete Fix-Action (install.sh). Kein Auto-Fix möglich —
 * der Fix ist der Install-Rerun selbst, der diese Deps provisioniert.
 */
function checkQaDependencies(result: HealthResult, log: (msg: string) => void): void {
  log(`  ${color.bold}QA Dependencies${color.nc}`)

  // venv + shot-scraper-Shim
  try {
    const venv = resolveVenv()
    if (existsSync(venv.shotScraper)) {
      log(`  ${icon.ok} venv + shot-scraper — ${venv.root}`)
    } else {
      log(`  ${icon.err} shot-scraper fehlt im venv (${venv.shotScraper})`)
      log(`         Fix: curl -fsSL https://studio.xed.dev/install.sh | bash`)
      result.errors++
    }
  } catch {
    log(`  ${icon.err} venv nicht gefunden (geprüft: ENV INFACTORY_VENV, <cwd>/venv, /opt/infactory/venv)`)
    log(`         Fix: curl -fsSL https://studio.xed.dev/install.sh | bash`)
    result.errors++
  }

  // Playwright-Browsers
  const browsers = resolvePlaywrightBrowsersPath()
  if (browsers) {
    log(`  ${icon.ok} Playwright-Browsers — ${browsers}`)
  } else {
    log(`  ${icon.warn} Playwright-Browsers nicht gefunden (ENV PLAYWRIGHT_BROWSERS_PATH, <cwd>/browsers, /opt/infactory/browsers)`)
    log(`         Default ~/.cache/ms-playwright/ wird ausprobiert — wenn qa dort crasht:`)
    log(`         Fix: curl -fsSL https://studio.xed.dev/install.sh | bash`)
    // Nur Warning, nicht Error — Default-Pfad kann existieren
  }

  // extract-structure.py (Sensor 3)
  try {
    const scriptPath = resolvePythonScript('extract-structure.py')
    log(`  ${icon.ok} extract-structure.py — ${scriptPath}`)
  } catch {
    log(`  ${icon.err} extract-structure.py nicht gefunden (geprüft: <cwd>/src, /opt/infactory/infactory-cli/src)`)
    log(`         Sensor 3 (Struktur-Vergleich) wird bei jeder qa-Session fehlschlagen.`)
    log(`         Fix: curl -fsSL https://studio.xed.dev/install.sh | bash`)
    result.errors++
  }
}

// ── oclif Command ──────────────────────────────────────────────────────────

export default class Health extends Command {
  static description = 'Prüft alle inFactory Services auf dem Server'
  static examples = [
    '<%= config.bin %> health',
    '<%= config.bin %> health --fix',
  ]
  static flags = {
    fix: Flags.boolean({
      default: false,
      description: 'Gestoppte Services automatisch neustarten',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Health)
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const result: HealthResult = {errors: 0, fixes: 0}

    this.log('')
    this.log(`  ${color.bold}inFactory Health Check${color.nc} — ${timestamp}`)
    if (flags.fix) {
      this.log(`  Modus: ${color.bold}Auto-Fix${color.nc} (gestoppte Services werden neugestartet)`)
    }

    this.log('')

    // ── NGINX ──────────────────────────────────────────────────────────
    this.log(`  ${color.bold}NGINX${color.nc}`)
    checkNginx(flags.fix, result, (msg) => this.log(msg))
    this.log('')

    // ── QA Dependencies ────────────────────────────────────────────────
    checkQaDependencies(result, (msg) => this.log(msg))
    this.log('')

    // ── Alle Sites ─────────────────────────────────────────────────────
    const sites = discoverSites()

    if (sites.length === 0) {
      this.log(`  ${icon.warn} Keine Sites konfiguriert in /var/xed/`)
      this.log('')
    }

    for (const site of sites) {
      this.log(`  ${color.bold}${site.tld}${color.nc}`)

      if (site.hasInfactory) {
        checkInfactoryService(
          site.infactoryService, site.infactoryPort,
          flags.fix, result, (msg) => this.log(msg),
        )
      }

      if (site.hasPayload) {
        checkPayloadService(
          site.payloadService, site.payloadPort,
          flags.fix, result, (msg) => this.log(msg),
        )
      }

      this.log('')
    }

    // ── Zusammenfassung ────────────────────────────────────────────────
    if (result.errors === 0) {
      this.log(`  ${color.green}${color.bold}Alle Services gesund.${color.nc}`)
    } else {
      this.log(`  ${color.red}${color.bold}${result.errors} Problem(e) gefunden.${color.nc}`)
      if (result.fixes > 0) {
        this.log(`  ${color.green}${result.fixes} davon automatisch behoben.${color.nc}`)
      }

      if (!flags.fix) {
        this.log(`  Auto-Fix: ${color.bold}infactory health --fix${color.nc}`)
      }
    }

    this.log('')

    if (result.errors > 0 && result.errors > result.fixes) {
      this.exit(1)
    }
  }
}
