#!/usr/bin/env python3
"""
extract-structure.py — Structural page analysis via crawl4ai

Extracts the semantic structure of a web page:
- Sections (hero, grid, cards, content blocks)
- Layout patterns (columns, rows, nesting depth)
- Element inventory (headings, images, links, lists)
- Content blocks with type classification

Usage:
    python extract-structure.py <url> [--json]

Output: JSON to stdout
"""

import sys
import json
import asyncio
import re

from crawl4ai import AsyncWebCrawler
from crawl4ai.async_configs import CrawlerRunConfig

# JavaScript to extract structural information from the page
STRUCTURE_JS = """
(() => {
  const result = {
    sections: [],
    layout: {},
    elements: {},
    contentBlocks: [],
    metrics: {}
  };

  // --- Section Detection ---
  // Look for semantic sections, divs with section-like classes, or major structural elements
  const sectionSelectors = [
    'section', '[class*="section"]', '[class*="hero"]', '[class*="header"]',
    '[class*="feature"]', '[class*="grid"]', '[class*="card"]', '[class*="cta"]',
    '[class*="footer"]', '[class*="gallery"]', '[class*="venue"]',
    // BeTheme specific
    '.mcb-section', '.sections_group > div',
    // Ghost specific
    '.gh-content', '.kg-card', '.kg-image-card', '.kg-gallery-card'
  ];

  const sectionEls = document.querySelectorAll(sectionSelectors.join(', '));
  const seen = new Set();

  sectionEls.forEach(el => {
    if (seen.has(el)) return;
    seen.add(el);

    const rect = el.getBoundingClientRect();
    if (rect.height < 20) return; // skip tiny elements

    const cs = getComputedStyle(el);
    const bgImage = cs.backgroundImage !== 'none' ? cs.backgroundImage.substring(0, 100) : null;

    // Classify section type
    let type = 'unknown';
    const cls = (el.className || '').toString().toLowerCase();
    const tag = el.tagName.toLowerCase();

    if (/hero|slider|banner/.test(cls)) type = 'hero';
    else if (/header|head/.test(cls) && tag !== 'header') type = 'header';
    else if (/feature|card/.test(cls)) type = 'cards';
    else if (/grid|gallery|venue/.test(cls)) type = 'grid';
    else if (/cta|call.*action|reservation/.test(cls)) type = 'cta';
    else if (/footer/.test(cls) || tag === 'footer') type = 'footer';
    else if (/nav/.test(cls) || tag === 'nav') type = 'navigation';
    else if (/content|post|article|page/.test(cls)) type = 'content';
    else if (bgImage) type = 'decorated';
    else if (tag === 'section') type = 'section';

    // Count child elements
    const headings = el.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
    const images = el.querySelectorAll('img').length;
    const paragraphs = el.querySelectorAll('p').length;
    const links = el.querySelectorAll('a').length;
    const lists = el.querySelectorAll('ul,ol').length;

    // Detect column layout
    const children = Array.from(el.children).filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 50 && r.height > 20;
    });
    let columns = 1;
    if (children.length >= 2) {
      const firstTop = children[0].getBoundingClientRect().top;
      const sameRow = children.filter(c => Math.abs(c.getBoundingClientRect().top - firstTop) < 20);
      columns = Math.max(columns, sameRow.length);
    }

    result.sections.push({
      type,
      tag,
      classes: cls.substring(0, 200),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      columns,
      background: bgImage ? 'image' : (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : null),
      children: { headings, images, paragraphs, links, lists },
    });
  });

  // Sort by Y position
  result.sections.sort((a, b) => a.rect.y - b.rect.y);

  // --- Element Inventory ---
  result.elements = {
    h1: document.querySelectorAll('h1').length,
    h2: document.querySelectorAll('h2').length,
    h3: document.querySelectorAll('h3').length,
    h4: document.querySelectorAll('h4').length,
    p: document.querySelectorAll('p').length,
    img: document.querySelectorAll('img').length,
    a: document.querySelectorAll('a').length,
    ul: document.querySelectorAll('ul').length,
    ol: document.querySelectorAll('ol').length,
    table: document.querySelectorAll('table').length,
    form: document.querySelectorAll('form').length,
    iframe: document.querySelectorAll('iframe').length,
    video: document.querySelectorAll('video').length,
    section: document.querySelectorAll('section').length,
    nav: document.querySelectorAll('nav').length,
    figure: document.querySelectorAll('figure').length,
  };

  // --- Content Blocks (top-level flow) ---
  const contentArea = document.querySelector('.gh-content, .sections_group, main, article, #Content, .post-content, .page-content') || document.body;
  const blocks = Array.from(contentArea.children).filter(el => {
    const r = el.getBoundingClientRect();
    return r.height > 10 && r.width > 100;
  });

  blocks.forEach(el => {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '').toString().substring(0, 100);

    // Detect if this is a multi-column block
    const visibleChildren = Array.from(el.children).filter(c => {
      const r = c.getBoundingClientRect();
      return r.width > 50 && r.height > 10;
    });
    let columns = 1;
    if (visibleChildren.length >= 2) {
      const tops = visibleChildren.map(c => Math.round(c.getBoundingClientRect().top));
      const firstTop = tops[0];
      columns = tops.filter(t => Math.abs(t - firstTop) < 20).length;
    }

    result.contentBlocks.push({
      tag,
      classes: cls,
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      columns,
      hasImages: el.querySelectorAll('img').length,
      hasHeadings: el.querySelectorAll('h1,h2,h3,h4').length,
      textLength: (el.textContent || '').trim().length,
    });
  });

  // --- Page Metrics ---
  result.metrics = {
    totalHeight: document.documentElement.scrollHeight,
    totalWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    totalImages: document.querySelectorAll('img').length,
    totalSections: result.sections.length,
    totalBlocks: result.contentBlocks.length,
    multiColumnBlocks: result.contentBlocks.filter(b => b.columns > 1).length,
    maxColumns: Math.max(...result.contentBlocks.map(b => b.columns), 1),
  };

  return JSON.stringify(result);
})()
""".strip()


