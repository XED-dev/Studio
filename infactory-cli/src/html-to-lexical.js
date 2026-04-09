/**
 * html-to-lexical.js — Converts HTML to Ghost Lexical JSON
 *
 * Replaces the old Monoblock-Hack (entire HTML in one html-Card)
 * with proper Lexical nodes: paragraph, heading, image, horizontalrule, list.
 * Complex/unknown blocks fall back to html Cards (which is fine for BeTheme layouts).
 *
 * No external dependencies — uses regex-based parsing for the limited
 * set of HTML elements produced by BeTheme content extraction.
 */

'use strict';

// --- Text node helpers ---

/**
 * Parse inline HTML into an array of Lexical text/link children.
 * Handles: <strong>/<b>, <em>/<i>, <u>, <a>, <br>, plain text.
 *
 * Format flags (bitwise OR):
 *   1 = bold, 2 = italic, 4 = strikethrough, 8 = underline
 */
function parseInlineContent(html) {
  if (!html || !html.trim()) return [];

  const children = [];
  // Normalize <br> variants to \n for linebreak nodes
  const normalized = html.replace(/<br\s*\/?>/gi, '\n');

  // Tokenize: split into tags and text segments
  const tokens = normalized.split(/(<[^>]+>)/g).filter(t => t.length > 0);

  let formatStack = []; // stack of format flags
  let linkStack = [];   // stack of {url, rel, target, title}

  function currentFormat() {
    let fmt = 0;
    for (const f of formatStack) fmt |= f;
    return fmt;
  }

  function currentLink() {
    return linkStack.length > 0 ? linkStack[linkStack.length - 1] : null;
  }

  function pushText(text) {
    if (!text) return;
    // Split on newlines for linebreak handling
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        children.push({ type: 'linebreak', version: 1 });
      }
      const t = parts[i];
      if (!t) continue;

      const decoded = decodeHtmlEntities(t);
      const link = currentLink();
      if (link) {
        // Wrap in link node
        children.push({
          type: 'link',
          version: 1,
          url: link.url,
          rel: link.rel || null,
          target: link.target || null,
          title: link.title || null,
          children: [{
            type: 'text',
            version: 1,
            text: decoded,
            detail: 0,
            format: currentFormat(),
            mode: 'normal',
            style: '',
          }],
          direction: 'ltr',
          format: '',
          indent: 0,
        });
      } else {
        children.push({
          type: 'text',
          version: 1,
          text: decoded,
          detail: 0,
          format: currentFormat(),
          mode: 'normal',
          style: '',
        });
      }
    }
  }

  for (const token of tokens) {
    if (token.startsWith('<')) {
      const lower = token.toLowerCase();

      // Opening tags
      if (/^<(strong|b)[\s>]/i.test(token)) {
        formatStack.push(1); // bold
      } else if (/^<(em|i)[\s>]/i.test(token)) {
        formatStack.push(2); // italic
      } else if (/^<(s|strike|del)[\s>]/i.test(token)) {
        formatStack.push(4); // strikethrough
      } else if (/^<u[\s>]/i.test(token)) {
        formatStack.push(8); // underline
      } else if (/^<a[\s]/i.test(token)) {
        const href = token.match(/href="([^"]*)"/i);
        const rel = token.match(/rel="([^"]*)"/i);
        const target = token.match(/target="([^"]*)"/i);
        const title = token.match(/title="([^"]*)"/i);
        linkStack.push({
          url: href ? decodeHtmlEntities(href[1]) : '',
          rel: rel ? rel[1] : null,
          target: target ? target[1] : null,
          title: title ? title[1] : null,
        });
      }
      // Closing tags
      else if (/^<\/(strong|b)>/i.test(token)) {
        popFormat(formatStack, 1);
      } else if (/^<\/(em|i)>/i.test(token)) {
        popFormat(formatStack, 2);
      } else if (/^<\/(s|strike|del)>/i.test(token)) {
        popFormat(formatStack, 4);
      } else if (/^<\/u>/i.test(token)) {
        popFormat(formatStack, 8);
      } else if (/^<\/a>/i.test(token)) {
        linkStack.pop();
      }
      // Self-closing/void tags (already handled <br> above via \n)
      // Skip other tags (span, etc.) — just pass through text
    } else {
      // Plain text
      pushText(token);
    }
  }

  return children;
}

function popFormat(stack, flag) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === flag) {
      stack.splice(i, 1);
      return;
    }
  }
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// --- Block-level parsing ---

/**
 * Split HTML string into top-level block elements.
 * Returns array of {tag, attrs, innerHTML, outerHTML}.
 */
