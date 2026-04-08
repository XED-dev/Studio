/**
 * mock-data.js — Ghost Content API Mock für inFactory Preview Server v0.3
 *
 * Simuliert exakt die Datenstrukturen, die Ghost an Handlebars-Templates
 * übergibt. Alle Felder entsprechen der Ghost Content API v5.
 *
 * Refs:
 *   https://ghost.org/docs/themes/contexts/
 *   https://ghost.org/docs/content-api/
 */

'use strict';

const path = require('path');
const fs   = require('fs');

/**
 * Lädt Mock-Daten aus einer optionalen JSON-Datei.
 * Falls nicht vorhanden → Default-Fixtures verwenden.
 *
 * @param {string|null} fixturePath - Pfad zu custom fixtures.json
 * @param {object}      preset      - Preset-YAML-Daten
 * @returns {object} mockData
 */
function loadMockData(fixturePath, preset) {
  if (fixturePath && fs.existsSync(fixturePath)) {
    try {
      const custom = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      return mergeMockData(buildDefaults(preset), custom);
    } catch (e) {
      console.warn(`  ⚠  Fixtures-Fehler: ${e.message} — Default-Daten werden verwendet`);
    }
  }
  return buildDefaults(preset);
}

function buildDefaults(preset) {
  const siteUrl   = 'http://localhost:2369';
  const now       = new Date().toISOString();
  const presetName = (preset && preset.name) || 'inFactory Preview';

  // ── @site / @blog Objekt ────────────────────────────────────────────────────
  const site = {
    title:           presetName,
    description:     (preset && preset.description) || 'Ghost Theme Preview — inFactory CLI',
    url:             siteUrl,
    logo:            `${siteUrl}/assets/img/logo.png`,
    cover_image:     'https://picsum.photos/seed/cover/1600/600',
    icon:            `${siteUrl}/favicon.ico`,
    twitter:         '@infactory',
    facebook:        'infactory',
    timezone:        'Europe/Berlin',
    locale:          'de',
    lang:            'de',
    navigation: [
      { label: 'Start',     url: siteUrl + '/',         current: true  },
      { label: 'Blog',      url: siteUrl + '/blog',     current: false },
      { label: 'Über uns',  url: siteUrl + '/about',    current: false },
      { label: 'Kontakt',   url: siteUrl + '/contact',  current: false },
    ],
    secondary_navigation: [
      { label: 'Impressum', url: siteUrl + '/imprint',  current: false },
      { label: 'Datenschutz', url: siteUrl + '/privacy', current: false },
    ],
    members_enabled:   true,
    members_invite_only: false,
    paid_members_enabled: true,
    allow_external_signup: true,
    member_support_address: 'hello@example.com',
    codeinjection_head: '',
    codeinjection_foot: '',
    accent_color:     (preset && preset.tokens && preset.tokens.color && preset.tokens.color.primary) || '#01696f',
  };

  // ── Mock Autoren ─────────────────────────────────────────────────────────────
  const authors = [
    {
      id:           '1',
      name:         'Alex Muster',
      slug:         'alex',
      email:        'alex@example.com',
      profile_image: 'https://picsum.photos/seed/alex/300/300',
      cover_image:  'https://picsum.photos/seed/alexcover/1200/400',
      bio:          'Alex schreibt über Design, Code und Open Source. Ghost-Theme-Entwickler bei inFactory.',
      website:      'https://example.com',
      twitter:      '@alexmuster',
      facebook:     'alexmuster',
      url:          `${siteUrl}/author/alex`,
      count:        { posts: 12 },
    },
    {
      id:           '2',
      name:         'Maria Schmidt',
      slug:         'maria',
      email:        'maria@example.com',
      profile_image: 'https://picsum.photos/seed/maria/300/300',
      cover_image:  'https://picsum.photos/seed/mariacover/1200/400',
      bio:          'Maria ist UX-Designerin und Ghost-Expertin. Sie liebt Typografie und saubere Layouts.',
      website:      'https://example.com',
      twitter:      '@mariaschmidt',
      facebook:     '',
      url:          `${siteUrl}/author/maria`,
      count:        { posts: 7 },
    },
  ];

  // ── Mock Tags ────────────────────────────────────────────────────────────────
  const tags = [
    {
      id:          't1',
      name:        'Design',
      slug:        'design',
      description: 'Artikel über UX, Typografie und visuelle Gestaltung.',
      feature_image: 'https://picsum.photos/seed/design/1200/400',
      accent_color: '#e11d48',
      url:         `${siteUrl}/tag/design`,
      count:       { posts: 8 },
      visibility:  'public',
    },
    {
      id:          't2',
      name:        'Open Source',
      slug:        'open-source',
      description: 'Tools, Projekte und Gedanken rund um Open Source Software.',
      feature_image: 'https://picsum.photos/seed/opensource/1200/400',
      accent_color: '#16a34a',
      url:         `${siteUrl}/tag/open-source`,
      count:       { posts: 5 },
      visibility:  'public',
    },
    {
      id:          't3',
      name:        'Ghost CMS',
      slug:        'ghost-cms',
      description: 'Tipps, Themes und Konfigurationen für Ghost.',
      feature_image: 'https://picsum.photos/seed/ghostcms/1200/400',
      accent_color: '#7c3aed',
      url:         `${siteUrl}/tag/ghost-cms`,
      count:       { posts: 4 },
      visibility:  'public',
    },
    {
      id:          't4',
      name:        'Produktivität',
      slug:        'produktivitaet',
      description: 'Workflows, Tools und Methoden für produktivere Arbeit.',
      feature_image: 'https://picsum.photos/seed/productivity/1200/400',
      accent_color: '#d97706',
      url:         `${siteUrl}/tag/produktivitaet`,
      count:       { posts: 6 },
      visibility:  'public',
    },
  ];

  // ── Post-Generator-Helper ────────────────────────────────────────────────────
  function makePost(i, opts = {}) {
    const slugs = [
      'wie-du-bessere-ghost-themes-baust',
      'open-source-template-fabrik-infactory',
      'typografie-fuer-entwickler',
      'ghost-cms-vs-wordpress-2025',
      'design-tokens-richtig-einsetzen',
      'hot-reload-preview-server-node',
      'color-systems-oklch-vs-hex',
      'ghost-members-konfigurieren',
      'infactory-v02-release',
      'handlebars-helpers-verstehen',
      'css-grid-vs-flexbox-2026',
      'monetarisierung-mit-ghost-memberships',
    ];
    const titles = [
      'Wie du bessere Ghost Themes baust',
      'Open Source Template-Fabrik: inFactory',
      'Typografie für Entwickler — der Praxisguide',
      'Ghost CMS vs. WordPress 2025',
      'Design Tokens richtig einsetzen',
      'Hot-Reload Preview Server mit Node.js',
      'Color Systems: OKLCH vs. HEX',
      'Ghost Members konfigurieren',
      'inFactory v0.2 — Release Notes',
      'Handlebars Helpers verstehen',
      'CSS Grid vs. Flexbox 2026',
      'Monetarisierung mit Ghost Memberships',
    ];
    const excerpts = [
      'Ein gutes Ghost Theme ist mehr als Design. Es ist ein System aus Tokens, Partials und einer klaren Struktur. Wir zeigen wie.',
      'Was wäre eine Open-Source-Fabrik für Ghost-Templates? Wir bauen sie — mit CLI, Presets und AI-gestütztem Composer.',
      'Typografie ist das Fundament jeder guten Website. Dieser Guide erklärt Fluid Type, Font-Pairing und die 12-px-Regel.',
      'Ghost CMS hat sich in den letzten Jahren stark entwickelt. Ein ehrlicher Vergleich mit WordPress aus Entwicklerperspektive.',
      'Design Tokens sind das Herzstück eines wiederverwendbaren Design-Systems. Wie setzt man sie in Ghost-Themes um?',
      'Ein lokaler Preview Server ohne Ghost zu installieren? Möglich — mit Express, express-hbs und chokidar.',
      'OKLCH vs. HEX: Warum das moderne Color System die bessere Wahl für Theme-Entwickler ist.',
      'Ghost Members richtig konfigurieren: Von der Basis-Einrichtung bis zu bezahlten Memberships.',
      'inFactory v0.2 ist fertig. Was steckt drin? Build-Pipeline, base-theme, 4 Presets und ein vollständiger CLI.',
      'Ghost Handlebars Helpers verstehen — von `{{#foreach}}` bis `{{ghost_head}}` erklärt.',
      'CSS Grid und Flexbox sind keine Konkurrenten. Wann was? Eine pragmatische Anleitung.',
      'Mit Ghost Memberships Umsatz erzielen — ohne Middleware, direkt aus dem CMS.',
    ];

    const idx         = (i - 1) % 12;
    const tag         = tags[idx % tags.length];
    const author      = authors[idx % authors.length];
    const publishedAt = new Date(Date.now() - (i * 3 * 24 * 60 * 60 * 1000)).toISOString();

    return {
      id:              String(i),
      uuid:            `mock-uuid-${i}`,
      title:           opts.title  || titles[idx],
      slug:            opts.slug   || slugs[idx],
      html:            opts.html   || buildMockHtml(titles[idx]),
      comment_id:      String(i),
      plaintext:       opts.plaintext || excerpts[idx],
      feature_image:   `https://picsum.photos/seed/post${i}/1200/630`,
      feature_image_alt: titles[idx],
      feature_image_caption: '',
      featured:        i <= 2,
      page:            false,
      status:          'published',
      locale:          null,
      visibility:      'public',
      created_at:      publishedAt,
      updated_at:      publishedAt,
      published_at:    publishedAt,
      custom_excerpt:  excerpts[idx],
      codeinjection_head: '',
      codeinjection_foot: '',
      custom_template: '',
      canonical_url:   null,
      tags:            [tag],
      authors:         [author],
      primary_author:  author,
      primary_tag:     tag,
      url:             `${siteUrl}/${slugs[idx]}`,
      excerpt:         excerpts[idx],
      reading_time:    Math.max(1, Math.ceil(excerpts[idx].split(' ').length / 200)),
      access:          true,
      comments:        false,
      og_image:        `https://picsum.photos/seed/post${i}/1200/630`,
      og_title:        titles[idx],
      og_description:  excerpts[idx],
      twitter_image:   `https://picsum.photos/seed/post${i}/1200/630`,
      twitter_title:   titles[idx],
      twitter_description: excerpts[idx],
      meta_title:      titles[idx],
      meta_description: excerpts[idx],
    };
  }

  // ── 12 Mock Posts ─────────────────────────────────────────────────────────────
  const posts = Array.from({ length: 12 }, (_, i) => makePost(i + 1));

  // ── Pagination ────────────────────────────────────────────────────────────────
  const pagination = {
    page:  1,
    limit: 9,
    pages: 2,
    total: 12,
    next:  2,
    prev:  null,
  };

  return { site, posts, authors, tags, pagination, siteUrl };
}

