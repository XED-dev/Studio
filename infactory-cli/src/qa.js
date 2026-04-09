/**
 * qa.js — inFactory Visual QA: Die Augen der Fabrik
 *
 * Vergleicht eine Quellseite (Original) mit einer Zielseite (Ghost-Replikat)
 * auf DREI Ebenen:
 *
 * Sensor 1: odiff (CIE76 Lab ΔE)       → Pixel-Diff mit perzeptueller Farbdistanz
 * Sensor 2: shot-scraper + JS           → CSS-Token-Vergleich (getComputedStyle)
 * Sensor 3: crawl4ai + JS               → Struktur-Vergleich (Sections, Grids, Cards)
 *
 * Das Ziel ist 99% — nicht 80%.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ─── Configuration ─────────────────────────────────────────────────────────────

const VENV_PATH     = path.resolve(__dirname, '../../../../../crawler/bin/.venv');
const VENV_PYTHON   = path.join(VENV_PATH, 'bin', 'python3');
const SHOT_SCRAPER  = path.join(VENV_PATH, 'bin', 'shot-scraper');
const EXTRACT_PY    = path.join(__dirname, 'extract-structure.py');

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

// ─── Sensor 1: odiff (Pixel-Diff, CIE76 Lab ΔE) ──────────────────────────────

/**
 * Compare two PNG screenshots using odiff.
 * Returns { score, diffPercentage, diffPixels, layoutDiff, diffImagePath }
 */
async function comparePixels(imgPath1, imgPath2, diffOutputPath) {
  const { compare } = require('odiff-bin');

  const result = await compare(imgPath1, imgPath2, diffOutputPath, {
    threshold: 0.1,           // per-pixel color tolerance (CIE76)
    antialiasing: true,       // ignore anti-aliasing differences
    outputDiffMask: false,    // full diff image, not just mask
  });

  // odiff returns: { match: bool, reason?: string, diffCount?: number, diffPercentage?: number }
  const diffPercentage = result.diffPercentage || 0;
  const similarity     = Math.round((100 - diffPercentage) * 100) / 100;

  return {
    similarity,
    diffPercentage,
    diffPixels: result.diffCount || 0,
    match: result.match || false,
    reason: result.reason || null,       // 'pixel-diff' | 'layout-diff' | undefined
    layoutDiff: result.reason === 'layout-diff',
    diffImagePath: diffOutputPath,
  };
}

// ─── Sensor 2: CSS-Token-Vergleich (shot-scraper) ─────────────────────────────

function checkShotScraper() {
  if (!fs.existsSync(SHOT_SCRAPER)) {
    throw new Error(`shot-scraper nicht gefunden: ${SHOT_SCRAPER}`);
  }
}

function takeScreenshot(url, outputPath, { width = 1440, wait = 2000 } = {}) {
  checkShotScraper();
  const removeScript =
    "document.querySelectorAll('[class*=cookie],[id*=cookie],[class*=overlay],[class*=popup],[class*=consent]').forEach(e=>e.remove())";

  const result = spawnSync(VENV_PYTHON, [
    SHOT_SCRAPER, url, '-o', outputPath, '-w', String(width), '--wait', String(wait),
    '--javascript', removeScript,
  ], { timeout: 30000, encoding: 'utf8', env: { ...process.env, PATH: `${path.dirname(VENV_PYTHON)}:${process.env.PATH}` } });

  if (result.status !== 0) {
    throw new Error(`Screenshot failed: ${(result.stderr || '').substring(0, 200)}`);
  }
  return outputPath;
}

