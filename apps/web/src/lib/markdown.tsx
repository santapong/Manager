import { Fragment, type JSX, type ReactNode } from "react";

/**
 * Tiny, dependency-free Markdown -> React renderer.
 *
 * SECURITY MODEL
 * --------------
 * This renderer is XSS-safe by construction:
 *   1. It NEVER uses `dangerouslySetInnerHTML`. Every piece of user text is
 *      emitted as a React text node or as `children` of a React element, so
 *      React escapes it. Raw HTML in the source is therefore rendered as
 *      literal text, not parsed.
 *   2. The only attribute we ever derive from user input is the `href` of a
 *      link. `safeHref` allow-lists the `http:`, `https:`, and `mailto:`
 *      schemes; anything else (notably `javascript:`, `data:`, `vbscript:`)
 *      is dropped and the link is rendered as plain text. All external links
 *      get `rel="noopener noreferrer" target="_blank"`.
 *
 * Supported subset: ATX headings, ordered/unordered lists, fenced code blocks
 * (```), blockquotes, blank-line-separated paragraphs (single newline -> <br/>),
 * and inline bold, italic (with asterisks or underscores), code, and links.
 *
 * The parser is intentionally line-based for readability; it is not a spec-
 * compliant CommonMark implementation and does not need to be.
 */

export function Markdown({ source }: { source: string }): JSX.Element {
  const blocks = parseBlocks(source ?? "");
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-800">
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block)}</Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "paragraph"; lines: string[] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

function parseBlocks(source: string): Block[] {
  // Normalize line endings; keep blank lines as block separators.
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Blank line -> skip (paragraph boundary).
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block: capture raw text verbatim until the closing fence.
    if (FENCE_RE.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // Heading.
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length,
        text: heading[2]!.trim(),
      });
      i++;
      continue;
    }

    // Blockquote: consecutive `>` lines.
    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        quoteLines.push(QUOTE_RE.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // Unordered list.
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i]!)) {
        items.push(UL_RE.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list.
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i]!)) {
        items.push(OL_RE.exec(lines[i]!)![1]!);
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph: consecutive non-blank lines that aren't another block type.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !FENCE_RE.test(lines[i]!) &&
      !HEADING_RE.test(lines[i]!) &&
      !QUOTE_RE.test(lines[i]!) &&
      !UL_RE.test(lines[i]!) &&
      !OL_RE.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }

  return blocks;
}

const HEADING_CLASSES: Record<number, string> = {
  1: "text-2xl font-bold tracking-tight",
  2: "text-xl font-bold tracking-tight",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-gray-600",
};

function renderBlock(block: Block): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
      return <Tag className={HEADING_CLASSES[block.level]}>{renderInline(block.text)}</Tag>;
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs">
          <code>{block.text}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-4 border-gray-200 pl-4 text-gray-600">
          {renderLinesWithBreaks(block.lines)}
        </blockquote>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-1 pl-5">
          {block.items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          {block.items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "paragraph":
      return <p>{renderLinesWithBreaks(block.lines)}</p>;
    default:
      return null;
  }
}

// Join multiple source lines with <br/> while rendering inline markup per line.
function renderLinesWithBreaks(lines: string[]): ReactNode {
  return lines.map((line, idx) => (
    <Fragment key={idx}>
      {idx > 0 ? <br /> : null}
      {renderInline(line)}
    </Fragment>
  ));
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

/**
 * Tokenizes inline markup into React nodes. Order of checks matters: code
 * spans win first (their contents are literal), then links, then emphasis.
 * Everything that isn't markup becomes a plain (auto-escaped) text node.
 */
function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let i = 0;
  let key = 0;

  const flush = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = "";
    }
  };

  while (i < text.length) {
    const ch = text[i]!;

    // Inline code span: `...` -- contents are literal, not further parsed.
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          <code
            key={key++}
            className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (ch === "[") {
      const link = matchLink(text, i);
      if (link) {
        flush();
        const href = safeHref(link.url);
        if (href) {
          nodes.push(
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              {renderInline(link.label)}
            </a>,
          );
        } else {
          // Unsafe scheme: render the label as plain text, drop the href.
          nodes.push(<Fragment key={key++}>{renderInline(link.label)}</Fragment>);
        }
        i = link.end;
        continue;
      }
    }

    // Bold: **...**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        nodes.push(<strong key={key++}>{renderInline(text.slice(i + 2, end))}</strong>);
        i = end + 2;
        continue;
      }
    }

    // Italic: *...* or _..._
    if (ch === "*" || ch === "_") {
      const end = text.indexOf(ch, i + 1);
      // Avoid treating an empty span or stray marker as italic.
      if (end !== -1 && end > i + 1) {
        flush();
        nodes.push(<em key={key++}>{renderInline(text.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i++;
  }

  flush();
  return nodes;
}

function matchLink(
  text: string,
  start: number,
): { label: string; url: string; end: number } | null {
  // Expect [label](url) starting at `start` (text[start] === "[").
  const labelEnd = text.indexOf("]", start + 1);
  if (labelEnd === -1) return null;
  if (text[labelEnd + 1] !== "(") return null;
  const urlEnd = text.indexOf(")", labelEnd + 2);
  if (urlEnd === -1) return null;
  return {
    label: text.slice(start + 1, labelEnd),
    url: text.slice(labelEnd + 2, urlEnd).trim(),
    end: urlEnd + 1,
  };
}

/**
 * Allow-list URL schemes. Returns the URL when safe, or null to signal the
 * caller to drop the link. Relative/anchor URLs (no scheme) are allowed since
 * they cannot execute script.
 */
function safeHref(raw: string): string | null {
  // Strip surrounding whitespace, then reject any URL containing control
  // characters or interior whitespace. This defeats scheme-smuggling tricks
  // like a tab/newline inside "java\tscript:" that browsers may strip before
  // dispatching. We test char codes (<= 0x20 covers space/tab/newline/etc.)
  // so no control bytes need to live in this source file.
  const url = raw.trim();
  if (url === "") return null;
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) <= 0x20) return null;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!schemeMatch) {
    // No scheme -- relative path, anchor, or query. Safe to render.
    return url;
  }
  const scheme = schemeMatch[1]!.toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto") {
    return url;
  }
  return null;
}
