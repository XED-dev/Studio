/**
 * lib/html-to-lexical.ts — HTML → Ghost Lexical JSON Converter (CLI-M5.X)
 *
 * TypeScript-Port von infactory-cli/src/html-to-lexical.js (597 LOC CJS).
 *
 * Architektur (unverändert vs. Legacy):
 *   Block-Layer:  splitTopLevelBlocks() — regex-basierter Tokenizer mit
 *                 Nesting-Depth-Tracking. Kein cheerio, keine externe Dep.
 *   Inline-Layer: parseInlineContent() — Token-Stream + Stack-Maschine für
 *                 verschachtelte Format-Tags (bold/italic/strike/underline)
 *                 und Links.
 *   Konverter:    convertBlock() — Tag-Dispatch zu Lexical-Node-Buildern.
 *   Builder:      makeParagraph/Heading/Image/List/HorizontalRule/HtmlCard.
 *
 * Verhalten:
 *   - Bekannte Tags (p/h1-h6/img/hr/ul/ol/figure-mit-img/blockquote) →
 *     dedizierte Lexical-Nodes.
 *   - Unbekannte oder komplexe Tags (table, iframe, script, BeTheme-divs) →
 *     Ghost html-Card (Fallback). Kein Throw — html-Card ist neutral.
 *   - Leerer Input → `{}` (kein lexical-Feld, damit `spread` keinen Override macht).
 *
 * Pure: kein FS, kein HTTP, deterministic. Trivial testbar mit Fixtures.
 *
 * Was NICHT in M5.X (Scope-Bound):
 *   - createPage/createPost (Dead-Code in Legacy-CLI — kein Caller in v2)
 *   - Lexical-zu-HTML Rückweg (Ghost rendert serverseitig)
 *   - Mobiledoc (Legacy-Format vor Lexical)
 *   - Custom Cards außer html + image
 */
/* eslint-disable no-bitwise -- Lexical's text-format ist eine bitmask, |= ist hier korrektes Schema-Encoding */

import type {
  HtmlToLexicalResult,
  LexicalBlock,
  LexicalHeading,
  LexicalHorizontalRule,
  LexicalHtml,
  LexicalImage,
  LexicalInline,
  LexicalLinebreak,
  LexicalLink,
  LexicalList,
  LexicalListItem,
  LexicalParagraph,
  LexicalText,
  LexicalTextFormat,
} from './lexical-types.js'

// ── Format-Bitmask-Konstanten ─────────────────────────────────────────────────

const FORMAT_BOLD: LexicalTextFormat = 1
const FORMAT_ITALIC: LexicalTextFormat = 2
const FORMAT_STRIKE: LexicalTextFormat = 4
const FORMAT_UNDERLINE: LexicalTextFormat = 8

/** Singleton — linebreak hat keinen Zustand, daher konstant teilbar. */
const LINEBREAK_NODE: LexicalLinebreak = {type: 'linebreak', version: 1}

// ── HTML-Entity-Decoding (pure) ───────────────────────────────────────────────

/**
 * Dekodiert die wichtigsten HTML-Entities. Bewusst minimal — Lexical-Output
 * geht durch Ghost-Sanitizer, der den Rest übernimmt.
 *
 * Unterstützt: &amp; &lt; &gt; &quot; &#39; &nbsp; +
 *              numerische dezimale (`&#123;`) + hex (`&#x7b;`) Entities.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replaceAll(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
}

/**
 * Extrahiert ein Attribut aus dem rohen attrs-String eines Tags.
 * Akzeptiert sowohl "..." als auch '...' Quotes. Liefert decoded String
 * oder leer-String wenn nicht gefunden.
 */
export function getAttr(attrs: string, name: string): string {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const doubleMatch = new RegExp(`${escapedName}="([^"]*)"`, 'i').exec(attrs)
  if (doubleMatch) return decodeHtmlEntities(doubleMatch[1])
  const singleMatch = new RegExp(`${escapedName}='([^']*)'`, 'i').exec(attrs)
  if (singleMatch) return decodeHtmlEntities(singleMatch[1])
  return ''
}

// ── Inline-Parser ─────────────────────────────────────────────────────────────

interface LinkContext {
  rel: null | string
  target: null | string
  title: null | string
  url: string
}

/**
 * Pop'd das oberste Vorkommen eines Format-Flags vom Stack (LIFO mit Filter).
 * Verschachtelte Tags wie `<b><i>x</i></b>` werden korrekt aufgelöst.
 */
function popFormat(stack: LexicalTextFormat[], flag: LexicalTextFormat): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === flag) {
      stack.splice(i, 1)
      return
    }
  }
}

