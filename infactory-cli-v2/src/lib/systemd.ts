/**
 * lib/systemd.ts — systemd Service-Management für inFactory CLI
 *
 * Wrapper um systemctl-Befehle mit strukturierter Rückgabe.
 */

import {execSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

export interface ServiceStatus {
  active: boolean
  enabled: boolean
}

/**
 * Prüft ob ein systemd Service aktiv (running) ist.
 */
export function isServiceActive(service: string): boolean {
  try {
    execSync(`systemctl is-active --quiet ${service}`, {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

/**
 * Prüft ob ein systemd Service enabled ist.
 */
export function isServiceEnabled(service: string): boolean {
  try {
    execSync(`systemctl is-enabled --quiet ${service}`, {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

/**
 * Gibt den kombinierten Status eines Services zurück.
 */
export function getServiceStatus(service: string): ServiceStatus {
  return {
    active: isServiceActive(service),
    enabled: isServiceEnabled(service),
  }
}

/**
 * Startet einen Service neu. Wartet `waitSec` Sekunden und prüft dann den Status.
 * Gibt true zurück wenn der Service danach aktiv ist.
 */
export function restartService(service: string, waitSec = 2): boolean {
  try {
    execSync(`systemctl restart ${service}`, {stdio: 'pipe'})
    if (waitSec > 0) {
      execSync(`sleep ${waitSec}`, {stdio: 'pipe'})
    }

    return isServiceActive(service)
  } catch {
    return false
  }
}

/**
 * Startet einen Service (falls gestoppt). Wartet `waitSec` Sekunden.
 * Gibt true zurück wenn der Service danach aktiv ist.
 */
export function startService(service: string, waitSec = 2): boolean {
  try {
    execSync(`systemctl start ${service}`, {stdio: 'pipe'})
    if (waitSec > 0) {
      execSync(`sleep ${waitSec}`, {stdio: 'pipe'})
    }

    return isServiceActive(service)
  } catch {
    return false
  }
}

/**
 * Stoppt einen Service. Wartet `waitSec` Sekunden und prüft dann den Status.
 * Gibt true zurück wenn der Service danach NICHT mehr aktiv ist.
 */
export function stopService(service: string, waitSec = 2): boolean {
  try {
    execSync(`systemctl stop ${service}`, {stdio: 'pipe'})
    if (waitSec > 0) {
      execSync(`sleep ${waitSec}`, {stdio: 'pipe'})
    }

    return !isServiceActive(service)
  } catch {
    return false
  }
}

/**
 * `systemctl daemon-reload` — nach Unit-File-Änderungen aufrufen.
 */
export function daemonReload(): boolean {
  try {
    execSync('systemctl daemon-reload', {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

/**
 * Aktiviert einen Service (Autostart beim Boot).
 * Gibt true zurück bei Erfolg — fehlschlagen kann enable z.B. wenn die Unit-Datei
 * nicht existiert oder der Service-Name ungültig ist.
 */
export function enableService(service: string): boolean {
  try {
    execSync(`systemctl enable ${service}`, {stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

// ── Unit-File-Rendering + Schreiben ────────────────────────────────────────

export interface PayloadUnitParams {
  envFile: string
  installDir: string
  port: number
  tld: string
}

/**
 * Erzeugt das systemd-Unit-File für einen Studio-Payload-Service als String.
 * User g-host, Port über CLI-Flag an next start übergeben.
 */
export function renderPayloadUnit(params: PayloadUnitParams): string {
  const {envFile, installDir, port, tld} = params
  return `[Unit]
Description=Studio-Payload — Puck Editor (${tld})
After=network.target

[Service]
Type=simple
User=g-host
Group=g-host
WorkingDirectory=${installDir}
EnvironmentFile=${envFile}
ExecStart=/usr/bin/node ${installDir}/node_modules/next/dist/bin/next start -p ${port}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`
}

/**
 * Schreibt das Unit-File nach /etc/systemd/system/<service>.service
 * und macht daemon-reload. Gibt den vollständigen Pfad zurück.
 */
export function writePayloadUnit(service: string, params: PayloadUnitParams): string {
  const unitPath = join('/etc/systemd/system', `${service}.service`)
  writeFileSync(unitPath, renderPayloadUnit(params))
  daemonReload()
  return unitPath
}
