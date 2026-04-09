/**
 * routes/qa.js — Visual QA: Die Augen der Fabrik (Server-Seite)
 *
 * Portiert die 3 Sensoren aus infactory-cli/src/qa.js als REST-Endpunkte.
 * Der Server nutzt sein EIGENES venv (venvPath aus config).
 *
 * Endpunkte:
 *   POST /api/qa/compare    { source, target, width }  → 3-Sensor Report
 *   POST /api/qa/batch      { source_base, target_base, slugs }
 *   POST /api/qa/structure   { url }  → crawl4ai Struktur-Extraktion
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { spawnSync } = require('child_process');
const config  = require('../config');

const router = express.Router();

// ─── Tool Resolution ─────────────────────────────────────────────────────────

function getVenvPython() {
  const p = path.join(config.venvPath, 'bin', 'python3');
  if (!fs.existsSync(p)) return null;
  return p;
}

function getShotScraper() {
  const p = path.join(config.venvPath, 'bin', 'shot-scraper');
  if (!fs.existsSync(p)) return null;
  return p;
}

function getExtractPy() {
  // extract-structure.py liegt im CLI-Verzeichnis
  const p = path.join(config.cliPath, 'src', 'extract-structure.py');
  if (!fs.existsSync(p)) return null;
  return p;
}

function requireVenv(res) {
  if (!config.venvPath || !getVenvPython()) {
    res.status(503).json({
      error: 'Python venv nicht verfügbar',
      detail: `venvPath: ${config.venvPath || '(nicht konfiguriert)'}`,
      hint: 'install.sh erneut ausführen oder venv_path in infactory.json setzen',
    });
    return false;
  }
  return true;
}

// ─── QA Output Directory ─────────────────────────────────────────────────────

const QA_DIR = '/tmp/infactory-qa';

function ensureQaDir() {
  if (!fs.existsSync(QA_DIR)) fs.mkdirSync(QA_DIR, { recursive: true });
  return QA_DIR;
}

// ─── CSS Selectors (identisch mit CLI qa.js) ─────────────────────────────────

const CSS_SELECTORS = [
  { name: 'Body',          selector: 'body',                props: ['fontFamily', 'fontSize', 'color', 'backgroundColor'] },
  { name: 'H1',            selector: 'h1',                  props: ['fontFamily', 'fontSize', 'fontWeight', 'color'] },
  { name: 'H2',            selector: 'h2',                  props: ['fontFamily', 'fontSize', 'fontWeight', 'color'] },
  { name: 'H3',            selector: 'h3',                  props: ['fontFamily', 'fontSize', 'fontWeight', 'color'] },
  { name: 'Paragraph',     selector: 'p',                   props: ['fontFamily', 'fontSize', 'lineHeight', 'color'] },
  { name: 'Link',          selector: 'a',                   props: ['color', 'textDecoration'] },
  { name: 'Nav',           selector: 'nav, [class*="nav"]', props: ['backgroundColor', 'fontFamily', 'fontSize'] },
  { name: 'Hero/Header',   selector: '[class*="hero"], [class*="header"], .gh-page-head', props: ['backgroundColor', 'backgroundImage', 'minHeight'] },
  { name: 'Card',          selector: '[class*="card"], [class*="feature"]', props: ['backgroundColor', 'borderRadius', 'boxShadow', 'padding'] },
  { name: 'Footer',        selector: 'footer, [class*="footer"]', props: ['backgroundColor', 'color', 'padding'] },
  { name: 'Image',         selector: 'img',                 props: ['width', 'height', 'objectFit'] },
  { name: 'Button',        selector: 'button, .button, [class*="btn"]', props: ['backgroundColor', 'color', 'borderRadius', 'padding', 'fontFamily'] },
];

// ─── Sensor 1: odiff (Pixel-Diff) ────────────────────────────────────────────

async function comparePixels(imgPath1, imgPath2, diffOutputPath) {
  const { compare } = require('odiff-bin');

  const result = await compare(imgPath1, imgPath2, diffOutputPath, {
    threshold: 0.1,
    antialiasing: true,
    outputDiffMask: false,
  });

  const diffPercentage = result.diffPercentage || 0;
  const similarity     = Math.round((100 - diffPercentage) * 100) / 100;

  return {
    similarity,
    diffPercentage,
    diffPixels: result.diffCount || 0,
    match: result.match || false,
    reason: result.reason || null,
    layoutDiff: result.reason === 'layout-diff',
  };
}

// ─── Sensor 2: CSS-Token-Vergleich ───────────────────────────────────────────

function takeScreenshot(url, outputPath, { width = 1440, wait = 2000 } = {}) {
  const python = getVenvPython();
  const shotScraper = getShotScraper();
  const removeScript =
    "document.querySelectorAll('[class*=cookie],[id*=cookie],[class*=overlay],[class*=popup],[class*=consent]').forEach(e=>e.remove())";

  const result = spawnSync(python, [
    shotScraper, url, '-o', outputPath, '-w', String(width), '--wait', String(wait),
    '--javascript', removeScript,
  ], {
    timeout: 45000,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(python)}:${process.env.PATH}` },
  });

  if (result.status !== 0) {
    throw new Error(`Screenshot failed: ${(result.stderr || '').substring(0, 200)}`);
  }
  return outputPath;
}

function extractCSSTokens(url) {
  const python = getVenvPython();
  const shotScraper = getShotScraper();

  const jsCode = `(() => {
    const results = {};
    const selectors = ${JSON.stringify(CSS_SELECTORS)};
    for (const s of selectors) {
      const el = document.querySelector(s.selector);
      if (!el) { results[s.name] = null; continue; }
      const cs = getComputedStyle(el);
      const vals = {};
      for (const p of s.props) vals[p] = cs[p] || '';
      results[s.name] = vals;
    }
    return JSON.stringify(results);
  })()`;

  const wrappedJs = `new Promise(done => setTimeout(() => done(${jsCode}), 2000))`;
  const result = spawnSync(python, [shotScraper, 'javascript', url, wrappedJs], {
    timeout: 30000,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(python)}:${process.env.PATH}` },
  });

  if (result.status !== 0) throw new Error(`CSS extraction failed: ${(result.stderr || '').substring(0, 200)}`);

  let output = result.stdout.trim();
  if (output.startsWith('"') && output.endsWith('"')) output = JSON.parse(output);
  return JSON.parse(output);
}

function compareCSSTokens(sourceTokens, targetTokens) {
  const diffs = [];
  for (const { name, props } of CSS_SELECTORS) {
    const src = sourceTokens[name], tgt = targetTokens[name];
    if (!src && !tgt) continue;
    if (!src) { diffs.push({ name, prop: '*', source: 'NOT FOUND', target: 'exists', match: false }); continue; }
    if (!tgt) { diffs.push({ name, prop: '*', source: 'exists', target: 'NOT FOUND', match: false }); continue; }
    for (const prop of props) {
      const sVal = (src[prop] || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const tVal = (tgt[prop] || '').replace(/\s+/g, ' ').trim().toLowerCase();
      diffs.push({ name, prop, source: src[prop] || '', target: tgt[prop] || '', match: sVal === tVal });
    }
  }
  return diffs;
}

// ─── Sensor 3: Struktur-Vergleich ────────────────────────────────────────────

function extractStructure(url) {
  const python = getVenvPython();
  const shotScraper = getShotScraper();
  const extractPy = getExtractPy();

  // Part A: crawl4ai content analysis
  let crawl4aiData = {};
  if (extractPy) {
    const pyResult = spawnSync(python, [extractPy, url], {
      timeout: 45000, encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(python)}:${process.env.PATH}` },
    });
    if (pyResult.status === 0) {
      const stdout = pyResult.stdout || '';
      const marker = '###JSON_START###';
      const idx = stdout.indexOf(marker);
      if (idx !== -1) {
        try { crawl4aiData = JSON.parse(stdout.substring(idx + marker.length).trim()); } catch {}
      }
    }
  }

  // Part B: shot-scraper DOM structure analysis
  const domJs = `new Promise(done => setTimeout(() => done((() => {
    const r = { sections: [], elements: {}, contentBlocks: [], metrics: {} };
    const tags = ['h1','h2','h3','h4','p','img','a','ul','ol','table','figure','section','nav'];
    for (const t of tags) r.elements[t] = document.querySelectorAll(t).length;
    const content = document.querySelector('.gh-content, .sections_group, main, article, #Content') || document.body;
    const blocks = Array.from(content.children).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 10 && rect.width > 100;
    });
    blocks.forEach(el => {
      const rect = el.getBoundingClientRect();
      const kids = Array.from(el.children).filter(c => c.getBoundingClientRect().width > 50 && c.getBoundingClientRect().height > 10);
      let cols = 1;
      if (kids.length >= 2) {
        const top1 = kids[0].getBoundingClientRect().top;
        cols = kids.filter(c => Math.abs(c.getBoundingClientRect().top - top1) < 20).length;
      }
      r.contentBlocks.push({
        tag: el.tagName.toLowerCase(),
        classes: (el.className||'').toString().substring(0,100),
        height: Math.round(rect.height), width: Math.round(rect.width),
        columns: cols,
        hasImages: el.querySelectorAll('img').length,
        hasHeadings: el.querySelectorAll('h1,h2,h3,h4').length,
      });
    });
    document.querySelectorAll('section,[class*="section"],[class*="hero"],[class*="feature"],[class*="grid"],[class*="card"],[class*="cta"],.mcb-section').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 20) return;
      const cls = (el.className||'').toString().toLowerCase();
      let type = 'unknown';
      if (/hero|slider/.test(cls)) type = 'hero';
      else if (/feature|card/.test(cls)) type = 'cards';
      else if (/grid|gallery|venue/.test(cls)) type = 'grid';
      else if (/cta/.test(cls)) type = 'cta';
      else if (/mcb-section|section/.test(cls)) type = 'section';
      r.sections.push({ type, height: Math.round(rect.height), classes: cls.substring(0,80) });
    });
    r.metrics = {
      totalHeight: document.documentElement.scrollHeight,
      totalBlocks: r.contentBlocks.length,
      multiColumnBlocks: r.contentBlocks.filter(b => b.columns > 1).length,
      maxColumns: Math.max(...r.contentBlocks.map(b => b.columns), 1),
    };
    return JSON.stringify(r);
  })()), 2000))`;

  let domData = {};
  try {
    const ssResult = spawnSync(python, [shotScraper, 'javascript', url, domJs], {
      timeout: 30000, encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(python)}:${process.env.PATH}` },
    });
    if (ssResult.status === 0) {
      let out = ssResult.stdout.trim();
      if (out.startsWith('"')) out = JSON.parse(out);
      domData = JSON.parse(out);
    }
  } catch { /* fallback to crawl4ai-only data */ }

  return {
    sections:      domData.sections || [],
    elements:      domData.elements || crawl4aiData.elements || {},
    contentBlocks: domData.contentBlocks || [],
    metrics:       domData.metrics || crawl4aiData.metrics || {},
    content:       crawl4aiData.content || {},
    media:         crawl4aiData.media || {},
    links:         crawl4aiData.links || {},
  };
}