function splitTopLevelBlocks(html) {
  const blocks = [];
  if (!html || !html.trim()) return blocks;

  // Normalize whitespace between tags
  let s = html.trim();

  // Regex to match top-level opening tags
  // We process sequentially, tracking nesting depth
  const tagPattern = /<(\/?)(\w+)([^>]*)>/g;
  let depth = 0;
  let currentTag = null;
  let currentAttrs = '';
  let blockStart = -1;
  let contentStart = -1;
  let pos = 0;

  // Void elements (no closing tag)
  const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed']);

  // Collect text before first tag
  const firstTag = s.indexOf('<');
  if (firstTag > 0) {
    const textBefore = s.substring(0, firstTag).trim();
    if (textBefore) {
      blocks.push({
        tag: '#text',
        attrs: '',
        innerHTML: textBefore,
        outerHTML: textBefore,
      });
    }
  }

  let match;
  tagPattern.lastIndex = 0;

  while ((match = tagPattern.exec(s)) !== null) {
    const [fullMatch, slash, tagName, attrs] = match;
    const tag = tagName.toLowerCase();

    if (!slash) {
      // Opening tag
      if (depth === 0) {
        // Capture any text between blocks
        if (blockStart >= 0) {
          // There was a previous block — check for text gap
        }
        const gapStart = blockStart >= 0 ? pos : (firstTag >= 0 ? firstTag : 0);
        if (match.index > pos && pos > 0) {
          const gap = s.substring(pos, match.index).trim();
          if (gap) {
            blocks.push({
              tag: '#text',
              attrs: '',
              innerHTML: gap,
              outerHTML: gap,
            });
          }
        }

        currentTag = tag;
        currentAttrs = attrs;
        blockStart = match.index;
        contentStart = match.index + fullMatch.length;

        if (VOID.has(tag) || /\/\s*$/.test(attrs)) {
          // Self-closing or void element
          blocks.push({
            tag,
            attrs: attrs.replace(/\/\s*$/, '').trim(),
            innerHTML: '',
            outerHTML: fullMatch,
          });
          pos = match.index + fullMatch.length;
          blockStart = -1;
          depth = 0;
          currentTag = null;
          continue;
        }

        depth = 1;
      } else {
        if (tag === currentTag || !VOID.has(tag)) {
          depth++;
        }
      }
    } else {
      // Closing tag
      if (tag === currentTag || depth > 0) {
        depth--;
        if (depth === 0 && blockStart >= 0) {
          const innerHTML = s.substring(contentStart, match.index);
          const outerHTML = s.substring(blockStart, match.index + fullMatch.length);
          blocks.push({
            tag: currentTag,
            attrs: currentAttrs.trim(),
            innerHTML,
            outerHTML,
          });
          pos = match.index + fullMatch.length;
          blockStart = -1;
          currentTag = null;
        }
      }
    }
  }

  // Handle unclosed block at end of input (truncated HTML)
  if (blockStart >= 0 && currentTag) {
    const innerHTML = s.substring(contentStart);
    const outerHTML = s.substring(blockStart);
    blocks.push({
      tag: currentTag,
      attrs: currentAttrs.trim(),
      innerHTML,
      outerHTML,
    });
    pos = s.length;
  }

  // Remaining content after last block
  if (pos < s.length) {
    const remaining = s.substring(pos).trim();
    if (remaining) {
      blocks.push({
        tag: '#text',
        attrs: '',
        innerHTML: remaining,
        outerHTML: remaining,
      });
    }
  }

  return blocks;
}

// --- Lexical node builders ---

function makeParagraph(children) {
  return {
    type: 'paragraph',
    version: 1,
    children: children.length > 0 ? children : [],
    direction: 'ltr',
    format: '',
    indent: 0,
  };
}

function makeHeading(tag, children) {
  return {
    type: 'heading',
    version: 1,
    tag, // "h1", "h2", etc.
    children: children.length > 0 ? children : [],
    direction: 'ltr',
    format: '',
    indent: 0,
  };
}

function makeImage(src, alt, width, height, title, caption) {
  const node = {
    type: 'image',
    version: 1,
    src: src || '',
    width: width ? parseInt(width, 10) : null,
    height: height ? parseInt(height, 10) : null,
    alt: alt || '',
    title: title || '',
    caption: caption || '',
    cardWidth: 'regular',
  };
  return node;
}

function makeHorizontalRule() {
  return {
    type: 'horizontalrule',
    version: 1,
  };
}

function makeHtmlCard(html) {
  return {
    type: 'html',
    version: 1,
    html,
  };
}

function makeList(tag, innerHTML) {
  // tag is "ul" or "ol"
  const lexicalType = tag === 'ol' ? 'list' : 'list';
  const listType = tag === 'ol' ? 'number' : 'bullet';

  // Extract <li> items
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const items = [];
  let liMatch;
  let value = 1;
  while ((liMatch = liPattern.exec(innerHTML)) !== null) {
    const liContent = liMatch[1].trim();
    items.push({
      type: 'listitem',
      version: 1,
      value: value++,
      children: parseInlineContent(liContent),
      direction: 'ltr',
      format: '',
      indent: 0,
    });
  }

  if (items.length === 0) return null;

  return {
    type: 'list',
    version: 1,
    listType,
    start: 1,
    tag,
    children: items,
    direction: 'ltr',
    format: '',
    indent: 0,
  };
}

function makeBlockquote(innerHTML) {
  // Blockquote: convert to paragraph with italic text for simplicity,
  // or use html card since Lexical doesn't have a native blockquote node
  return makeHtmlCard(`<blockquote>${innerHTML}</blockquote>`);
}