/**
 * Parst Inline-HTML in eine Liste von Lexical-Inline-Nodes (text/link/linebreak).
 *
 * Unterstützt: <strong>/<b>, <em>/<i>, <s>/<strike>/<del>, <u>, <a>, <br>.
 * Andere Inline-Tags (z.B. <span>) werden ignoriert (Text fließt durch).
 */
export function parseInlineContent(html: string): LexicalInline[] {
  if (!html || html.trim().length === 0) return []

  const children: LexicalInline[] = []
  // <br>-Varianten zu \n normalisieren — wird unten zu linebreak-Nodes.
  const normalized = html.replaceAll(/<br\s*\/?>/gi, '\n')
  const tokens = normalized.split(/(<[^>]+>)/g).filter((t) => t.length > 0)

  const formatStack: LexicalTextFormat[] = []
  const linkStack: LinkContext[] = []

  const currentFormat = (): LexicalTextFormat => {
    let format = 0
    for (const f of formatStack) format |= f
    return format
  }

  const currentLink = (): LinkContext | null =>
    linkStack.length > 0 ? linkStack.at(-1) ?? null : null

  const buildText = (text: string): LexicalText => ({
    detail: 0,
    format: currentFormat(),
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  })

  const pushText = (text: string): void => {
    if (!text) return
    const parts = text.split('\n')
    for (const [i, t] of parts.entries()) {
      if (i > 0) children.push(LINEBREAK_NODE)
      if (!t) continue

      const decoded = decodeHtmlEntities(t)
      const link = currentLink()
      if (link) {
        const linkNode: LexicalLink = {
          children: [buildText(decoded)],
          direction: 'ltr',
          format: '',
          indent: 0,
          rel: link.rel,
          target: link.target,
          title: link.title,
          type: 'link',
          url: link.url,
          version: 1,
        }
        children.push(linkNode)
      } else {
        children.push(buildText(decoded))
      }
    }
  }

  for (const token of tokens) {
    if (token.startsWith('<')) {
      // Opening tags
      if (/^<(strong|b)[\s>]/i.test(token)) formatStack.push(FORMAT_BOLD)
      else if (/^<(em|i)[\s>]/i.test(token)) formatStack.push(FORMAT_ITALIC)
      else if (/^<(s|strike|del)[\s>]/i.test(token)) formatStack.push(FORMAT_STRIKE)
      else if (/^<u[\s>]/i.test(token)) formatStack.push(FORMAT_UNDERLINE)
      else if (/^<a[\s]/i.test(token)) {
        linkStack.push({
          rel: getAttr(token, 'rel') || null,
          target: getAttr(token, 'target') || null,
          title: getAttr(token, 'title') || null,
          url: getAttr(token, 'href'),
        })
      }
      // Closing tags
      else if (/^<\/(strong|b)>/i.test(token)) popFormat(formatStack, FORMAT_BOLD)
      else if (/^<\/(em|i)>/i.test(token)) popFormat(formatStack, FORMAT_ITALIC)
      else if (/^<\/(s|strike|del)>/i.test(token)) popFormat(formatStack, FORMAT_STRIKE)
      else if (/^<\/u>/i.test(token)) popFormat(formatStack, FORMAT_UNDERLINE)
      else if (/^<\/a>/i.test(token)) linkStack.pop()
      // Andere Tags (span etc.) werden silent ignoriert — Text-Inhalte bleiben.
    } else {
      pushText(token)
    }
  }

  return children
}

// ── Block-Parser ──────────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr',
])

export interface HtmlBlock {
  attrs: string
  innerHTML: string
  outerHTML: string
  /** "#text" für nackten Text zwischen Blocks. */
  tag: string
}

/**
 * Splittet HTML in top-level Blocks. Tracked Nesting-Depth, sodass z.B.
 * `<div><div>x</div></div>` als ein Block kommt.
 *
 * Text zwischen Blocks wird als `#text`-Pseudo-Block aufgenommen.
 *
 * Robust gegen unclosed Tags am Ende (z.B. truncated HTML aus Crawlers) —
 * der unclosed Block wird mit dem Rest des Inputs als innerHTML aufgenommen.
 */
