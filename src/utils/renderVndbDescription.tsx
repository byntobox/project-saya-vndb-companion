import { type ReactNode } from 'react';

type SupportedTag = 'b' | 'i' | 'u' | 'url';

interface ParsedTagNode {
  tag: SupportedTag | 'root';
  url?: string;
  children: ReactNode[];
}

const SUPPORTED_TOKEN_PATTERN = /\[(\/?(?:b|i|u|url)(?:=[^\]]+)?)\]|\[br\]/gi;

function extractPlainText(nodes: ReactNode[]): string {
  return nodes
    .map((node) => (typeof node === 'string' ? node : ''))
    .join('')
    .trim();
}

function normalizeUrl(rawUrl: string): string | null {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0) {
    return null;
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsedUrl = new URL(withProtocol);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:') {
      return parsedUrl.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function renderTagNode(node: ParsedTagNode, key: string): ReactNode {
  if (node.tag === 'b') {
    return <strong key={key}>{node.children}</strong>;
  }

  if (node.tag === 'i') {
    return <em key={key}>{node.children}</em>;
  }

  if (node.tag === 'u') {
    return <u key={key}>{node.children}</u>;
  }

  const fallbackText = extractPlainText(node.children);
  const resolvedUrl = normalizeUrl(node.url ?? fallbackText);
  if (!resolvedUrl) {
    return <span key={key}>{node.children}</span>;
  }

  return (
    <a key={key} href={resolvedUrl} target="_blank" rel="noopener noreferrer">
      {node.children}
    </a>
  );
}

export function renderVndbDescription(descriptionText: string): ReactNode[] {
  const rootNode: ParsedTagNode = { tag: 'root', children: [] };
  const parseStack: ParsedTagNode[] = [rootNode];
  let currentSearchIndex = 0;
  let matchIndex = 0;

  for (const matchedToken of descriptionText.matchAll(SUPPORTED_TOKEN_PATTERN)) {
    const tokenStartIndex = matchedToken.index ?? 0;
    const tokenText = matchedToken[0];
    const parentNode = parseStack[parseStack.length - 1];

    if (tokenStartIndex > currentSearchIndex) {
      parentNode.children.push(descriptionText.slice(currentSearchIndex, tokenStartIndex));
    }

    const normalizedToken = tokenText.toLowerCase();
    if (normalizedToken === '[br]') {
      parentNode.children.push(<br key={`br-${matchIndex}`} />);
      currentSearchIndex = tokenStartIndex + tokenText.length;
      matchIndex += 1;
      continue;
    }

    const tokenBodyRaw = matchedToken[1] ?? '';
    const tokenBodyLower = tokenBodyRaw.toLowerCase();

    if (tokenBodyLower.startsWith('/')) {
      const closingTag = tokenBodyLower.slice(1);
      const activeNode = parseStack[parseStack.length - 1];

      if (parseStack.length > 1 && activeNode.tag === closingTag) {
        parseStack.pop();
        const activeParentNode = parseStack[parseStack.length - 1];
        activeParentNode.children.push(renderTagNode(activeNode, `tag-${matchIndex}`));
      } else {
        parentNode.children.push(tokenText);
      }
    } else {
      const isUrlTagWithArgument = tokenBodyLower.startsWith('url=');
      const openingTagName = (isUrlTagWithArgument ? 'url' : tokenBodyLower) as SupportedTag;

      if (openingTagName === 'b' || openingTagName === 'i' || openingTagName === 'u' || openingTagName === 'url') {
        const urlValue = isUrlTagWithArgument ? tokenBodyRaw.slice(4) : undefined;
        parseStack.push({ tag: openingTagName, url: urlValue, children: [] });
      } else {
        parentNode.children.push(tokenText);
      }
    }

    currentSearchIndex = tokenStartIndex + tokenText.length;
    matchIndex += 1;
  }

  if (currentSearchIndex < descriptionText.length) {
    parseStack[parseStack.length - 1].children.push(descriptionText.slice(currentSearchIndex));
  }

  while (parseStack.length > 1) {
    const danglingNode = parseStack.pop();
    if (!danglingNode) {
      break;
    }

    const parentNode = parseStack[parseStack.length - 1];
    parentNode.children.push(`[${danglingNode.tag}]`);
    parentNode.children.push(...danglingNode.children);
  }

  return rootNode.children;
}
