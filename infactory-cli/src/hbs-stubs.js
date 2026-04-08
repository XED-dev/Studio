/**
 * hbs-stubs.js — Ghost Handlebars Helper Stubs für inFactory Preview Server v0.3
 *
 * Ghost-interne Helpers existieren nicht in express-hbs.
 * Diese Stubs geben sinnvolle Fallback-Werte zurück, damit Templates
 * fehlerfrei rendern, auch wenn die echte Ghost-Logik fehlt.
 *
 * Jeder Stub ist dokumentiert:
 *   [STUB]   = gibt leeren String oder einfachen HTML-Kommentar zurück
 *   [MOCK]   = gibt simulierten Output zurück (sichtbar im Preview)
 *   [PASSTHROUGH] = delegiert an Handlebars-nativ
 */

'use strict';

const Handlebars = require('handlebars');
const SafeString = Handlebars.SafeString;

/**
 * Registriert alle Ghost-Stubs an einer hbs-Instanz.
 * @param {object} hbs - express-hbs Instanz
 */
function registerGhostStubs(hbs) {
  const H = hbs.handlebars;

  // ── Meta / Head ──────────────────────────────────────────────────────────────

  // [MOCK] Gibt Preview-freundliche <head>-Tags zurück
  H.registerHelper('ghost_head', function() {
    return new SafeString(`
<!-- ghost_head stub — inFactory Preview -->
<meta name="generator" content="Ghost (inFactory Preview)">
<link rel="stylesheet" href="/assets/css/tokens.css">
    `.trim());
  });

  // [MOCK] Schließt <body> sauber ab
  H.registerHelper('ghost_foot', function() {
    return new SafeString(`
<!-- ghost_foot stub — inFactory Preview -->
<script>
  /* Preview Hot-Reload */
  if (typeof EventSource !== 'undefined') {
    var es = new EventSource('/__infactory/reload');
    es.onmessage = function() { location.reload(); };
  }
</script>
    `.trim());
  });

  // ── URL-Helpers ──────────────────────────────────────────────────────────────

  // [PASSTHROUGH] absolute_url gibt URL direkt zurück
  H.registerHelper('absolute_url', function(url) {
    if (typeof url === 'string') return url;
    return 'http://localhost:2369';
  });

  // [MOCK] asset gibt /assets/<path> zurück
  H.registerHelper('asset', function(assetPath) {
    if (typeof assetPath === 'string') return `/assets/${assetPath}`;
    return '/assets/';
  });

  // ── Date / Time ──────────────────────────────────────────────────────────────

  // [MOCK] date formatiert ein Datum
  H.registerHelper('date', function(date, options) {
    try {
      const d   = date ? new Date(date) : new Date();
      const fmt = (options && options.hash && options.hash.format) || 'DD. MMMM YYYY';
      // Einfache Deutsch-Formatierung ohne externe Lib
      const months = ['Januar','Februar','März','April','Mai','Juni',
                      'Juli','August','September','Oktober','November','Dezember'];
      return fmt
        .replace('YYYY', d.getFullYear())
        .replace('MM',   String(d.getMonth()+1).padStart(2,'0'))
        .replace('DD',   String(d.getDate()).padStart(2,'0'))
        .replace('MMMM', months[d.getMonth()])
        .replace('MMM',  months[d.getMonth()].slice(0,3));
    } catch { return ''; }
  });

  // [MOCK] timeago gibt relativen Zeitstempel zurück
  H.registerHelper('timeago', function(date) {
    try {
      const diff = Math.floor((Date.now() - new Date(date)) / 1000);
      if (diff < 60)   return 'gerade eben';
      if (diff < 3600) return `vor ${Math.floor(diff/60)} Min.`;
      if (diff < 86400) return `vor ${Math.floor(diff/3600)} Std.`;
      return `vor ${Math.floor(diff/86400)} Tagen`;
    } catch { return ''; }
  });

  // ── Content / Formatting ─────────────────────────────────────────────────────

  // [PASSTHROUGH] excerpt gibt einen gekürzten Text zurück
  H.registerHelper('excerpt', function(options) {
    const words  = (options.hash && options.hash.words)  || 50;
    const chars  = (options.hash && options.hash.characters) || 0;
    const ctx    = this;
    let text = ctx.custom_excerpt || ctx.excerpt || ctx.plaintext || '';
    text = text.replace(/<[^>]+>/g, '').trim();
    if (chars > 0) return text.slice(0, chars) + (text.length > chars ? '…' : '');
    const arr = text.split(/\s+/);
    return arr.slice(0, words).join(' ') + (arr.length > words ? '…' : '');
  });

  // [STUB] reading_time — reading_time liegt schon im Post-Objekt
  H.registerHelper('reading_time', function(options) {
    const ctx    = this;
    const minute = (options.hash && options.hash.minute) || '1 min read';
    const minutes= (options.hash && options.hash.minutes)|| '% min read';
    const rt     = ctx.reading_time || 1;
    return rt <= 1 ? minute : minutes.replace('%', rt);
  });

  // ── Conditional Helpers ──────────────────────────────────────────────────────

  // [MOCK] is — vergleicht Kontext-Typ, Preview gibt für home/index/post true
  H.registerHelper('is', function(contexts, options) {
    const ctxList = (typeof contexts === 'string' ? contexts : '').split(',').map(s => s.trim());
    // Im Preview-Kontext immer fn ausführen (alle Kontexte sichtbar)
    return options.fn ? options.fn(this) : '';
  });

  // [MOCK] has — prüft ob Feature vorhanden ist
  H.registerHelper('has', function(options) {
    // Im Preview alle Features als vorhanden markieren
    if (options.fn) return options.fn(this);
    return true;
  });

  // ── Members / Payments ───────────────────────────────────────────────────────

  // [MOCK] members_enabled — Preview: immer true
  H.registerHelper('members_enabled', function(options) {
    if (options && options.fn) return options.fn(this);
    return true;
  });

  // [MOCK] members_support_address
  H.registerHelper('members_support_address', function() {
    return 'hello@example.com';
  });

  // [STUB] price gibt formatierten Preis zurück
  H.registerHelper('price', function(options) {
    const amount   = (options.hash && options.hash.plan && options.hash.plan.amount) || 500;
    const currency = (options.hash && options.hash.plan && options.hash.plan.currency) || 'EUR';
    const period   = (options.hash && options.hash.plan && options.hash.plan.interval) || 'month';
    const fmt      = (amount / 100).toFixed(2).replace('.', ',');
    return new SafeString(`${fmt}&thinsp;${currency}<small>/${period}</small>`);
  });

  // [STUB] membership_info gibt Stub-Objekt zurück
  H.registerHelper('membership_info', function() {
    return new SafeString('<!-- membership_info stub -->');
  });

  // ── Navigation ───────────────────────────────────────────────────────────────

  // [MOCK] navigation rendert die nav-Punkte aus @site.navigation
  H.registerHelper('navigation', function(options) {
    // In Ghost wird die Navigation über den Template-Context geliefert.
    // Im Preview: einfachen Fallback-Nav rendern falls Template kein Partial hat.
    const navItems = (this && this.navigation) || [];
    if (!navItems.length) return new SafeString('<!-- navigation stub: @site.navigation leer -->');
    const links = navItems.map(item => {
      const active = item.current ? ' aria-current="page"' : '';
      return `<li><a href="${item.url}"${active}>${item.label}</a></li>`;
    }).join('\n    ');
    return new SafeString(`<ul class="nav-list">\n    ${links}\n  </ul>`);
  });

  // ── Pagination ───────────────────────────────────────────────────────────────

  // [MOCK] page_url gibt URL zur Seite zurück
  H.registerHelper('page_url', function(page) {
    return page === 1 ? '/' : `/page/${page}`;
  });

  // ── Social / SEO ─────────────────────────────────────────────────────────────

  // [STUB] twitter_url, facebook_url
  H.registerHelper('twitter_url',  function(handle) { return handle ? `https://twitter.com/${handle}` : ''; });
  H.registerHelper('facebook_url', function(handle) { return handle ? `https://facebook.com/${handle}` : ''; });

  // [STUB] foreach — Alias für Handlebars #each mit Ghost-spezifischen @first/@last
  H.registerHelper('foreach', function(context, options) {
    if (!context || !context.length) return options.inverse ? options.inverse(this) : '';
    return context.map((item, i) => {
      const data = {
        first:   i === 0,
        last:    i === context.length - 1,
        index:   i,
        number:  i + 1,
      };
      return options.fn(item, { data });
    }).join('');
  });

  // [STUB] get — Ghost Data Helper (async, ruft Content API auf)
  // Im Preview: gibt ein leeres Array oder die vorhandenen mock-posts zurück
  H.registerHelper('get', function(resource, options) {
    // Im Preview-Kontext geben wir die Mock-Daten aus dem Template-Context zurück
    const ctx = this;
    const mockPosts = (ctx && ctx._mockPosts) || [];
    const result = { posts: mockPosts, tags: [], authors: [] };
    if (options && options.fn) {
      return options.fn(result[resource] ? { [resource]: result[resource] } : {});
    }
    return '';
  });

  // ── Utility ──────────────────────────────────────────────────────────────────

  // [PASSTHROUGH] encode gibt encoded URL zurück
  H.registerHelper('encode', function(str) {
    return encodeURIComponent(String(str || ''));
  });

  // [MOCK] plural gibt richtige Singular/Plural-Form zurück
  H.registerHelper('plural', function(number, options) {
    const singular = options.hash && options.hash.singular || '';
    const plural   = options.hash && options.hash.plural   || '';
    const empty    = options.hash && options.hash.empty    || '';
    if (!number || number === 0) return empty;
    return number === 1 ? singular.replace('%', number) : plural.replace('%', number);
  });

  // [STUB] t — i18n Translation (einfacher Passthrough)
  H.registerHelper('t', function(key) { return key || ''; });

  // [STUB] lang gibt Sprach-Attribut zurück
  H.registerHelper('lang', function() { return 'de'; });

  // [STUB] block / contentFor (express-hbs hat das, aber doppelt schadet nicht)
  if (!H.helpers['block']) {
    H.registerHelper('block', function(name, options) {
      return options && options.fn ? options.fn(this) : '';
    });
  }
}

module.exports = { registerGhostStubs };
