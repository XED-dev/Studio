/**
 * reference-manager.js — Referenz-Theme Import
 *
 * Lädt lizenzierte Theme-Bundles (ZIP) von einer URL und entpackt sie
 * nach /opt/infactory/references/themex/.
 *
 * Keine externen Dependencies — nutzt Node.js Built-ins + unzip via child_process.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');
const { execSync } = require('child_process');

const REFERENCES_DIR = '/opt/infactory/references';

/**
 * ZIP-Datei von URL herunterladen und nach references/themex/ entpacken.
 */
async function importReferences({ url, verbose = false }) {
  const themexDir = path.join(REFERENCES_DIR, 'themex');

  // Prüfe ob Verzeichnis existiert
  if (!fs.existsSync(REFERENCES_DIR)) {
    console.error(`\n  ✗  Referenz-Verzeichnis nicht gefunden: ${REFERENCES_DIR}`);
    console.error('     Zuerst install.sh ausführen (als root).\n');
    process.exit(1);
  }

  if (!fs.existsSync(themexDir)) {
    fs.mkdirSync(themexDir, { recursive: true });
  }

  const tmpZip = path.join('/tmp', `infactory-themex-${Date.now()}.zip`);

  console.log('\n  Themex-Bundle Import\n');
  console.log(`  URL: ${url}`);
  console.log(`  Ziel: ${themexDir}\n`);

  // 1. Download
  process.stdout.write('  Herunterladen... ');
  try {
    await downloadFile(url, tmpZip);
    const size = fs.statSync(tmpZip).size;
    console.log(`✔ (${(size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.log('✗');
    console.error(`\n  Download fehlgeschlagen: ${err.message}\n`);
    process.exit(1);
  }

  // 2. Entpacken
  process.stdout.write('  Entpacken... ');
  try {
    const tmpExtract = path.join('/tmp', `infactory-themex-extract-${Date.now()}`);
    fs.mkdirSync(tmpExtract, { recursive: true });

    execSync(`unzip -o -q "${tmpZip}" -d "${tmpExtract}"`, { timeout: 60000 });

    // Themes aus dem entpackten Verzeichnis nach themex/ kopieren
    // ZIP kann entweder direkt Theme-Ordner enthalten oder ein Wrapper-Verzeichnis
    const entries = fs.readdirSync(tmpExtract);
    let imported = 0;

    for (const entry of entries) {
      const entryPath = path.join(tmpExtract, entry);
      if (!fs.statSync(entryPath).isDirectory()) continue;

      // Prüfe ob es ein Theme ist (hat package.json oder *.hbs)
      const hasPackage = fs.existsSync(path.join(entryPath, 'package.json'));
      const hasHbs = fs.readdirSync(entryPath).some(f => f.endsWith('.hbs'));

      if (hasPackage || hasHbs) {
        // Direkt ein Theme — kopieren
        copyDir(entryPath, path.join(themexDir, entry));
        imported++;
        if (verbose) console.log(`\n     ✔ ${entry}`);
      } else {
        // Wrapper-Verzeichnis — Unterordner prüfen
        for (const sub of fs.readdirSync(entryPath)) {
          const subPath = path.join(entryPath, sub);
          if (!fs.statSync(subPath).isDirectory()) continue;
          const subHasPackage = fs.existsSync(path.join(subPath, 'package.json'));
          const subHasHbs = fs.readdirSync(subPath).some(f => f.endsWith('.hbs'));
          if (subHasPackage || subHasHbs) {
            copyDir(subPath, path.join(themexDir, sub));
            imported++;
            if (verbose) console.log(`\n     ✔ ${sub}`);
          }
        }
      }
    }

    console.log(`✔ (${imported} Themes)`);

    // Cleanup
    fs.rmSync(tmpZip, { force: true });
    fs.rmSync(tmpExtract, { recursive: true, force: true });

    console.log(`\n  ✔ ${imported} Themes nach ${themexDir}/ importiert\n`);

    // Themes auflisten
    const themes = fs.readdirSync(themexDir)
      .filter(f => f !== '.gitkeep' && fs.statSync(path.join(themexDir, f)).isDirectory());
    if (themes.length > 0) {
      console.log('  Verfügbare Themex-Themes:');
      for (const t of themes.sort()) {
        console.log(`     • ${t}`);
      }
      console.log();
    }
  } catch (err) {
    console.log('✗');
    console.error(`\n  Entpacken fehlgeschlagen: ${err.message}`);
    console.error('  Prüfe ob "unzip" installiert ist: sudo apt install -y unzip\n');
    // Cleanup
    fs.rmSync(tmpZip, { force: true });
    process.exit(1);
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    lib.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { importReferences };