function compareStructure(srcStruct, tgtStruct) {
  const report = { score: 0, maxScore: 0, diffs: [], summary: {} };

  const srcSections = srcStruct.sections || [];
  const tgtSections = tgtStruct.sections || [];
  const srcTypes = srcSections.map(s => s.type).filter(t => t !== 'unknown');
  const tgtTypes = tgtSections.map(s => s.type).filter(t => t !== 'unknown');

  report.summary.sourceSections = srcSections.length;
  report.summary.targetSections = tgtSections.length;
  report.summary.sourceTypes = [...new Set(srcTypes)];
  report.summary.targetTypes = [...new Set(tgtTypes)];

  const srcTypeSet = new Set(srcTypes);
  const tgtTypeSet = new Set(tgtTypes);
  for (const t of srcTypeSet) {
    report.maxScore += 10;
    if (tgtTypeSet.has(t)) report.score += 10;
    else report.diffs.push({ type: 'missing-section-type', source: t, detail: `Section-Typ "${t}" fehlt im Target` });
  }

  const importantElements = ['h1', 'h2', 'h3', 'img', 'p', 'ul', 'ol'];
  const srcEl = srcStruct.elements || {};
  const tgtEl = tgtStruct.elements || {};

  for (const tag of importantElements) {
    const srcCount = srcEl[tag] || 0;
    const tgtCount = tgtEl[tag] || 0;
    report.maxScore += 5;
    if (srcCount === tgtCount) {
      report.score += 5;
    } else if (srcCount > 0 && tgtCount > 0 && Math.abs(srcCount - tgtCount) <= 2) {
      report.score += 3;
      report.diffs.push({ type: 'element-count', element: tag, source: srcCount, target: tgtCount });
    } else if (srcCount > 0 && tgtCount === 0) {
      report.diffs.push({ type: 'missing-element', element: tag, source: srcCount, target: 0, detail: `<${tag}> fehlt komplett` });
    } else {
      report.diffs.push({ type: 'element-count', element: tag, source: srcCount, target: tgtCount });
    }
  }

  const srcMetrics = srcStruct.metrics || {};
  const tgtMetrics = tgtStruct.metrics || {};

  report.summary.sourceMultiCol = srcMetrics.multiColumnBlocks || 0;
  report.summary.targetMultiCol = tgtMetrics.multiColumnBlocks || 0;
  report.summary.sourceMaxCols  = srcMetrics.maxColumns || 1;
  report.summary.targetMaxCols  = tgtMetrics.maxColumns || 1;

  report.maxScore += 20;
  if (srcMetrics.multiColumnBlocks > 0 && tgtMetrics.multiColumnBlocks === 0) {
    report.diffs.push({
      type: 'layout-critical',
      detail: `Source hat ${srcMetrics.multiColumnBlocks} Multi-Column-Blocke, Target hat 0`,
    });
  } else if (srcMetrics.multiColumnBlocks === tgtMetrics.multiColumnBlocks) {
    report.score += 20;
  } else {
    const ratio = Math.min(tgtMetrics.multiColumnBlocks, srcMetrics.multiColumnBlocks) /
                  Math.max(tgtMetrics.multiColumnBlocks, srcMetrics.multiColumnBlocks);
    report.score += Math.round(20 * ratio);
    report.diffs.push({
      type: 'layout-mismatch',
      detail: `Multi-Column: Source ${srcMetrics.multiColumnBlocks}, Target ${tgtMetrics.multiColumnBlocks}`,
    });
  }

  report.maxScore += 10;
  if (srcMetrics.totalHeight && tgtMetrics.totalHeight) {
    const heightRatio = Math.min(srcMetrics.totalHeight, tgtMetrics.totalHeight) /
                        Math.max(srcMetrics.totalHeight, tgtMetrics.totalHeight);
    report.score += Math.round(10 * heightRatio);
    report.summary.sourceHeight = srcMetrics.totalHeight;
    report.summary.targetHeight = tgtMetrics.totalHeight;
    report.summary.heightRatio  = Math.round(heightRatio * 100);

    if (heightRatio < 0.7) {
      report.diffs.push({
        type: 'height-critical',
        detail: `Seitenhoehe weicht ${Math.round((1 - heightRatio) * 100)}% ab`,
      });
    }
  }

  const srcMedia = srcStruct.media || {};
  const tgtMedia = tgtStruct.media || {};
  if (srcMedia.images !== undefined) {
    report.maxScore += 10;
    report.summary.sourceImages = srcMedia.images;
    report.summary.targetImages = tgtMedia.images || 0;
    if (srcMedia.images === (tgtMedia.images || 0)) {
      report.score += 10;
    } else if (srcMedia.images > 0 && (tgtMedia.images || 0) > 0) {
      const ratio = Math.min(srcMedia.images, tgtMedia.images || 0) / Math.max(srcMedia.images, tgtMedia.images || 0);
      report.score += Math.round(10 * ratio);
    }
  }

  const srcContent = srcStruct.content || {};
  const tgtContent = tgtStruct.content || {};
  if (srcContent.markdown_length && tgtContent.markdown_length) {
    report.maxScore += 10;
    const ratio = Math.min(srcContent.markdown_length, tgtContent.markdown_length) /
                  Math.max(srcContent.markdown_length, tgtContent.markdown_length);
    report.score += Math.round(10 * ratio);
    report.summary.sourceContentLength = srcContent.markdown_length;
    report.summary.targetContentLength = tgtContent.markdown_length;
  }

  report.percentage = report.maxScore > 0 ? Math.round((report.score / report.maxScore) * 100) : 0;
  return report;
}

