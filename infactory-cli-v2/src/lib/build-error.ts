/**
 * lib/build-error.ts — Typisierte Fehler-Klasse für die Build-Pipeline.
 *
 * Build ist all-or-nothing → throws statt Result-Type. Die Klasse erlaubt dem
 * Command-Handler in `commands/build.ts`, gezielt BuildError von unerwarteten
 * Fehlern zu unterscheiden (z.B. via `instanceof BuildError`).
 */

export class BuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BuildError'
  }
}
