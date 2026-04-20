/**
 * lib/deploy-error.ts — Typisierte Fehler-Klasse für die Deploy-Pipeline.
 *
 * Deploy ist wie Build all-or-nothing — throws statt Result-Type.
 * Analog zu BuildError, aber separates Naming damit Command-Handler
 * gezielt DeployError vs. BuildError unterscheiden können (z.B. für
 * Exit-Codes oder unterschiedliche Error-Render-Pfade).
 *
 * Credential-Safety: DeployError-Messages dürfen NIE Admin-Keys oder
 * JWTs enthalten. Nur public Facts: HTTP-Status, Ghost-URL, Theme-Name,
 * key-ID (public Teil vor ':' im Admin-Key).
 */

export class DeployError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeployError'
  }
}