async def extract_structure(url):
    """Extract page structure using crawl4ai for content analysis."""
    config = CrawlerRunConfig(
        screenshot=False,
        page_timeout=15000,
    )

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url, config=config)

        structure = {
            "sections": [],
            "elements": {},
            "contentBlocks": [],
            "metrics": {},
        }

        # crawl4ai content analysis
        structure["content"] = {
            "html_length": len(result.html) if result.html else 0,
            "cleaned_html_length": len(result.cleaned_html) if result.cleaned_html else 0,
            "markdown_length": len(result.markdown) if result.markdown else 0,
        }

        if result.markdown:
            structure["markdown_preview"] = result.markdown[:500]
            # Count structural elements from markdown
            md = result.markdown
            structure["elements"] = {
                "h1": md.count("\n# ") + (1 if md.startswith("# ") else 0),
                "h2": md.count("\n## ") + (1 if md.startswith("## ") else 0),
                "h3": md.count("\n### ") + (1 if md.startswith("### ") else 0),
                "h4": md.count("\n#### "),
                "img": md.count("!["),
                "links": md.count("]("),
                "lists": md.count("\n* ") + md.count("\n- ") + md.count("\n1. "),
            }

        if result.media and isinstance(result.media, dict):
            structure["media"] = {
                "images": len(result.media.get("images", [])),
                "videos": len(result.media.get("videos", [])),
                "audios": len(result.media.get("audios", [])),
            }
            # Image details (src + alt)
            imgs = result.media.get("images", [])
            structure["imageDetails"] = [
                {"src": img.get("src", "")[:120], "alt": img.get("alt", "")[:60]}
                for img in imgs[:20]
            ]

        if result.links and isinstance(result.links, dict):
            structure["links"] = {
                "internal": len(result.links.get("internal", [])),
                "external": len(result.links.get("external", [])),
            }

        # Analyse cleaned_html for structural patterns
        if result.cleaned_html:
            html = result.cleaned_html
            # Count multi-column indicators
            structure["metrics"] = {
                "html_length": len(html),
                "has_grid": bool(re.search(r'class="[^"]*grid', html, re.I)),
                "has_cards": bool(re.search(r'class="[^"]*card', html, re.I)),
                "has_columns": bool(re.search(r'class="[^"]*col', html, re.I)),
                "has_sections": bool(re.search(r'<section|class="[^"]*section', html, re.I)),
                "div_count": html.lower().count("<div"),
                "section_count": html.lower().count("<section"),
                "figure_count": html.lower().count("<figure"),
                "table_count": html.lower().count("<table"),
            }

        return structure


async def main():
    if len(sys.argv) < 2:
        print("Usage: python extract-structure.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]

    try:
        structure = await extract_structure(url)
        print(json.dumps(structure, indent=2, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    # crawl4ai prints [INIT], [FETCH], [SCRAPE] to stdout — we prefix our JSON
    # with a marker so the Node.js caller can find it
    OUTPUT_MARKER = "###JSON_START###"

    _original_main = main

    async def _wrapped_main():
        if len(sys.argv) < 2:
            print("Usage: python extract-structure.py <url>", file=sys.stderr)
            sys.exit(1)
        url = sys.argv[1]
        try:
            structure = await extract_structure(url)
            # Print with marker so Node.js can extract the JSON
            print(OUTPUT_MARKER)
            print(json.dumps(structure, ensure_ascii=False))
        except Exception as e:
            print(OUTPUT_MARKER)
            print(json.dumps({"error": str(e)}))
            sys.exit(1)

    asyncio.run(_wrapped_main())
