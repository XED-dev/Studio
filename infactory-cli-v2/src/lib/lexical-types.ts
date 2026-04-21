/**
 * lib/lexical-types.ts — Ghost Lexical JSON Schema (CLI-M5.X)
 *
 * Diese Types decken die Subset von Lexical-Nodes ab, die `htmlToLexical()`
 * erzeugt. Komplette Lexical-Schema-Coverage liegt nicht in unserem Scope —
 * wir generieren, Ghost rendert.
 *
 * Wichtig: Lexical's `format`-Feld auf Text-Nodes ist eine BITMASK:
 *   1 = bold, 2 = italic, 4 = strikethrough, 8 = underline.
 * Mehrere Formate können kombiniert werden (z.B. 3 = bold + italic).
 *
 * Auf Container-Nodes (paragraph, heading, link, list, listitem) ist `format`
 * dagegen ein STRING (Text-Alignment: '', 'left', 'center', 'right', …).
 * Diese Inkonsistenz ist Lexical-spezifisch, nicht unser Design.
 */

export type LexicalDirection = 'ltr' | 'rtl' | null

/** Bitmask: 1=bold, 2=italic, 4=strike, 8=underline. */
export type LexicalTextFormat = number

export interface LexicalText {
  detail: number
  format: LexicalTextFormat
  mode: 'normal' | 'segmented' | 'token'
  style: string
  text: string
  type: 'text'
  version: 1
}

export interface LexicalLinebreak {
  type: 'linebreak'
  version: 1
}

export interface LexicalLink {
  children: LexicalText[]
  direction: LexicalDirection
  format: string
  indent: number
  rel: null | string
  target: null | string
  title: null | string
  type: 'link'
  url: string
  version: 1
}

export type LexicalInline = LexicalLinebreak | LexicalLink | LexicalText

export interface LexicalParagraph {
  children: LexicalInline[]
  direction: LexicalDirection
  format: string
  indent: number
  type: 'paragraph'
  version: 1
}

export interface LexicalHeading {
  children: LexicalInline[]
  direction: LexicalDirection
  format: string
  indent: number
  /** "h1" | "h2" | "h3" | "h4" | "h5" | "h6" */
  tag: string
  type: 'heading'
  version: 1
}

export interface LexicalImage {
  alt: string
  caption: string
  cardWidth: 'full' | 'regular' | 'wide'
  height: null | number
  src: string
  title: string
  type: 'image'
  version: 1
  width: null | number
}

export interface LexicalHorizontalRule {
  type: 'horizontalrule'
  version: 1
}

/** Ghost html-Card als Lexical-Node. Fallback für nicht-mappable HTML. */
export interface LexicalHtml {
  html: string
  type: 'html'
  version: 1
}

export interface LexicalListItem {
  children: LexicalInline[]
  direction: LexicalDirection
  format: string
  indent: number
  type: 'listitem'
  value: number
  version: 1
}

export interface LexicalList {
  children: LexicalListItem[]
  direction: LexicalDirection
  format: string
  indent: number
  /** "bullet" für ul, "number" für ol. */
  listType: 'bullet' | 'check' | 'number'
  start: number
  /** "ul" | "ol" */
  tag: string
  type: 'list'
  version: 1
}

export type LexicalBlock =
  | LexicalHeading
  | LexicalHorizontalRule
  | LexicalHtml
  | LexicalImage
  | LexicalList
  | LexicalParagraph

export type LexicalNode = LexicalBlock | LexicalInline | LexicalListItem

export interface LexicalRoot {
  root: {
    children: LexicalBlock[]
    direction: LexicalDirection
    format: string
    indent: number
    type: 'root'
    version: 1
  }
}

/**
 * Output-Shape von `htmlToLexical()`. Ghost erwartet `lexical` als
 * JSON-string-Feld im Page/Post-Body — daher String, nicht Object.
 *
 * Für leeren Input-HTML wird `{}` zurückgegeben (kein lexical-Feld) — das
 * ist Convention der Legacy-CLI: spread `{...htmlToLexical(html)}` führt
 * dann zu keinem Override des bestehenden lexical-Feldes.
 */
export interface HtmlToLexicalResult {
  lexical?: string
}