/**
 * Baut HTML-Inhalt für einen Mock-Post.
 */
function buildMockHtml(title) {
  return `
<p>Dies ist ein Vorschau-Artikel für das inFactory Preview System. Der echte Inhalt wird nach dem Upload in Ghost angezeigt.</p>

<h2>Über ${title}</h2>
<p>Ghost ist ein Open-Source-Publishing-System, das auf Node.js basiert. Es ist besonders für Creator, Newsletter-Betreiber und Blogs geeignet, die ein schnelles, schlankes CMS ohne unnötigen Overhead benötigen.</p>

<h3>Was macht Ghost besonders?</h3>
<p>Im Gegensatz zu WordPress setzt Ghost konsequent auf moderne Technologien: Node.js, Handlebars-Templates, ein natives Membership-System und eine saubere Content API. Das macht es schnell, sicher und einfach erweiterbar.</p>

<figure class="kg-card kg-image-card">
  <img src="https://picsum.photos/seed/${encodeURIComponent(title)}/900/500" alt="${title}" loading="lazy" width="900" height="500">
  <figcaption>Abbildung: Beispiel für ein Feature Image in Ghost</figcaption>
</figure>

<h3>Practical Use Case</h3>
<p>inFactory baut Ghost-Themes aus wiederverwendbaren Sections, Design-Tokens und Presets. Das Ergebnis ist ein Ghost-kompatibles Theme-ZIP, das direkt in Ghost Admin hochgeladen werden kann.</p>

<blockquote>
  <p>„Gute Tools entstehen, wenn Entwickler dieselben Probleme immer wieder lösen und irgendwann sagen: Das muss auch anders gehen."</p>
</blockquote>

<p>Der Preview Server zeigt das Theme lokal — ohne Ghost zu installieren, mit Hot Reload und gscan-Validierung direkt im Terminal.</p>
  `.trim();
}

/**
 * Deep-Merge zweier Objekte (custom überschreibt defaults).
 */
function mergeMockData(defaults, custom) {
  const result = { ...defaults };
  for (const [key, val] of Object.entries(custom)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = mergeMockData(defaults[key] || {}, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

module.exports = { loadMockData };
