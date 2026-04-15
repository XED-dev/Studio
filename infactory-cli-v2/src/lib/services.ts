/**
 * lib/services.ts — Multi-Site Service-Orchestrierung für inFactory CLI
 *
 * Wird von `server start/stop/restart` Commands genutzt. Kapselt die Logik:
 *   - Zielmengen-Bestimmung (eine Site via TLD oder alle konfigurierten)
 *   - Idempotente Aktions-Durchführung mit Zählern für Exit-Code
 *
 * Zum Naming: `services` (nicht `server`), damit der CLI-Topic `server`
 * frei bleibt für zukünftige Infactory-Express-spezifische Commands wie
 * `server logs` oder `server reload-config`.
 */

import {discoverSites, findSite, SiteInfo} from './config.js'
import {color, icon} from './output.js'
import {isServiceActive, restartService, startService, stopService} from './systemd.js'

export type ServerAction = 'restart' | 'start' | 'stop'

export interface Logger {
  log: (msg: string) => void
}

export interface ActionResult {
  failed: number
  skipped: number
  success: number
}

/**
 * Ermittelt die Ziel-Sites für Server-Commands.
 *
 *   - Mit TLD: genau diese eine Site (muss existieren und hasInfactory=true)
 *   - Ohne TLD: alle konfigurierten infactory-Sites aus /var/xed/
 *
 * Gibt `null` zurück wenn eine explizit genannte TLD nicht existiert oder
 * keinen Infactory-Service konfiguriert hat — der Command rendert dann die
 * User-Fehlermeldung selbst.
 */
export function resolveInfactoryTargets(tld?: string): null | SiteInfo[] {
  if (tld) {
    const site = findSite(tld)
    if (!site || !site.hasInfactory) return null
    return [site]
  }

  return discoverSites().filter((s) => s.hasInfactory)
}

/**
 * Verb-Form einer Action im Output — für konsistente Meldungen.
 */
function actionVerb(action: ServerAction): string {
  if (action === 'start') return 'gestartet'
  if (action === 'stop') return 'gestoppt'
  return 'neugestartet'
}

/**
 * Führt die Action auf einem einzelnen Service aus.
 * Gibt `true` bei Erfolg zurück, `false` bei Fehler.
 */
function runAction(action: ServerAction, service: string): boolean {
  if (action === 'start') return startService(service, 2)
  if (action === 'stop') return stopService(service, 2)
  return restartService(service, 2)
}

/**
 * Führt eine Server-Aktion auf einer Liste von Sites aus.
 *
 * Idempotent:
 *   - `start` macht nichts, wenn Service bereits aktiv ist
 *   - `stop` macht nichts, wenn Service bereits gestoppt ist
 *   - `restart` läuft immer durch (systemctl restart akzeptiert beide Zustände)
 *
 * Gibt `ActionResult` mit Zählern für Exit-Code-Bestimmung zurück.
 */
export function performServerAction(
  action: ServerAction,
  targets: SiteInfo[],
  log: Logger,
): ActionResult {
  const result: ActionResult = {failed: 0, skipped: 0, success: 0}

  for (const site of targets) {
    const svc = site.infactoryService
    const active = isServiceActive(svc)

    if (action === 'start' && active) {
      log.log(`  ${icon.ok} ${svc} — bereits aktiv`)
      result.skipped++
      continue
    }

    if (action === 'stop' && !active) {
      log.log(`  ${icon.ok} ${svc} — bereits gestoppt`)
      result.skipped++
      continue
    }

    if (runAction(action, svc)) {
      log.log(`  ${icon.ok} ${svc} ${actionVerb(action)}`)
      result.success++
    } else {
      log.log(`  ${icon.err} ${svc} — ${action} fehlgeschlagen (journalctl -u ${svc} -n 20)`)
      result.failed++
    }
  }

  return result
}

/**
 * Rendert die Target-Liste vor Ausführung — pro Service eine Zeile.
 * Wird besonders bei `server stop` genutzt, damit User vor Ausführung sieht,
 * was betroffen ist und ggf. per Ctrl+C abbrechen kann.
 */
export function listTargets(targets: SiteInfo[], action: ServerAction, log: Logger): void {
  if (targets.length === 0) {
    log.log(`  ${icon.warn} Keine konfigurierten Sites mit infactory.json in /var/xed/`)
    return
  }

  const verb = action === 'start' ? 'starten' : action === 'stop' ? 'stoppen' : 'neustarten'
  log.log(`  ${color.bold}${targets.length} Service(s) werden ${verb}:${color.nc}`)
  for (const site of targets) {
    const state = isServiceActive(site.infactoryService) ? 'active' : 'stopped'
    log.log(`    ${site.tld}  [${state}]  ${site.infactoryService}`)
  }
}
