/**
 * lib/images-error.ts — Typisierte Fehler-Klasse für die Images-Pipeline.
 *
 * Pattern analog BuildError/DeployError/QaError. Sub-typing erlaubt dem
 * Command-Handler gezieltes `instanceof ImagesError` für saubere Exit-1-Pfade
 * vs. unbekannte Errors.
 *
 * Credential-Safety: ImagesError-Messages enthalten NIE Admin-Keys, JWTs
 * oder Upload-Response-Bodies (Ghost könnte Auth-Echo enthalten).
 *
 * Path-Traversal-Schutz: ImagesError wird auch geworfen wenn
 * `urlToLocalPath()` einen Fluchtversuch erkennt (siehe lib/images.ts).
 */

export class ImagesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImagesError'
  }
}
