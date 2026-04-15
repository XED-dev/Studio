/**
 * lib/output.ts — Farbige Terminal-Ausgabe für inFactory CLI
 *
 * TTY-aware: Farben nur im Terminal, nicht in Cron-Logs oder Pipes.
 */

const isTTY = process.stdout.isTTY ?? false

export const color = {
  blue:   isTTY ? '\u001B[0;34m' : '',
  bold:   isTTY ? '\u001B[1m'    : '',
  green:  isTTY ? '\u001B[0;32m' : '',
  nc:     isTTY ? '\u001B[0m'    : '',
  red:    isTTY ? '\u001B[0;31m' : '',
  yellow: isTTY ? '\u001B[0;33m' : '',
}

export const icon = {
  err:  `${color.red}\u2718${color.nc}`,
  info: `${color.blue}\u2192${color.nc}`,
  ok:   `${color.green}\u2714${color.nc}`,
  warn: `${color.yellow}\u26A0${color.nc}`,
}