function extractCSSTokens(url) {
  checkShotScraper();
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
  const result = spawnSync(VENV_PYTHON, [SHOT_SCRAPER, 'javascript', url, wrappedJs], {
    timeout: 30000, encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(VENV_PYTHON)}:${process.env.PATH}` },
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

// ─── Sensor 3: Struktur-Vergleich (crawl4ai) ─────────────────────────────────

/**
 * Extract page structure using crawl4ai (Python subprocess).
 * Returns { sections, elements, contentBlocks, metrics }
 */
/**
 * Extract page structure: crawl4ai for content analysis + shot-scraper for DOM structure.
 */
function extractStructure(url) {
  // Part A: crawl4ai content analysis (markdown, media, links, HTML patterns)
  let crawl4aiData = {};
  const pyResult = spawnSync(VENV_PYTHON, [EXTRACT_PY, url], {
    timeout: 45000, encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(VENV_PYTHON)}:${process.env.PATH}` },
  });
  if (pyResult.status === 0) {
    const stdout = pyResult.stdout || '';
    const marker = '###JSON_START###';
    const idx = stdout.indexOf(marker);
    if (idx !== -1) {
      crawl4aiData = JSON.parse(stdout.substring(idx + marker.length).trim());
    }
  }

  // Part B: shot-scraper DOM structure analysis (sections, columns, layout)
  const domJs = `new Promise(done => setTimeout(() => done((() => {
    const r = { sections: [], elements: {}, contentBlocks: [], metrics: {} };

    // Element inventory
    const tags = ['h1','h2','h3','h4','p','img','a','ul','ol','table','figure','section','nav'];
    for (const t of tags) r.elements[t] = document.querySelectorAll(t).length;

    // Content area detection
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

    // Section detection
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
    const ssResult = spawnSync(VENV_PYTHON, [SHOT_SCRAPER, 'javascript', url, domJs], {
      timeout: 30000, encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(VENV_PYTHON)}:${process.env.PATH}` },
    });
    if (ssResult.status === 0) {
      let out = ssResult.stdout.trim();
      if (out.startsWith('"')) out = JSON.parse(out);
      domData = JSON.parse(out);
    }
  } catch { /* fallback to crawl4ai-only data */ }

  // Merge: DOM data is primary, crawl4ai enriches with content analysis
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

/**
 * Compare two page structures and produce a structural diff report.
 */
