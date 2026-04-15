/**
 * lib/admin.ts — User-Management-Operationen auf Payload SQLite-DB
 *
 * Wird von den admin-Commands (create/list/set-role/reset-password/delete) genutzt.
 * Alle DB-Operationen laufen als execSync-Aufrufe auf sqlite3 — kein Test-Mocking
 * (laut Test-Strategie im CC, Zeile "sqlite3-Queries = NEIN").
 *
 * Security: Alle User-Inputs (Email, Rolle) werden via escapeSql() gegen
 * Single-Quote-Injection geschützt. Da die CLI nur als root läuft und die
 * Eingaben aus Command-Args kommen, ist das ein Defense-in-Depth-Schutz.
 */

import {execSync} from 'node:child_process'

export type Role = 'admin' | 'user'

export interface AdminUser {
  createdAt: string
  email: string
  id: string
  role: string
}

// ── SQLite3 execSync-Wrapper ───────────────────────────────────────────────

/**
 * Führt einen SQL-Query gegen eine SQLite-DB aus.
 * Gibt den rohen Output zurück (Pipe-separated Rows bei SELECT, leer bei UPDATE/DELETE).
 * Bei Fehler: leerer String.
 */
export function sqlite3Query(dbPath: string, query: string): string {
  try {
    return execSync(`sqlite3 "${dbPath}" "${query}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

/**
 * Escape Single-Quotes für SQL-String-Literale (doppeln nach SQL-Standard).
 */
export function escapeSql(s: string): string {
  return s.replaceAll("'", "''")
}

// ── User-Queries ───────────────────────────────────────────────────────────

/**
 * Alle User aus der DB, sortiert nach ID.
 */
export function listUsers(dbPath: string): AdminUser[] {
  const raw = sqlite3Query(
    dbPath,
    'SELECT id, role, email, created_at FROM users ORDER BY id;',
  )
  if (!raw) return []

  return raw.split('\n').map((line) => {
    const [id, role, email, createdAt] = line.split('|')
    return {createdAt, email, id, role}
  })
}

/**
 * Einzelner User anhand der Email. `null` wenn nicht gefunden.
 */
export function findUserByEmail(dbPath: string, email: string): AdminUser | null {
  const raw = sqlite3Query(
    dbPath,
    `SELECT id, role, email, created_at FROM users WHERE email='${escapeSql(email)}';`,
  )
  if (!raw) return null

  const [id, role, e, createdAt] = raw.split('|')
  return {createdAt, email: e, id, role}
}

/**
 * Anzahl aktiver Admin-User.
 */
export function countAdmins(dbPath: string): number {
  const raw = sqlite3Query(dbPath, "SELECT count(*) FROM users WHERE role='admin';")
  return Number.parseInt(raw, 10) || 0
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Setzt die Rolle eines Users auf admin/user.
 */
export function setUserRole(dbPath: string, email: string, role: Role): void {
  sqlite3Query(
    dbPath,
    `UPDATE users SET role='${role}' WHERE email='${escapeSql(email)}';`,
  )
}

/**
 * Löscht einen User inklusive seiner Sessions und Accounts (Foreign-Key-Kaskade).
 * Der Aufrufer muss die Safety-Checks (letzter Admin?) VORHER gemacht haben.
 */
export function deleteUserById(dbPath: string, userId: string): void {
  sqlite3Query(dbPath, `DELETE FROM sessions WHERE user_id='${escapeSql(userId)}';`)
  sqlite3Query(dbPath, `DELETE FROM accounts WHERE user_id='${escapeSql(userId)}';`)
  sqlite3Query(dbPath, `DELETE FROM users WHERE id='${escapeSql(userId)}';`)
}

// ── Safety-Checks ──────────────────────────────────────────────────────────

/**
 * Prüft, ob eine Aktion auf dem User sicher ist ODER den letzten Admin entfernen würde.
 *
 * Gibt `true` zurück, wenn die Aktion OK ist (User existiert nicht als Admin oder
 * es gibt mindestens einen weiteren Admin).
 * Gibt `false` zurück, wenn der User der einzige Admin ist und die Aktion ihn
 * degradieren oder löschen würde.
 */
export function canDegradeOrDelete(dbPath: string, email: string): boolean {
  const user = findUserByEmail(dbPath, email)
  if (!user || user.role !== 'admin') return true // nicht-Admin → sicher
  return countAdmins(dbPath) > 1
}
