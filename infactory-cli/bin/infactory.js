#!/usr/bin/env node
/**
 * bin/infactory.js — inFactory CLI Entry Point v1.0
 * Server:  install, start, stop, restart, status, update
 * Theme:   new, build, preview, deploy, list, section, preset, config
 * Ghost:   ghost restart
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const args    = process.argv.slice(2);
const command = args[0];

const opts = {};
for (const arg of args.slice(1)) {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) opts[match[1]] = match[2] !== undefined ? match[2] : true;
}

function loadProjectConfig(cwd) {
  const cfgPath = path.join(cwd, '.infactory.json');
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return null; }
  }
  return null;
}

const cwd        = process.cwd();
const projectCfg = loadProjectConfig(cwd);

function resolveOpt(key, cfgPath, fallback) {
  if (opts[key] !== undefined) return opts[key];
  if (projectCfg) {
    const parts = cfgPath.split('.');
    let val = projectCfg;
    for (const p of parts) { val = val && val[p]; }
    if (val !== undefined) return val;
  }
  return fallback;
}

function resolvePaths() {
  return {
    presetsDir:   path.join(cwd, resolveOpt('presetsDir',   'build.presetsDir',   'presets')),
    registryPath: path.join(cwd, resolveOpt('registryPath', 'build.registryPath', 'sections/registry.json')),
    baseThemeDir: path.join(cwd, resolveOpt('baseThemeDir', 'build.baseThemeDir', 'base-theme')),
    outputDir:    opts.out ? path.resolve(opts.out) : path.join(cwd, resolveOpt('outputDir', 'build.outputDir', 'dist')),
  };
}

async function run() {
  const { build, listPresets } = require('../src/build');

  switch (command) {

    // ── Server Management ────────────────────────────────────────────────────
    case 'install': {
      const { install } = require('../src/server-manager');
      await install({ verbose: !!opts.verbose });
      break;
    }
    case 'start': {
      const { start } = require('../src/server-manager');
      start();
      break;
    }
    case 'stop': {
      const { stop } = require('../src/server-manager');
      stop();
      break;
    }
    case 'restart': {
      const { restart } = require('../src/server-manager');
      restart();
      break;
    }
    case 'status': {
      const { status } = require('../src/server-manager');
      status();
      break;
    }
    case 'update': {
      const { update } = require('../src/server-manager');
      update({ verbose: !!opts.verbose });
      break;
    }
    case 'ghost': {
      const sub = args[1];
      if (sub === 'restart') {
        const { ghostRestart } = require('../src/server-manager');
        ghostRestart();
      } else {
        console.log('  Befehle: infactory ghost restart\n');
      }
      break;
    }

    // ── new ──────────────────────────────────────────────────────────────────
    case 'new': {
      if (!opts.name) { console.error('\n  ✗  --name fehlt.'); process.exit(1); }
      const { scaffold } = require('../src/scaffold');
      try {
        await scaffold({
          name: opts.name, preset: opts.preset || 'blog',
          parentDir: opts.out ? path.resolve(opts.out) : cwd,
          mode: opts.mode || 'copy', git: !opts['no-git'], verbose: !!opts.verbose,
        });
      } catch (err) { console.error(`\n  ✗  ${err.message}`); process.exit(1); }
      break;
    }

    // ── build ────────────────────────────────────────────────────────────────
    case 'build': {
      const preset = resolveOpt('preset', 'preset', null);
      if (!preset) { console.error('\n  ✗  --preset fehlt.'); process.exit(1); }
      const p = resolvePaths();
      try { await build({ preset, ...p, zip: !!opts.zip, verbose: !!opts.verbose }); }
      catch (err) { console.error(`\n  ✗  ${err.message}`); process.exit(1); }
      break;
    }

    // ── preview ──────────────────────────────────────────────────────────────
    case 'preview': {
      const preset = resolveOpt('preset', 'preset', null);
      if (!preset) { console.error('\n  ✗  --preset fehlt.'); process.exit(1); }
      const { startPreviewServer } = require('../src/preview-server');
      const p = resolvePaths();
      try {
        await startPreviewServer({
          preset, ...p,
          port:    opts.port ? parseInt(opts.port, 10) : resolveOpt('port', 'preview.port', 2369),
          open:    opts['no-open'] ? false : resolveOpt('open', 'preview.open', true),
          mockPath: opts.mock ? path.resolve(opts.mock) : null,
          verbose: !!opts.verbose,
        });
      } catch (err) { console.error(`\n  ✗  ${err.message}`); process.exit(1); }
      break;
    }

    // ── deploy ───────────────────────────────────────────────────────────────
    case 'deploy': {
      const preset = resolveOpt('preset', 'preset', null);
      if (!preset) { console.error('\n  ✗  --preset fehlt.'); process.exit(1); }

      const { deploy, resolveDeployConfig } = require('../src/deploy');
      const { ghostUrl, adminKey } = resolveDeployConfig(opts, projectCfg);

      if (!ghostUrl) {
        console.error(
          '\n  ✗  --url fehlt.\n' +
          '     Optionen:\n' +
          '     • CLI:    infactory deploy --preset=agency --url=https://mein.blog --key=id:secret\n' +
          '     • ENV:    INFACTORY_GHOST_URL=https://mein.blog\n' +
          '     • Config: .infactory.json → deploy.url\n'
        );
        process.exit(1);
      }
      if (!adminKey) {
        console.error(
          '\n  ✗  --key fehlt.\n' +
          '     Ghost Admin → Settings → Integrations → Add custom integration\n' +
          '     Key-Format: <id>:<secret>\n' +
          '     ENV:        INFACTORY_GHOST_KEY=id:secret\n'
        );
        process.exit(1);
      }

      const p = resolvePaths();

      // activate default: true, außer --no-activate
      const activate = opts['no-activate'] ? false : true;

      try {
        await deploy({
          preset,
          ghostUrl,
          adminKey,
          ...p,
          activate,
          dryRun:    !!opts['dry-run'],
          skipBuild: !!opts['skip-build'],
          verbose:   !!opts.verbose,
        });
      } catch (err) {
        console.error(`\n  ✗  Deploy fehlgeschlagen: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    // ── preset ───────────────────────────────────────────────────────────────
    case 'preset': {
      const sub = args[1];
      const { presetClone, presetRemove, presetList } = require('../src/preset-clone');
      const p = resolvePaths();
      try {
        switch (sub) {
          case 'clone': {
            const sourceId = args[2];
            if (!sourceId) { console.error('  ✗  Quell-Preset fehlt.'); process.exit(1); }
            if (!opts.name){ console.error('  ✗  --name fehlt.'); process.exit(1); }
            await presetClone({
              sourceId, name: opts.name, presetsDir: p.presetsDir, registryPath: p.registryPath,
              color: opts.color || null, fontDisplay: opts['font-display'] || null,
              fontBody: opts['font-body'] || null, description: opts.description || null,
              sections: opts.sections || null, verbose: !!opts.verbose,
            });
            break;
          }
          case 'remove': case 'delete': {
            const id = args[2] || opts.preset;
            if (!id) { console.error('  ✗  Preset-ID fehlt.'); process.exit(1); }
            await presetRemove({ presetId: id, presetsDir: p.presetsDir, force: !!opts.force });
            break;
          }
          case 'list': case 'ls': {
            presetList(p.presetsDir); break;
          }
          default: {
            console.log('  Befehle: infactory preset clone|list|remove\n  Hilfe:   infactory preset clone --help\n');
          }
        }
      } catch (err) { console.error(`\n  ✗  ${err.message}`); process.exit(1); }
      break;
    }

    // ── section ──────────────────────────────────────────────────────────────
    case 'section': {
      const sub = args[1];
      const { sectionAdd, sectionRemove, sectionMove, sectionLayout, sectionSearch } = require('../src/section-composer');
      const preset = resolveOpt('preset', 'preset', null);
      const p      = resolvePaths();
      if (['add','remove','move','layout'].includes(sub) && !preset) {
        console.error(`\n  ✗  --preset fehlt.`); process.exit(1);
      }
      try {
        switch (sub) {
          case 'add': {
            const id = args[2]; if (!id) { console.error('  ✗  Section-ID fehlt.'); process.exit(1); }
            const r = await sectionAdd({ sectionId: id, preset, presetsDir: p.presetsDir, registryPath: p.registryPath, position: opts.pos ? parseInt(opts.pos,10)-1 : null, force: !!opts.force, verbose: !!opts.verbose });
            if (r.ok) console.log(`\n  Neues Layout: ${r.layout.join(' → ')}\n`);
            break;
          }
          case 'remove': {
            const id = args[2]; if (!id) { console.error('  ✗  Section-ID fehlt.'); process.exit(1); }
            const r = await sectionRemove({ sectionId: id, preset, presetsDir: p.presetsDir, registryPath: p.registryPath, verbose: !!opts.verbose });
            if (r.ok) console.log(`\n  Neues Layout: ${r.layout.join(' → ')}\n`);
            break;
          }
          case 'move': {
            const id = args[2]; if (!id) { console.error('  ✗  Section-ID fehlt.'); process.exit(1); }
            if (!opts.pos) { console.error('  ✗  --pos fehlt.'); process.exit(1); }
            const r = await sectionMove({ sectionId: id, preset, presetsDir: p.presetsDir, registryPath: p.registryPath, position: parseInt(opts.pos,10), verbose: !!opts.verbose });
            if (r.ok) console.log(`\n  Neues Layout: ${r.layout.join(' → ')}\n`);
            break;
          }
          case 'layout': { sectionLayout({ preset, presetsDir: p.presetsDir, registryPath: p.registryPath }); break; }
          case 'search': case 'ls': case 'list': {
            sectionSearch({ query: args[2] || null, preset: preset || null, registryPath: p.registryPath }); break;
          }
          default: { console.log('  Befehle: infactory section add|remove|move|layout|list|search\n'); }
        }
      } catch (err) { console.error(`\n  ✗  ${err.message}`); process.exit(1); }
      break;
    }

    // ── sections validate ────────────────────────────────────────────────────
    case 'sections': {
      const sub = args[1];
      const p = resolvePaths();
      if (!fs.existsSync(p.registryPath)) { console.error('  ✗  registry.json nicht gefunden'); process.exit(1); }
      const registry = JSON.parse(fs.readFileSync(p.registryPath, 'utf8'));
      if (sub === 'validate') {
        let ok=0,fail=0;
        for (const s of (registry.sections||[])) {
          const h=fs.existsSync(path.join(cwd,'base-theme',s.partial));
          const j=fs.existsSync(path.join(cwd,'base-theme',s.schema));
          if(h&&j){ok++;console.log(`  ✔  ${s.id}`);}
          else{fail++;console.log(`  ✗  ${s.id}${!h?' [.hbs]':''}${!j?' [.json]':''}`);}
        }
        console.log(`\n  ${ok} OK — ${fail} fehlend`);
        if(fail>0) process.exit(2);
      } else {
        console.log('\n  Befehle: infactory sections validate | list\n');
      }
      break;
    }

    // ── list ─────────────────────────────────────────────────────────────────
    case 'list': {
      const yaml = require('js-yaml');
      const dirs = [path.join(cwd,'presets'), path.join(__dirname,'..','..','presets')].filter(fs.existsSync);
      const shown = new Set();
      console.log('\n  Verfügbare Presets:\n');
      for (const dir of dirs) {
        const label = dir.includes(cwd) ? '  [lokal]' : '  [inFactory]';
        const presets = listPresets(dir);
        if (!presets.length) continue;
        console.log(label);
        for (const p of presets) {
          if (shown.has(p)) continue; shown.add(p);
          try {
            const d = yaml.load(fs.readFileSync(path.join(dir,`${p}.yaml`),'utf8'));
            const c = d._cloned_from ? ` ← ${d._cloned_from}` : '';
            console.log(`     ${d.icon||'•'}  ${p.padEnd(20)} ${(d.name||p).padEnd(20)} — ${d.description||''}${c}`);
          } catch { console.log(`     •  ${p}`); }
        }
        console.log();
      }
      break;
    }

    // ── config ───────────────────────────────────────────────────────────────
    case 'config': {
      if (!projectCfg) console.log('\n  Kein .infactory.json. Starte mit: infactory new --name=mein-projekt\n');
      else {
        // Key maskieren
        const safe = JSON.parse(JSON.stringify(projectCfg));
        if (safe.deploy && safe.deploy.key) {
          safe.deploy.key = safe.deploy.key.replace(/:.*/, ':••••••••••••');
        }
        console.log('\n  .infactory.json\n\n' + JSON.stringify(safe, null, 2) + '\n');
      }
      break;
    }

    // ── help ──────────────────────────────────────────────────────────────────
    default: {
      let version = '1.0.0';
      try { version = require('../package.json').version; } catch {}
      console.log(`
  inFactory CLI v${version} — Ghost Theme Factory

  Server (im Ghost-Verzeichnis ausführen):
    infactory install               Setup: .infactory/, systemd, API-Key
    infactory start                 Server starten
    infactory stop                  Server stoppen
    infactory restart               Server neustarten
    infactory status                Server + Ghost Status
    infactory update                Auf neueste Version aktualisieren
    infactory ghost restart         Ghost CMS neustarten

  Projekt:
    infactory new     --name=<slug> [--preset=<id>] [--mode=copy|link]

  Presets:
    infactory list
    infactory preset  clone <source> --name=<slug> [--color=#hex]
                             [--font-display="..."] [--sections=a,b,c]
    infactory preset  list
    infactory preset  remove <id> --force

  Build & Preview:
    infactory build   --preset=<id> [--zip] [--out=./dist]
    infactory preview --preset=<id> [--port=2369] [--no-open]

  Deploy:
    infactory deploy  --preset=<id> [--url=... --key=...]

  Section Composer:
    infactory section add|remove|move|layout|list|search

  Sonstiges:
    infactory sections validate
    infactory config

  https://studio.xed.dev
`);
    }
  }
}

run().catch(err => { console.error(err); process.exit(1); });