export function splitTopLevelBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = []
  if (!html || html.trim().length === 0) return blocks

  const s = html.trim()
  const tagPattern = /<(\/?)(\w+)([^>]*)>/g

  let depth = 0
  let currentTag: null | string = null
  let currentAttrs = ''
  let blockStart = -1
  let contentStart = -1
  let pos = 0

  // Text vor erstem Tag
  const firstTag = s.indexOf('<')
  if (firstTag > 0) {
    const textBefore = s.slice(0, firstTag).trim()
    if (textBefore) {
      blocks.push({attrs: '', innerHTML: textBefore, outerHTML: textBefore, tag: '#text'})
    }
  }

  let match: null | RegExpExecArray
  tagPattern.lastIndex = 0

  while ((match = tagPattern.exec(s)) !== null) {
    const [fullMatch, slash, tagName, attrs] = match
    const tag = tagName.toLowerCase()

    if (slash) {
      // Closing tag
      if (tag === currentTag || depth > 0) {
        depth--
        if (depth === 0 && blockStart >= 0 && currentTag) {
          const innerHTML = s.slice(contentStart, match.index)
          const outerHTML = s.slice(blockStart, match.index + fullMatch.length)
          blocks.push({attrs: currentAttrs.trim(), innerHTML, outerHTML, tag: currentTag})
          pos = match.index + fullMatch.length
          blockStart = -1
          currentTag = null
        }
      }
    } else if (depth === 0) {
      // Top-level Opening tag — Text-Gap zwischen Blocks erfassen
      if (match.index > pos && pos > 0) {
        const gap = s.slice(pos, match.index).trim()
        if (gap) {
          blocks.push({attrs: '', innerHTML: gap, outerHTML: gap, tag: '#text'})
        }
      }

      currentTag = tag
      currentAttrs = attrs
      blockStart = match.index
      contentStart = match.index + fullMatch.length

      // Void- oder self-closing Element direkt abschließen
      if (VOID_ELEMENTS.has(tag) || /\/\s*$/.test(attrs)) {
        blocks.push({
          attrs: attrs.replaceAll(/\/\s*$/g, '').trim(),
          innerHTML: '',
          outerHTML: fullMatch,
          tag,
        })
        pos = match.index + fullMatch.length
        blockStart = -1
        depth = 0
        currentTag = null
        continue
      }

      depth = 1
    } else if (tag === currentTag || !VOID_ELEMENTS.has(tag)) {
      // Nested opening tag innerhalb eines Blocks
      depth++
    }
  }

  // Unclosed Block am Ende (truncated Input)
  if (blockStart >= 0 && currentTag) {
    blocks.push({
      attrs: currentAttrs.trim(),
      innerHTML: s.slice(contentStart),
      outerHTML: s.slice(blockStart),
      tag: currentTag,
    })
    pos = s.length
  }

  // Trailing Text
  if (pos < s.length) {
    const remaining = s.slice(pos).trim()
    if (remaining) {
      blocks.push({attrs: '', innerHTML: remaining, outerHTML: remaining, tag: '#text'})
    }
  }

  return blocks
}

// ── Lexical-Node-Builder (pure) ───────────────────────────────────────────────

function makeParagraph(children: LexicalInline[]): LexicalParagraph {
  return {
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
  }
}

function makeHeading(tag: string, children: LexicalInline[]): LexicalHeading {
  return {
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    tag,
    type: 'heading',
    version: 1,
  }
}

function makeImage(
  src: string,
  alt: string,
  width: string,
  height: string,
  title: string,
  caption = '',
): LexicalImage {
  return {
    alt: alt || '',
    caption: caption || '',
    cardWidth: 'regular',
    height: height ? Number.parseInt(height, 10) : null,
    src: src || '',
    title: title || '',
    type: 'image',
    version: 1,
    width: width ? Number.parseInt(width, 10) : null,
  }
}

function makeHorizontalRule(): LexicalHorizontalRule {
  return {type: 'horizontalrule', version: 1}
}

function makeHtmlCard(html: string): LexicalHtml {
  return {html, type: 'html', version: 1}
}

function makeList(tag: 'ol' | 'ul', innerHTML: string): LexicalList | null {
  const listType: 'bullet' | 'number' = tag === 'ol' ? 'number' : 'bullet'
  const items: LexicalListItem[] = []
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: null | RegExpExecArray
  let value = 1
  while ((liMatch = liPattern.exec(innerHTML)) !== null) {
    const liContent = liMatch[1].trim()
    items.push({
      children: parseInlineContent(liContent),
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'listitem',
      value: value++,
      version: 1,
    })
  }

  if (items.length === 0) return null

  return {
    children: items,
    direction: 'ltr',
    format: '',
    indent: 0,
    listType,
    start: 1,
    tag,
    type: 'list',
    version: 1,
  }
}

/**
 * Detection für nicht-mappable Inhalte (BeTheme-Klassen, tiefe Verschachtelung,
 * tables/forms/iframes). Trigger → html-Card statt unwrap.
 */
export function hasComplexContent(html: string): boolean {
  // BeTheme/MFN/Slider/Privacy-Klassen (wso-privacy ist simpler Wrapper, ausgenommen)
  if (/class="[^"]*(?:column_attr|esg-|mcb-|mfn-|rev_slider|sections_group|wso-(?!privacy))/i.test(html)) {
    return true
  }

  const divCount = (html.match(/<div/gi) ?? []).length
  if (divCount > 2) return true

  if (/<(audio|form|iframe|table|video)\b/i.test(html)) return true

  return false
}

