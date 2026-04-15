import {Command, Flags} from '@oclif/core'

import {discoverSites} from '../lib/config.js'
import {httpGet, httpStatusCode} from '../lib/http.js'
import {color, icon} from '../lib/output.js'
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

  // Health-Endpunkt prüfen
  if (isServiceActive(svc)) {
    const body = httpGet(`http://127.0.0.1:${port}/xed/api/health`)
    if (body) {
      let version = '?'
      try {
        version = JSON.parse(body).server?.version ?? '?'
      } catch { /* ignore */ }

      log(`  ${icon.ok}   /xed/api/health \u2192 v${version}`)
    } else {
      log(`  ${icon.warn}   /xed/api/health nicht erreichbar (Service läuft, aber kein Response)`)
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

  // HTTP-Check
  if (isServiceActive(svc)) {
    const code = httpStatusCode(`http://127.0.0.1:${port}/`)
    if (code >= 200 && code < 400) {
      log(`  ${icon.ok}   HTTP localhost:${port} \u2192 ${code}`)
    } else {
      log(`  ${icon.warn}   HTTP localhost:${port} \u2192 ${code}`)
    }
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