function compareStructure(srcStruct, tgtStruct) {
  const report = { score: 0, maxScore: 0, diffs: [], summary: {} };

  // 1. Section count & types
  const srcSections = srcStruct.sections || [];
  const tgtSections = tgtStruct.sections || [];
  const srcTypes = srcSections.map(s => s.type).filter(t => t !== 'unknown');
  const tgtTypes = tgtSections.map(s => s.type).filter(t => t !== 'unknown');

  report.summary.sourceSections = srcSections.length;
  report.summary.targetSections = tgtSections.length;
  report.summary.sourceTypes = [...new Set(srcTypes)];
  report.summary.targetTypes = [...new Set(tgtTypes)];

  // Score section type coverage
  const srcTypeSet = new Set(srcTypes);
  const tgtTypeSet = new Set(tgtTypes);
  let typesMatched = 0;
  for (const t of srcTypeSet) {
    report.maxScore += 10;
    if (tgtTypeSet.has(t)) { typesMatched++; report.score += 10; }
    else report.diffs.push({ type: 'missing-section-type', source: t, detail: `Section-Typ "${t}" fehlt im Target` });
  }

  // 2. Element inventory
  const srcEl = srcStruct.elements || {};
  const tgtEl = tgtStruct.elements || {};
  const importantElements = ['h1', 'h2', 'h3', 'img', 'p', 'ul', 'ol'];

  for (const tag of importantElements) {
    const srcCount = srcEl[tag] || 0;
    const tgtCount = tgtEl[tag] || 0;
    report.maxScore += 5;
    if (srcCount === tgtCount) {
      report.score += 5;
    } else if (srcCount > 0 && tgtCount > 0 && Math.abs(srcCount - tgtCount) <= 2) {
      report.score += 3;  // close enough
      report.diffs.push({ type: 'element-count', element: tag, source: srcCount, target: tgtCount });
    } else if (srcCount > 0 && tgtCount === 0) {
      report.diffs.push({ type: 'missing-element', element: tag, source: srcCount, target: 0, detail: `<${tag}> fehlt komplett` });
    } else {
      report.diffs.push({ type: 'element-count', element: tag, source: srcCount, target: tgtCount });
    }
  }

  // 3. Multi-column layout detection
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
      detail: `Source hat ${srcMetrics.multiColumnBlocks} Multi-Column-Blöcke (max ${srcMetrics.maxColumns} Spalten), Target hat 0`,
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

  // 4. Page height ratio (structural indicator)
  report.maxScore += 10;
  if (srcMetrics.totalHeight && tgtMetrics.totalHeight) {
    const heightRatio = Math.min(srcMetrics.totalHeight, tgtMetrics.totalHeight) /
                        Math.max(srcMetrics.totalHeight, tgtMetrics.totalHeight);
    const heightScore = Math.round(10 * heightRatio);
    report.score += heightScore;
    report.summary.sourceHeight = srcMetrics.totalHeight;
    report.summary.targetHeight = tgtMetrics.totalHeight;
    report.summary.heightRatio  = Math.round(heightRatio * 100);

    if (heightRatio < 0.7) {
      report.diffs.push({
        type: 'height-critical',
        detail: `Seitenhöhe weicht ${Math.round((1 - heightRatio) * 100)}% ab (Source: ${srcMetrics.totalHeight}px, Target: ${tgtMetrics.totalHeight}px)`,
      });
    }
  }

  // 5. Media inventory (crawl4ai)
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
      report.diffs.push({ type: 'media-count', detail: `Bilder: Source ${srcMedia.images}, Target ${tgtMedia.images || 0}` });
    } else {
      report.diffs.push({ type: 'media-missing', detail: `Bilder fehlen: Source ${srcMedia.images}, Target ${tgtMedia.images || 0}` });
    }
  }

  // 6. Content length comparison (crawl4ai markdown)
  const srcContent = srcStruct.content || {};
  const tgtContent = tgtStruct.content || {};
  if (srcContent.markdown_length && tgtContent.markdown_length) {
    report.maxScore += 10;
    const ratio = Math.min(srcContent.markdown_length, tgtContent.markdown_length) /
                  Math.max(srcContent.markdown_length, tgtContent.markdown_length);
    report.score += Math.round(10 * ratio);
    report.summary.sourceContentLength = srcContent.markdown_length;
    report.summary.targetContentLength = tgtContent.markdown_length;
    if (ratio < 0.5) {
      report.diffs.push({ type: 'content-length', detail: `Content-Länge weicht stark ab: Source ${srcContent.markdown_length}, Target ${tgtContent.markdown_length} Zeichen` });
    }
  }

  // Calculate percentage
  report.percentage = report.maxScore > 0 ? Math.round((report.score / report.maxScore) * 100) : 0;

  return report;
}

// ─── Main CLI Commands ─────────────────────────────────────────────────────────

