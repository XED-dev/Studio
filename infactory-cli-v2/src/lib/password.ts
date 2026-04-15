/**
 * lib/password.ts — Interaktive Passwort-Eingabe (TTY raw-mode)
 *
 * Extrahiert aus admin/create.ts, damit admin/reset-password die gleiche
 * Ctrl+C-sichere raw-mode Logik nutzen kann ohne Code-Duplikation.
 */

import * as readline from 'node:readline'

/**
 * Liest ein Passwort aus stdin ohne Echo auf das Terminal.
 *
 * Im TTY-Modus:
 *   - Raw-Mode, Echo unterdrückt
 *   - Backspace (\b / \u007F) wird verarbeitet
 *   - Ctrl+C (\u0003) bricht sofort mit Exit-Code 1 ab
 *
 * Nicht-interaktiv (Pipe, z.B. `echo pass | infactory ...`):
 *   - Standard readline, Eingabe wird als Passwort verwendet
 *
 * Wichtig: Der Ctrl+C-Handler ruft direkt `process.exit(1)` auf —
 * ein `throw` würde das Promise nicht durch den raw-mode-Callback
 * bis zum Command-Kontext propagieren.
 */
export async function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    })

    if (process.stdin.isTTY) {
      process.stderr.write(prompt)
      const stdin = process.stdin as NodeJS.ReadStream
      stdin.setRawMode?.(true)

      let password = ''
      const onData = (chunk: Buffer) => {
        const ch = chunk.toString('utf8')
        switch (ch) {
          case '\n':
          case '\r': {
            stdin.setRawMode?.(false)
            stdin.removeListener('data', onData)
            process.stderr.write('\n')
            rl.close()
            resolve(password)
            break
          }

          case '\u0003': {
            // Ctrl+C — direkter Prozess-Exit ist hier notwendig, weil
            // der Handler im raw-Mode läuft und kein oclif-Command-Kontext verfügbar ist.
            process.stderr.write('\n')
            // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- Ctrl+C Handler in raw-mode readline, kein Command-Kontext
            process.exit(1)
            break // unreachable, aber no-fallthrough will es sehen
          }

          case '\b':
          case '\u007F': {
            // Backspace
            password = password.slice(0, -1)
            break
          }

          default: {
            password += ch
          }
        }
      }

      stdin.on('data', onData)
      stdin.resume()
    } else {
      // Nicht-interaktiv: einfach readline
      rl.question(prompt, (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}
