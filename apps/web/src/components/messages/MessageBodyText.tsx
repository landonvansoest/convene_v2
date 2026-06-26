"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const MD_LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<]+/g;

export type MessageBodyTextVariant = "theirs" | "mine" | "solidMine" | "inbox";

type Props = {
  text: string;
  variant?: MessageBodyTextVariant;
  className?: string;
};

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function linkClassName(variant: MessageBodyTextVariant): string {
  switch (variant) {
    case "solidMine":
      return "font-medium text-white underline underline-offset-2 hover:text-white/90";
    case "mine":
    case "inbox":
    case "theirs":
    default:
      return "font-medium text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/80";
  }
}

function renderBareUrlSegment(url: string, variant: MessageBodyTextVariant, key: number): ReactNode {
  if (!isSafeHttpUrl(url)) {
    return <Fragment key={key}>{url}</Fragment>;
  }
  return (
    <MessageBodyLink key={key} href={url} variant={variant}>
      {url}
    </MessageBodyLink>
  );
}

function renderPlainSegment(chunk: string, variant: MessageBodyTextVariant, keyStart: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = keyStart;
  let match: RegExpExecArray | null;
  BARE_URL_RE.lastIndex = 0;
  while ((match = BARE_URL_RE.exec(chunk)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{chunk.slice(lastIndex, match.index)}</Fragment>);
    }
    nodes.push(renderBareUrlSegment(match[0], variant, key++));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < chunk.length) {
    nodes.push(<Fragment key={key++}>{chunk.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

/** Turn template markdown `[label](https://…)` and bare URLs into React nodes. */
export function buildMessageBodyNodes(text: string, variant: MessageBodyTextVariant): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  MD_LINK_RE.lastIndex = 0;
  while ((match = MD_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderPlainSegment(text.slice(lastIndex, match.index), variant, key));
      key += 100;
    }
    const href = match[2];
    const label = match[1];
    if (isSafeHttpUrl(href)) {
      nodes.push(
        <MessageBodyLink key={key++} href={href} variant={variant}>
          {label}
        </MessageBodyLink>,
      );
    } else {
      nodes.push(<Fragment key={key++}>{match[0]}</Fragment>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...renderPlainSegment(text.slice(lastIndex), variant, key));
  }
  return nodes;
}

function MessageBodyLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: MessageBodyTextVariant;
  children: ReactNode;
}) {
  const className = linkClassName(variant);
  try {
    const url = new URL(href);
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return (
        <Link href={`${url.pathname}${url.search}${url.hash}`} className={className}>
          {children}
        </Link>
      );
    }
  } catch {
    /* fall through to external anchor */
  }
  return (
    <a href={href} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function MessageBodyText({ text, variant = "theirs", className }: Props) {
  if (!text) return null;
  return (
    <p className={cn("whitespace-pre-wrap", className)}>{buildMessageBodyNodes(text, variant)}</p>
  );
}