// ─── Endpunkte ───────────────────────────────────────────────────────────────

/**
 * POST /api/qa/compare
 * Body: { source: "https://...", target: "https://...", width: 1440 }
 * Returns: Full 3-sensor QA report as JSON
 */
router.post('/compare', async (req, res) => {
  if (!requireVenv(res)) return;

  const { source, target, width = 1440 } = req.body;
  if (!source || !target) {
    return res.status(400).json({ error: 'source und target URLs sind Pflicht' });
  }

  const outDir = ensureQaDir();
  const slug   = new URL(target).pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'home';
  const srcPng = path.join(outDir, `${slug}-source.png`);
  const tgtPng = path.join(outDir, `${slug}-target.png`);
  const diffPng = path.join(outDir, `${slug}-diff.png`);

  const report = {
    timestamp: new Date().toISOString(),
    slug, source, target,
    pixel: null, css: null, structure: null,
    overall: 0,
    weights: { structure: 0.40, pixel: 0.35, css: 0.25 },
    errors: [],
  };

  // Sensor 1: Pixel-Diff
  try {
    takeScreenshot(source, srcPng, { width });
    takeScreenshot(target, tgtPng, { width });
    const pixelResult = await comparePixels(srcPng, tgtPng, diffPng);
    report.pixel = {
      similarity: pixelResult.similarity,
      diffPercentage: pixelResult.diffPercentage,
      diffPixels: pixelResult.diffPixels,
      layoutDiff: pixelResult.layoutDiff,
    };
  } catch (err) {
    report.errors.push({ sensor: 'pixel', message: err.message.substring(0, 200) });
  }

  // Sensor 2: CSS-Tokens
  try {
    const srcTokens = extractCSSTokens(source);
    const tgtTokens = extractCSSTokens(target);
    const cssResult = compareCSSTokens(srcTokens, tgtTokens);
    const matches = cssResult.filter(d => d.match).length;
    report.css = {
      score: Math.round((matches / cssResult.length) * 100),
      total: cssResult.length,
      matches,
      diffs: cssResult.filter(d => !d.match),
    };
  } catch (err) {
    report.errors.push({ sensor: 'css', message: err.message.substring(0, 200) });
  }

  // Sensor 3: Struktur
  try {
    const srcStruct = extractStructure(source);
    const tgtStruct = extractStructure(target);
    const structResult = compareStructure(srcStruct, tgtStruct);
    report.structure = {
      score: structResult.percentage,
      summary: structResult.summary,
      diffs: structResult.diffs,
    };
  } catch (err) {
    report.errors.push({ sensor: 'structure', message: err.message.substring(0, 200) });
  }

  // Gesamt-Score
  const pixelScore  = report.pixel ? report.pixel.similarity : 0;
  const cssScore    = report.css ? report.css.score : 0;
  const structScore = report.structure ? report.structure.score : 0;

  report.overall = Math.round(
    structScore * 0.40 +
    pixelScore  * 0.35 +
    cssScore    * 0.25
  );

  // Report speichern
  const reportPath = path.join(outDir, `${slug}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  res.json(report);
});

/**
 * POST /api/qa/batch
 * Body: { source_base: "https://...", target_base: "https://...", slugs: ["a","b"], width: 1440 }
 */
router.post('/batch', async (req, res) => {
  if (!requireVenv(res)) return;

  const { source_base, target_base, slugs, width = 1440 } = req.body;
  if (!source_base || !target_base || !slugs || !Array.isArray(slugs) || slugs.length === 0) {
    return res.status(400).json({ error: 'source_base, target_base und slugs[] sind Pflicht' });
  }

  const results = [];

  for (const slug of slugs) {
    const source = `${source_base.replace(/\/$/, '')}/${slug}/`;
    const target = `${target_base.replace(/\/$/, '')}/${slug}/`;

    const outDir = ensureQaDir();
    const srcPng = path.join(outDir, `${slug}-source.png`);
    const tgtPng = path.join(outDir, `${slug}-target.png`);
    const diffPng = path.join(outDir, `${slug}-diff.png`);

    const entry = { slug, source, target, pixel: null, css: null, structure: null, overall: 0, errors: [] };

    try {
      takeScreenshot(source, srcPng, { width });
      takeScreenshot(target, tgtPng, { width });
      const pixelResult = await comparePixels(srcPng, tgtPng, diffPng);
      entry.pixel = { similarity: pixelResult.similarity, layoutDiff: pixelResult.layoutDiff };
    } catch (err) {
      entry.errors.push({ sensor: 'pixel', message: err.message.substring(0, 150) });
    }

    try {
      const srcTokens = extractCSSTokens(source);
      const tgtTokens = extractCSSTokens(target);
      const cssResult = compareCSSTokens(srcTokens, tgtTokens);
      const matches = cssResult.filter(d => d.match).length;
      entry.css = { score: Math.round((matches / cssResult.length) * 100) };
    } catch (err) {
      entry.errors.push({ sensor: 'css', message: err.message.substring(0, 150) });
    }

    try {
      const srcStruct = extractStructure(source);
      const tgtStruct = extractStructure(target);
      entry.structure = { score: compareStructure(srcStruct, tgtStruct).percentage };
    } catch (err) {
      entry.errors.push({ sensor: 'structure', message: err.message.substring(0, 150) });
    }

    const ps = entry.pixel ? entry.pixel.similarity : 0;
    const cs = entry.css ? entry.css.score : 0;
    const ss = entry.structure ? entry.structure.score : 0;
    entry.overall = Math.round(ss * 0.40 + ps * 0.35 + cs * 0.25);

    results.push(entry);
  }

  const avg = results.reduce((s, r) => s + r.overall, 0) / (results.length || 1);

  res.json({
    timestamp: new Date().toISOString(),
    count: results.length,
    avgScore: Math.round(avg),
    results,
  });
});

/**
 * POST /api/qa/structure
 * Body: { url: "https://..." }
 * Returns: Structural analysis of a single page
 */
router.post('/structure', (req, res) => {
  if (!requireVenv(res)) return;

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url ist Pflicht' });

  try {
    const structure = extractStructure(url);
    res.json({ url, timestamp: new Date().toISOString(), ...structure });
  } catch (err) {
    res.status(500).json({ error: 'Struktur-Analyse fehlgeschlagen', message: err.message });
  }
});

module.exports = router;