async function compare({ sourceUrl, targetUrl, outputDir, width, verbose }) {
  const outDir = outputDir || '/tmp/infactory-qa';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const slug   = new URL(targetUrl).pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'home';
  const srcPng = path.join(outDir, `${slug}-source.png`);
  const tgtPng = path.join(outDir, `${slug}-target.png`);
  const diffPng = path.join(outDir, `${slug}-diff.png`);

  console.log(`\n  🔍 Visual QA: ${slug}\n`);
  console.log(`  Source: ${sourceUrl}`);
  console.log(`  Target: ${targetUrl}\n`);

  // ── Sensor 1: Screenshots + odiff ────────────────────────────────────────
  console.log('  📸 Sensor 1: Pixel-Vergleich (odiff, CIE76 Lab ΔE)');
  let pixelResult = null;
  try {
    process.stdout.write('     Screenshot Source... ');
    takeScreenshot(sourceUrl, srcPng, { width });
    console.log('✔');

    process.stdout.write('     Screenshot Target... ');
    takeScreenshot(targetUrl, tgtPng, { width });
    console.log('✔');

    process.stdout.write('     Pixel-Diff... ');
    pixelResult = await comparePixels(srcPng, tgtPng, diffPng);
    console.log('✔');

    console.log(`     Ergebnis: ${pixelResult.similarity}% Übereinstimmung`);
    if (pixelResult.layoutDiff) console.log('     ⚠  LAYOUT-DIFF: Bilder haben verschiedene Dimensionen');
    console.log(`     Diff-Bild: ${diffPng}`);
  } catch (err) {
    console.log(`✗ ${err.message.substring(0, 100)}`);
  }

  // ── Sensor 2: CSS-Token-Vergleich ────────────────────────────────────────
  console.log('\n  🎨 Sensor 2: CSS-Vergleich (getComputedStyle)');
  let cssResult = null;
  try {
    process.stdout.write('     Source CSS... ');
    const srcTokens = extractCSSTokens(sourceUrl);
    console.log('✔');

    process.stdout.write('     Target CSS... ');
    const tgtTokens = extractCSSTokens(targetUrl);
    console.log('✔');

    cssResult = compareCSSTokens(srcTokens, tgtTokens);
    const matches = cssResult.filter(d => d.match).length;
    const mismatches = cssResult.filter(d => !d.match);
    const cssScore = Math.round((matches / cssResult.length) * 100);

    console.log(`     Ergebnis: ${matches}/${cssResult.length} identisch (${cssScore}%)`);

    if (mismatches.length > 0 && mismatches.length <= 15) {
      console.log(`\n     ${'Element'.padEnd(15)} ${'Property'.padEnd(18)} ${'Source'.padEnd(28)} Target`);
      console.log(`     ${'─'.repeat(15)} ${'─'.repeat(18)} ${'─'.repeat(28)} ${'─'.repeat(28)}`);
      for (const d of mismatches) {
        console.log(`     ${d.name.padEnd(15)} ${d.prop.padEnd(18)} ${d.source.substring(0, 26).padEnd(28)} ${d.target.substring(0, 26)}`);
      }
    } else if (mismatches.length > 15) {
      console.log(`     ${mismatches.length} Abweichungen (--verbose für Details)`);
    }
  } catch (err) {
    console.log(`\n     ⚠  CSS-Vergleich fehlgeschlagen: ${err.message.substring(0, 100)}`);
  }

  // ── Sensor 3: Struktur-Vergleich (crawl4ai) ─────────────────────────────
  console.log('\n  🏗  Sensor 3: Struktur-Vergleich (crawl4ai)');
  let structResult = null;
  try {
    process.stdout.write('     Source Struktur... ');
    const srcStruct = extractStructure(sourceUrl);
    console.log('✔');

    process.stdout.write('     Target Struktur... ');
    const tgtStruct = extractStructure(targetUrl);
    console.log('✔');

    structResult = compareStructure(srcStruct, tgtStruct);

    console.log(`     Ergebnis: ${structResult.percentage}% strukturelle Übereinstimmung`);
    console.log(`     Sections: Source ${structResult.summary.sourceSections}, Target ${structResult.summary.targetSections}`);
    console.log(`     Multi-Column: Source ${structResult.summary.sourceMultiCol}, Target ${structResult.summary.targetMultiCol}`);

    if (structResult.summary.sourceHeight) {
      console.log(`     Seitenhöhe: Source ${structResult.summary.sourceHeight}px, Target ${structResult.summary.targetHeight}px (${structResult.summary.heightRatio}%)`);
    }

    if (structResult.diffs.length > 0) {
      console.log('\n     Strukturelle Probleme:');
      for (const d of structResult.diffs) {
        const icon = d.type.includes('critical') ? '🔴' : d.type.includes('missing') ? '🟡' : '🟠';
        console.log(`     ${icon} ${d.detail || d.type}`);
      }
    }
  } catch (err) {
    console.log(`\n     ⚠  Struktur-Vergleich fehlgeschlagen: ${err.message.substring(0, 150)}`);
  }

  // ── Gesamt-Score ─────────────────────────────────────────────────────────
  const pixelScore  = pixelResult ? pixelResult.similarity : 0;
  const cssScore    = cssResult ? Math.round((cssResult.filter(d => d.match).length / cssResult.length) * 100) : 0;
  const structScore = structResult ? structResult.percentage : 0;

  // Gewichtung: Struktur zählt am meisten, dann Pixel, dann CSS
  const overallScore = Math.round(
    structScore * 0.40 +   // 40% Struktur (das Wichtigste!)
    pixelScore  * 0.35 +   // 35% Pixel-Fidelity
    cssScore    * 0.25     // 25% CSS-Tokens
  );

  console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  📊 GESAMT-SCORE: ${overallScore}%  (Ziel: 99%)`);
  console.log(`     Struktur: ${structScore}%  (×0.40)`);
  console.log(`     Pixel:    ${pixelScore}%  (×0.35)`);
  console.log(`     CSS:      ${cssScore}%  (×0.25)`);
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    slug, sourceUrl, targetUrl,
    pixel:     pixelResult ? { similarity: pixelScore, diffPercentage: pixelResult.diffPercentage, layoutDiff: pixelResult.layoutDiff } : null,
    css:       cssResult ? { score: cssScore, total: cssResult.length, matches: cssResult.filter(d => d.match).length, diffs: cssResult.filter(d => !d.match) } : null,
    structure: structResult ? { score: structScore, summary: structResult.summary, diffs: structResult.diffs } : null,
    overall:   overallScore,
    weights:   { structure: 0.40, pixel: 0.35, css: 0.25 },
    files:     { source: srcPng, target: tgtPng, diff: diffPng },
  };

  const reportPath = path.join(outDir, `${slug}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report: ${reportPath}`);
  console.log(`  Screenshots: ${outDir}/\n`);

  return report;
}

async function batch({ sourceBase, targetBase, slugs, outputDir, width, verbose }) {
  const outDir = outputDir || '/tmp/infactory-qa';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n  🏭 Batch QA: ${slugs.length} Seiten\n`);

  const results = [];
  for (const slug of slugs) {
    const sourceUrl = `${sourceBase.replace(/\/$/, '')}/${slug}/`;
    const targetUrl = `${targetBase.replace(/\/$/, '')}/${slug}/`;
    try {
      const report = await compare({ sourceUrl, targetUrl, outputDir: outDir, width, verbose });
      if (report) results.push(report);
    } catch (err) {
      console.log(`  ✗ ${slug}: ${err.message.substring(0, 80)}\n`);
      results.push({ slug, error: err.message });
    }
  }

  console.log('\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📊 BATCH ERGEBNIS\n');
  console.log(`  ${'Seite'.padEnd(35)} ${'Struktur'.padStart(9)} ${'Pixel'.padStart(7)} ${'CSS'.padStart(5)} ${'GESAMT'.padStart(8)}`);
  console.log(`  ${'─'.repeat(35)} ${'─'.repeat(9)} ${'─'.repeat(7)} ${'─'.repeat(5)} ${'─'.repeat(8)}`);

  for (const r of results) {
    if (r.error) {
      console.log(`  ${(r.slug || '?').padEnd(35)} ${'ERR'.padStart(9)} ${'—'.padStart(7)} ${'—'.padStart(5)} ${'—'.padStart(8)}`);
    } else {
      const s = r.structure ? `${r.structure.score}%` : '—';
      const p = r.pixel ? `${r.pixel.similarity}%` : '—';
      const c = r.css ? `${r.css.score}%` : '—';
      const o = `${r.overall}%`;
      console.log(`  ${r.slug.padEnd(35)} ${s.padStart(9)} ${p.padStart(7)} ${c.padStart(5)} ${o.padStart(8)}`);
    }
  }

  const avg = results.filter(r => !r.error).reduce((s, r) => s + r.overall, 0) / (results.filter(r => !r.error).length || 1);
  console.log(`\n  Durchschnitt: ${Math.round(avg)}%  (Ziel: 99%)`);
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const batchReport = path.join(outDir, 'batch-report.json');
  fs.writeFileSync(batchReport, JSON.stringify({ timestamp: new Date().toISOString(), results, avgScore: Math.round(avg) }, null, 2));

  return results;
}

module.exports = { compare, batch, takeScreenshot, extractCSSTokens, comparePixels, extractStructure, compareStructure };
