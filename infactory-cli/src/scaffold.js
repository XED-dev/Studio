/**
 * scaffold.js — inFactory CLI Scaffolding v0.4
 *
 * `infactory new --name=mein-blog --preset=blog`
 *
 * Erstellt ein vollständiges, sofort nutzbares inFactory-Projektverzeichnis:
 *   mein-blog/
 *   ├── presets/         ← gewähltes Preset (kopiert + angepasst)
 *   ├── sections/        ← registry.json (Symlink-kompatibel)
 *   ├── base-theme/      ← Symlink oder Kopie je nach --mode
 *   ├── dist/            ← leer, wird bei build befüllt
 *   ├── .infactory.json  ← Projekt-Config
 *   ├── package.json     ← npm-Projekt mit infactory als devDep
 *   ├── .gitignore
 *   └── README.md
 *
 * Optionen:
 *   --name=<slug>        Projektname (required)
 *   --preset=<id>        Startpreset (default: blog)
 *   --out=<dir>          Elternverzeichnis (default: ./)
 *   --mode=copy|link     base-theme als Kopie oder Symlink (default: copy)
 *   --no-git             Kein git init
 *   --verbose
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Scaffolding-Pipeline
 */
async function scaffold(opts) {
  const {
    name,
    preset    = 'blog',
    parentDir = process.cwd(),
    mode      = 'copy',          // 'copy' | 'link'
    git       = true,
    verbose   = false,
  } = opts;

  const log  = verbose ? (m) => console.log(m) : () => {};
  const info = (m) => console.log(m);

  // ── Validierung ─────────────────────────────────────────────────────────────
  if (!name) throw new Error('--name fehlt. Beispiel: infactory new --name=mein-blog');

  const slug = toSlug(name);
  if (!slug) throw new Error(`Ungültiger Projektname: "${name}"`);

  const projectDir = path.join(parentDir, slug);
  if (fs.existsSync(projectDir)) {
    throw new Error(`Verzeichnis existiert bereits: ${projectDir}`);
  }

  // Suche inFactory-Installation (CLI-eigenes Verzeichnis)
  const cliRoot     = path.resolve(__dirname, '..', '..');  // generator/../..  = repo-root
  const presetsPool = path.join(cliRoot, 'presets');
  const baseThemePool = path.join(cliRoot, 'base-theme');

  const startTime = Date.now();
  info(`\n🏭 inFactory Scaffolding v0.4\n`);
  info(`  Projekt: ${slug}`);
  info(`  Preset:  ${preset}`);
  info(`  Pfad:    ${projectDir}\n`);

  // ── Verzeichnisstruktur ────────────────────────────────────────────────────
  const dirs = [
    projectDir,
    path.join(projectDir, 'presets'),
    path.join(projectDir, 'dist'),
    path.join(projectDir, '.infactory'),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
    log(`  mkdir  ${path.relative(parentDir, d)}`);
  }

  // ── Preset kopieren ─────────────────────────────────────────────────────────
  info('  [1/6] Preset...');
  const presetSrc = path.join(presetsPool, `${preset}.yaml`);
  const presetDst = path.join(projectDir, 'presets', `${preset}.yaml`);

  if (fs.existsSync(presetSrc)) {
    // Preset kopieren und Projekt-Metadaten einfügen
    let presetContent = fs.readFileSync(presetSrc, 'utf8');
    presetContent = presetContent.replace(
      /^# presets\/.*/m,
      `# presets/${preset}.yaml — ${slug}`
    );
    fs.writeFileSync(presetDst, presetContent, 'utf8');
    info(`         ✔ presets/${preset}.yaml`);
  } else {
    // Fallback: Minimal-Preset generieren
    const minimalPreset = buildMinimalPreset(preset, slug);
    fs.writeFileSync(presetDst, yaml.dump(minimalPreset, { lineWidth: 120 }), 'utf8');
    info(`         ✔ presets/${preset}.yaml (minimal, Preset-Pool nicht gefunden)`);
  }

  // ── base-theme verknüpfen / kopieren ────────────────────────────────────────
  info('  [2/6] base-theme...');
  const baseThemeDst = path.join(projectDir, 'base-theme');

  if (mode === 'link' && fs.existsSync(baseThemePool)) {
    // Symlink: Updates am base-theme greifen sofort durch
    fs.symlinkSync(baseThemePool, baseThemeDst, 'dir');
    info(`         ✔ base-theme → Symlink (${baseThemePool})`);
  } else if (fs.existsSync(baseThemePool)) {
    // Kopie: Projekt ist vollständig standalone
    copyDirRecursive(baseThemePool, baseThemeDst, log);
    info(`         ✔ base-theme (Kopie)`);
  } else {
    // Pool nicht gefunden → Minimal-Platzhalter
    fs.mkdirSync(baseThemeDst, { recursive: true });
    fs.mkdirSync(path.join(baseThemeDst, 'partials'), { recursive: true });
    fs.writeFileSync(
      path.join(baseThemeDst, 'index.hbs'),
      '{{!-- inFactory base-theme placeholder --}}\n',
      'utf8'
    );
    info(`         ⚠ base-theme (Platzhalter — base-theme Pool nicht gefunden)`);
  }

  // ── sections/registry.json ──────────────────────────────────────────────────
  info('  [3/6] sections/registry.json...');
  const sectionsSrc = path.join(cliRoot, 'sections');
  const sectionsDst = path.join(projectDir, 'sections');

  if (fs.existsSync(sectionsSrc)) {
    copyDirRecursive(sectionsSrc, sectionsDst, log);
    info(`         ✔ sections/ (aus Pool)`);
  } else {
    fs.mkdirSync(sectionsDst, { recursive: true });
    fs.writeFileSync(
      path.join(sectionsDst, 'registry.json'),
      JSON.stringify(buildMinimalRegistry(), null, 2),
      'utf8'
    );
    info(`         ✔ sections/registry.json (minimal)`);
  }

  // ── .infactory.json — Projekt-Config ────────────────────────────────────────
  info('  [4/6] Projekt-Config...');
  const config = {
    version:   '0.4',
    name:      slug,
    preset,
    created:   new Date().toISOString(),
    generator: '@infactory/cli',
    build: {
      outputDir:    './dist',
      baseThemeDir: './base-theme',
      presetsDir:   './presets',
      registryPath: './sections/registry.json',
    },
    preview: {
      port: 2369,
      open: true,
    },
    studio: {
      // Studio-Kompatibilitäts-Block — wird von @infactory/studio v1 gelesen
      enabled: false,
      api:     'http://localhost:2370',
    },
  };
  fs.writeFileSync(
    path.join(projectDir, '.infactory.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
  info(`         ✔ .infactory.json`);

  // ── package.json ─────────────────────────────────────────────────────────────
  info('  [5/6] package.json + .gitignore + README...');
  const pkg = {
    name:    slug,
    version: '0.1.0',
    private: true,
    scripts: {
      build:   `infactory build --preset=${preset}`,
      preview: `infactory preview --preset=${preset}`,
      zip:     `infactory build --preset=${preset} --zip`,
      validate:`infactory sections validate`,
    },
    devDependencies: {
      '@infactory/cli': '^0.4.0',
    },
  };
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
    'utf8'
  );

  // ── .gitignore ────────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(projectDir, '.gitignore'), [
    'node_modules/',
    'dist/',
    '*.zip',
    '.DS_Store',
    '.infactory/cache/',
  ].join('\n') + '\n', 'utf8');

  // ── README.md ─────────────────────────────────────────────────────────────────
  const readme = buildReadme(slug, preset);
  fs.writeFileSync(path.join(projectDir, 'README.md'), readme, 'utf8');
  info(`         ✔ package.json, .gitignore, README.md`);

  // ── git init ──────────────────────────────────────────────────────────────────
  if (git) {
    info('  [6/6] git init...');
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: projectDir, stdio: 'pipe' });
      execSync('git add -A', { cwd: projectDir, stdio: 'pipe' });
      execSync(`git commit -m "init: inFactory ${slug} (${preset} preset)"`,
        { cwd: projectDir, stdio: 'pipe' });
      info(`         ✔ git init + initial commit`);
    } catch (e) {
      info(`         ⚠ git nicht verfügbar — übersprungen`);
    }
  } else {
    info('  [6/6] git init übersprungen (--no-git)');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  info(`\n✅ Projekt erstellt in ${elapsed}s`);
  info(`\n  Nächste Schritte:`);
  info(`\n    cd ${slug}`);
  info(`    npm install`);
  info(`    infactory preview --preset=${preset}\n`);

  return { ok: true, projectDir, slug, preset, elapsed };
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[äöüÄÖÜß]/g, c => ({ ä:'ae',ö:'oe',ü:'ue',Ä:'ae',Ö:'oe',Ü:'ue',ß:'ss' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function copyDirRecursive(src, dst, log) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, dstPath, log);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      log(`    copy  ${path.relative(dst, dstPath)}`);
    }
  }
}

