#!/usr/bin/env node
/**
 * seed-session13.js — Create Ghost Pages from arv.steirischursprung.at extraction
 *
 * Usage:
 *   INFACTORY_GHOST_URL=https://dev.steirischursprung.at \
 *   INFACTORY_GHOST_KEY=$(cat /tmp/.dev.ghost_key) \
 *   node seed-session13.js [--dry-run] [--slug=gasthaus]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ghostRequest } = require('./src/ghost-api');

const GHOST_URL = process.env.INFACTORY_GHOST_URL;
const GHOST_KEY = process.env.INFACTORY_GHOST_KEY;
const ARV_BASE = 'https://arv.steirischursprung.at';
const DRY_RUN = process.argv.includes('--dry-run');
const SLUG_FILTER = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1];

// Template content to filter out
const SKIP_TEXTS = [
  'Urlaub im schrägsten Hotel',
  'Urlaub im schrägsten Hotel der Welt',
  'Urlaub im schrägsten Hotel Österreichs',
  'Weitere Angebote & Pakete',
  'Weitere Säle & Veranstaltungsräume',
  'Unsere News & Termine',
  'Jetzt\n\n\nanfragen',
  'Mehr erfahren',
];

// Page definitions: slug → extracted JSON file + overrides
const PAGES = [
  { slug: 'gasthaus', file: 'gasthaus.json', title: "s'Wirtshaus" },
  { slug: 'erlebnishotel', file: 'erlebnishotel.json' },
  { slug: 'angebote-packages', file: 'angebote-packages.json', title: 'Angebote & Packages' },
  { slug: 'zimmer-preise', file: 'zimmer-preise.json', title: 'Zimmer & Preise' },
  { slug: 'bierempfehlung', file: 'bierempfehlung.json' },
  { slug: 'hochzeiten', file: 'hochzeiten.json', title: 'Hochzeiten' },
  { slug: 'seminar', file: 'seminar.json' },
  { slug: 'kontakt', file: 'kontakt.json' },
  { slug: 'datenschutz', file: 'datenschutz.json' },
  { slug: 'impressum', file: 'impressum.json' },
  { slug: 'gutscheine', file: 'gutscheine.json', title: 'Gutscheine' },
  { slug: 'veranstaltungssaele', file: 'veranstaltungssaele.json', title: 'Veranstaltungssäle' },
  { slug: 'zimmer-und-angebote-braustube', file: 'zimmer-und-angebote-braustube.json', title: 'Braustube' },
  { slug: 'zimmer-und-angebote-sonnenbierfuehrung', file: 'zimmer-und-angebote-sonnenbierfuehrung.json', title: 'Sonnenbierführungen' },
  { slug: 'zimmer-und-angebote-ursprung-tour', file: 'zimmer-und-angebote-ursprung-tour.json', title: 'Ursprung-Tour' },
];

function shouldSkip(text) {
  return SKIP_TEXTS.some(skip => text.includes(skip));
}

function cleanHtml(html) {
  // Remove inline styles that are BeTheme-specific
  return html
    .replace(/ style="[^"]*"/g, '')
    .replace(/<a class="button[^"]*"[^>]*>.*?<\/a>/g, '') // Remove BeTheme buttons
    .replace(/<hr class="no_line"[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContentHtml(data) {
  const parts = [];
  const title = data.title;

  for (const section of data.content) {
    const text = section.text.trim();
    // Skip if it's just the page title repeated
    if (text === title) continue;
    // Skip template content
    if (shouldSkip(text)) continue;
    // Skip very short fragments like "bis\n\n50\n\nPersonen" capacity badges
    // (these are visual elements, not text content)
    if (/^(bis|ab|nur)\n/i.test(text) && text.length < 30) continue;

    let html = cleanHtml(section.html);
    if (html.length > 0) {
      parts.push(html);
    }
  }

  return parts.join('\n');
}

function resolveImageUrl(imgPath) {
  if (!imgPath) return null;
  if (imgPath.startsWith('http')) return imgPath;
  return ARV_BASE + imgPath;
}

function toLexical(html) {
  return JSON.stringify({
    root: {
      children: [{ type: 'html', version: 1, html }],
      direction: null, format: '', indent: 0, type: 'root', version: 1
    }
  });
}

async function createPage(pageConfig) {
  const extractDir = '/tmp/arv-extract';
  const filePath = path.join(extractDir, pageConfig.file);

  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ File not found: ${filePath}`);
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const title = pageConfig.title || data.title;
  const featureImage = resolveImageUrl(data.headerImage);
  const contentHtml = buildContentHtml(data);
  const lexical = toLexical(contentHtml);

  console.log(`\n  📄 ${pageConfig.slug}`);
  console.log(`     Title: ${title}`);
  console.log(`     Image: ${featureImage || 'none'}`);
  console.log(`     Content: ${contentHtml.length} chars`);

  if (DRY_RUN) {
    console.log(`     [DRY-RUN] Would create page`);
    return { slug: pageConfig.slug, title, status: 'dry-run' };
  }

  const body = {
    pages: [{
      title,
      slug: pageConfig.slug,
      lexical,
      status: 'published',
      ...(featureImage ? { feature_image: featureImage } : {}),
    }]
  };

  try {
    const result = await ghostRequest('POST', GHOST_URL, GHOST_KEY, '/ghost/api/admin/pages/', body);
    if (result.pages && result.pages[0]) {
      console.log(`     ✔ Created: ${GHOST_URL}/${result.pages[0].slug}/`);
      return result.pages[0];
    } else {
      console.error(`     ✗ Unexpected response:`, JSON.stringify(result).substring(0, 200));
      return null;
    }
  } catch (err) {
    console.error(`     ✗ Error: ${err.message || JSON.stringify(err).substring(0, 200)}`);
    return null;
  }
}

async function main() {
  console.log('🌱 Session 13 — Ghost Page Seeder');
  console.log(`   Ghost: ${GHOST_URL}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  if (!GHOST_URL || !GHOST_KEY) {
    console.error('Missing INFACTORY_GHOST_URL or INFACTORY_GHOST_KEY');
    process.exit(1);
  }

  const pages = SLUG_FILTER
    ? PAGES.filter(p => p.slug === SLUG_FILTER)
    : PAGES;

  let created = 0, failed = 0;

  for (const pageConfig of pages) {
    const result = await createPage(pageConfig);
    if (result) created++; else failed++;
  }

  console.log(`\n✅ Done: ${created} created, ${failed} failed`);
}

main().catch(console.error);
