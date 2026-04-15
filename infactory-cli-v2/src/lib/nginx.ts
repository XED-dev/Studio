/**
 * lib/nginx.ts — NGINX-Config-Snippets für inFactory CLI
 *
 * Rendert die Location-Blocks, die der User manuell in seine WordOps-Site-Config
 * einbauen muss. Automatisches Schreiben ist bewusst NICHT vorgesehen — die
 * Site-Config wird per `wo site edit <tld>` gepflegt, nicht durch diese CLI.
 *
 * Das Snippet-Muster stammt aus Session 25 (Redirect-Loop-Fix):
 * zwei Regex-Locations statt einer — damit hardcoded fetch('/api/auth/...')
 * aus @delmaredigital/payload-better-auth (Upstream-Bug) via rewrite kompensiert
 * wird, während /studio ohne trailing slash durch den $-Anker abgefangen wird.
 */

/**
 * Erzeugt das zwei-Location-Snippet für eine Studio-Payload-Site auf dem gegebenen Port.
 * Ausgabe ist rohes NGINX-Syntax, geeignet für Tooltip-Print oder Include-File-Generation.
 */
export function renderLocationsSnippet(port: number): string {
  return `# Studio + Admin + Puck-Editor (URI unverändert)
location ~ ^/studio(/|$) {
    proxy_pass http://127.0.0.1:${port};
    include /etc/nginx/proxy/payload.conf;
}

# Next.js-Assets + API + Media (basePath-Kompensat für Plugin-Hardcodes)
location ~ ^/(_next|api|next|media|__nextjs)(/|$) {
    rewrite ^(.*)$ /studio$1 break;
    proxy_pass http://127.0.0.1:${port};
    include /etc/nginx/proxy/payload.conf;
}`
}