function buildMinimalPreset(presetId, slug) {
  return {
    id:          presetId,
    name:        slug,
    description: `inFactory Theme — ${slug}`,
    tokens: {
      color: { primary: '#01696f', primary_hover: '#0c4e54' },
      font:  { display: "'Instrument Serif', 'Georgia', serif", body: "'Work Sans', sans-serif" },
    },
    layout: { home: ['hero_centered', 'posts_grid_3col', 'cta_newsletter'] },
    ghost:  { posts_per_page: 9, members_enabled: true },
  };
}

function buildMinimalRegistry() {
  return {
    version: '0.4',
    categories: {
      hero:  { label: 'Hero',  icon: '◈' },
      posts: { label: 'Posts', icon: '◧' },
      cta:   { label: 'CTA',   icon: '◆' },
    },
    sections: [
      { id: 'hero_centered',   label: 'Hero Centered',   category: 'hero',  partial: 'sections/hero/hero-centered.hbs',   schema: 'sections/hero/hero-centered.json',   presets: ['blog','studio'] },
      { id: 'posts_grid_3col', label: 'Posts Grid 3-Col', category: 'posts', partial: 'sections/posts/posts-grid-3col.hbs', schema: 'sections/posts/posts-grid-3col.json', presets: ['agency','saas','blog','studio'] },
      { id: 'cta_newsletter',  label: 'CTA Newsletter',  category: 'cta',   partial: 'sections/cta/cta-newsletter.hbs',   schema: 'sections/cta/cta-newsletter.json',   presets: ['saas','blog'] },
    ],
  };
}