// --- Main converter ---

/**
 * Convert HTML string to Ghost Lexical JSON string.
 *
 * @param {string} html - HTML content
 * @returns {object} - { lexical: "..." } ready for Ghost API
 */
function htmlToLexical(html) {
  if (!html) return {};

  const blocks = splitTopLevelBlocks(html);
  const children = [];

  for (const block of blocks) {
    const node = convertBlock(block);
    if (node) {
      if (Array.isArray(node)) {
        children.push(...node);
      } else {
        children.push(node);
      }
    }
  }

  // Ensure at least one child (Ghost requires non-empty root)
  if (children.length === 0) {
    children.push(makeParagraph([]));
  }

  const lexical = JSON.stringify({
    root: {
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });

  return { lexical };
}

/**
 * Convert a single top-level block to a Lexical node.
 */
function convertBlock(block) {
  const { tag, attrs, innerHTML, outerHTML } = block;

  switch (tag) {
    case 'p': {
      const inline = parseInlineContent(innerHTML);
      // Skip empty paragraphs
      if (inline.length === 0) return null;
      return makeParagraph(inline);
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const inline = parseInlineContent(innerHTML);
      if (inline.length === 0) return null;
      return makeHeading(tag, inline);
    }

    case 'img': {
      const src = getAttr(attrs, 'src');
      const alt = getAttr(attrs, 'alt');
      const width = getAttr(attrs, 'width');
      const height = getAttr(attrs, 'height');
      const title = getAttr(attrs, 'title');
      return makeImage(src, alt, width, height, title);
    }

    case 'hr':
      return makeHorizontalRule();

    case 'ul':
    case 'ol': {
      const list = makeList(tag, innerHTML);
      return list || makeHtmlCard(outerHTML);
    }

    case 'blockquote':
      return makeBlockquote(innerHTML);

    case 'figure': {
      // Check if it's a figure with an img (common pattern)
      const imgMatch = innerHTML.match(/<img\s+([^>]*)>/i);
      if (imgMatch) {
        const imgAttrs = imgMatch[1];
        const src = getAttr(imgAttrs, 'src');
        const alt = getAttr(imgAttrs, 'alt');
        const width = getAttr(imgAttrs, 'width');
        const height = getAttr(imgAttrs, 'height');
        const title = getAttr(imgAttrs, 'title');
        const captionMatch = innerHTML.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        return makeImage(src, alt, width, height, title, caption);
      }
      // Not a simple image figure — fall through to html card
      return makeHtmlCard(outerHTML);
    }

    case '#text': {
      // Bare text (no wrapping tag) — wrap in paragraph
      const inline = parseInlineContent(innerHTML);
      if (inline.length === 0) return null;
      return makeParagraph(inline);
    }

    case 'div': {
      // Check if it's a simple wrapper with only inline content or simple blocks
      // If it contains complex BeTheme structures, keep as html card
      if (hasComplexContent(innerHTML)) {
        return makeHtmlCard(outerHTML);
      }
      // Simple div with text content — try to extract paragraphs
      const innerBlocks = splitTopLevelBlocks(innerHTML);
      if (innerBlocks.length > 0) {
        const nodes = [];
        for (const inner of innerBlocks) {
          const n = convertBlock(inner);
          if (n) {
            if (Array.isArray(n)) nodes.push(...n);
            else nodes.push(n);
          }
        }
        return nodes.length > 0 ? nodes : null;
      }
      // Div with only inline content
      const inline = parseInlineContent(innerHTML);
      if (inline.length > 0) return makeParagraph(inline);
      return null;
    }

    case 'table':
    case 'section':
    case 'article':
    case 'aside':
    case 'nav':
    case 'header':
    case 'footer':
    case 'form':
    case 'iframe':
    case 'video':
    case 'audio':
    case 'pre':
    case 'script':
    case 'style':
      // Complex or structural elements — keep as html card
      return makeHtmlCard(outerHTML);

    default:
      // Unknown tag — html card fallback
      return makeHtmlCard(outerHTML);
  }
}

/**
 * Check if HTML contains complex nested structures that should stay as html card.
 */
function hasComplexContent(html) {
  // BeTheme-specific classes or deeply nested structures
  // Note: wso-privacy is a simple wrapper (Datenschutz page), not complex
  if (/class="[^"]*(?:mcb-|column_attr|sections_group|mfn-|esg-|rev_slider|wso-(?!privacy))/i.test(html)) {
    return true;
  }
  // Multiple nested divs (more than 2 levels)
  const divCount = (html.match(/<div/gi) || []).length;
  if (divCount > 2) return true;
  // Contains tables, forms, iframes
  if (/<(table|form|iframe|video|audio)\b/i.test(html)) return true;
  return false;
}

/**
 * Extract attribute value from attrs string.
 */
function getAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  if (match) return decodeHtmlEntities(match[1]);
  const matchSingle = attrs.match(new RegExp(`${name}='([^']*)'`, 'i'));
  if (matchSingle) return decodeHtmlEntities(matchSingle[1]);
  return '';
}

module.exports = { htmlToLexical, splitTopLevelBlocks, parseInlineContent };