// ── Block-Konverter (impure: kann sich rekursiv aufrufen für divs) ───────────

/**
 * Wandelt einen einzelnen Block in einen oder mehrere Lexical-Nodes.
 * Liefert null wenn der Block leer ist (z.B. leere Paragraph).
 */
function convertBlock(block: HtmlBlock): LexicalBlock | LexicalBlock[] | null {
  const {attrs, innerHTML, outerHTML, tag} = block

  switch (tag) {
    case '#text': {
      const inline = parseInlineContent(innerHTML)
      return inline.length > 0 ? makeParagraph(inline) : null
    }

    case 'blockquote': {
      // Kein native blockquote in Ghost-Lexical → html-Card
      return makeHtmlCard(`<blockquote>${innerHTML}</blockquote>`)
    }

    case 'div': {
      if (hasComplexContent(innerHTML)) return makeHtmlCard(outerHTML)
      const innerBlocks = splitTopLevelBlocks(innerHTML)
      if (innerBlocks.length > 0) {
        const nodes: LexicalBlock[] = []
        for (const inner of innerBlocks) {
          const n = convertBlock(inner)
          if (!n) continue
          if (Array.isArray(n)) nodes.push(...n)
          else nodes.push(n)
        }

        return nodes.length > 0 ? nodes : null
      }

      const inline = parseInlineContent(innerHTML)
      return inline.length > 0 ? makeParagraph(inline) : null
    }

    case 'figure': {
      const imgMatch = /<img\s+([^>]*)>/i.exec(innerHTML)
      if (imgMatch) {
        const imgAttrs = imgMatch[1]
        const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(innerHTML)
        return makeImage(
          getAttr(imgAttrs, 'src'),
          getAttr(imgAttrs, 'alt'),
          getAttr(imgAttrs, 'width'),
          getAttr(imgAttrs, 'height'),
          getAttr(imgAttrs, 'title'),
          captionMatch ? captionMatch[1].trim() : '',
        )
      }

      return makeHtmlCard(outerHTML)
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const inline = parseInlineContent(innerHTML)
      return inline.length > 0 ? makeHeading(tag, inline) : null
    }

    case 'hr': {
      return makeHorizontalRule()
    }

    case 'img': {
      return makeImage(
        getAttr(attrs, 'src'),
        getAttr(attrs, 'alt'),
        getAttr(attrs, 'width'),
        getAttr(attrs, 'height'),
        getAttr(attrs, 'title'),
      )
    }

    case 'ol':
    case 'ul': {
      const list = makeList(tag, innerHTML)
      return list ?? makeHtmlCard(outerHTML)
    }

    case 'p': {
      const inline = parseInlineContent(innerHTML)
      return inline.length > 0 ? makeParagraph(inline) : null
    }

    // Komplexe / strukturelle Elemente — html-Card.
    // 'p' steht oberhalb mit eigener Logik (Paragraph-Builder), nicht
    // in diesem Block — perfectionist's strict-alphabetic-Sort kann das
    // nicht erkennen, daher inline-disable für den nächsten Case.
    // eslint-disable-next-line perfectionist/sort-switch-case -- p hat eigene Logik oben
    case 'article':
    case 'aside':
    case 'audio':
    case 'footer':
    case 'form':
    case 'header':
    case 'iframe':
    case 'nav':
    case 'pre':
    case 'script':
    case 'section':
    case 'style':
    case 'table':
    case 'video': {
      return makeHtmlCard(outerHTML)
    }

    default: {
      return makeHtmlCard(outerHTML)
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Konvertiert HTML in Ghost Lexical JSON.
 *
 * @param html — HTML-String (z.B. aus crawl4ai oder anderem Content-Extraktor).
 * @returns `{lexical: "<JSON-string>"}` oder `{}` bei leerem Input.
 *
 * Das `{}` für leeren Input ist Convention der Legacy-CLI: spread
 * `{...htmlToLexical(html)}` ergibt dann kein lexical-Feld → bestehendes
 * Page-Lexical-Feld bleibt unverändert.
 */
export function htmlToLexical(html: null | string | undefined): HtmlToLexicalResult {
  if (!html) return {}

  const blocks = splitTopLevelBlocks(html)
  const children: LexicalBlock[] = []

  for (const block of blocks) {
    const node = convertBlock(block)
    if (!node) continue
    if (Array.isArray(node)) children.push(...node)
    else children.push(node)
  }

  // Ghost erwartet mindestens ein Kind im root.
  if (children.length === 0) {
    children.push(makeParagraph([]))
  }

  return {
    lexical: JSON.stringify({
      root: {
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }),
  }
}