function buildReadme(slug, preset) {
  return `# ${slug}

Ghost Theme gebaut mit [inFactory CLI](https://github.com/infactory-com/infactory) — Preset: \`${preset}\`

## Schnellstart

\`\`\`bash
npm install
infactory preview --preset=${preset}
\`\`\`

## Befehle

| Befehl | Aktion |
|--------|--------|
| \`npm run preview\` | Lokaler Preview Server (Port 2369) |
| \`npm run build\`   | Ghost-Theme bauen |
| \`npm run zip\`     | Ghost-Theme bauen + ZIP für Upload |
| \`npm run validate\`| Section-Registry validieren |

## Projektstruktur

\`\`\`
${slug}/
├── presets/${preset}.yaml   ← Design-Tokens, Layout, Ghost-Config
├── base-theme/              ← Ghost Handlebars Templates
├── sections/registry.json   ← Section-Registry
├── dist/                    ← Build-Output (nicht einchecken)
├── .infactory.json          ← Projekt-Config
└── package.json
\`\`\`

## Theme deployen

1. \`npm run zip\` → erzeugt \`dist/infactory-${preset}.zip\`
2. Ghost Admin → Design → Theme hochladen
3. Theme aktivieren

## inFactory Studio

Dieses Projekt ist kompatibel mit dem kommenden **inFactory Studio** (Visual Editor).
Die \`studio\`-Config in \`.infactory.json\` wird automatisch erkannt.

---
*Erstellt mit [inFactory CLI](https://github.com/infactory-com/infactory) v0.4 — MIT License*
`;
}

module.exports = { scaffold, toSlug };
