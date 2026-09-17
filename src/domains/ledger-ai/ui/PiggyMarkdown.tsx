"use client";

import { isHttpUrl, tidyPiggyMarkdown } from "@/domains/ledger-ai/domain/tidyPiggyMarkdown";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return nodeText(props.children);
  }
  return "";
}

function BoardRefLabel({
  label,
  onLocalRef,
}: {
  label: string;
  onLocalRef?: (label: string) => boolean;
}) {
  if (!label) return null;
  if (!onLocalRef) {
    return <span className="font-semibold">{label}</span>;
  }
  return (
    <button
      type="button"
      className="font-semibold text-accent underline underline-offset-2"
      onClick={() => {
        onLocalRef(label);
      }}
    >
      {label}
    </button>
  );
}

function MarkdownImage({
  src,
  alt,
  onLocalRef,
}: {
  src: string;
  alt: string;
  onLocalRef?: (label: string) => boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!isHttpUrl(src) || failed) {
    return <BoardRefLabel label={alt} onLocalRef={onLocalRef} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="max-h-48 max-w-full rounded-md"
    />
  );
}

/** GFM artifacts: tables, lists, task checks, fenced code. Tidies glued ** first. */
export function PiggyMarkdown({
  text,
  className,
  onLocalRef,
}: {
  text: string;
  className?: string;
  /** Handle markdown images/links that are board titles, not real URLs. */
  onLocalRef?: (label: string) => boolean;
}) {
  const source = tidyPiggyMarkdown(text);
  return (
    <div
      className={cn(
        "min-w-0 space-y-2 text-sm [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-1.5 overflow-x-auto rounded-lg ring-1 ring-border/70">
              <table className="w-full min-w-[20rem] border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-accent-subtle/50 text-foreground">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap px-2 py-1.5 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/70 px-2 py-1.5 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-2 border-border" />,
          input: ({ type, checked }) =>
            type === "checkbox" ? (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                readOnly
                className="pointer-events-none mr-1.5 align-middle"
                tabIndex={-1}
              />
            ) : null,
          pre: ({ children }) => (
            <pre className="my-1.5 overflow-x-auto rounded-lg bg-foreground/5 p-2 font-mono text-[0.8em] leading-relaxed">
              {children}
            </pre>
          ),
          code: ({ className: codeClass, children }) => {
            if (codeClass) {
              return <code className={codeClass}>{children}</code>;
            }
            return (
              <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[0.8em]">
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            <MarkdownImage
              src={typeof src === "string" ? src : ""}
              alt={(alt ?? "").trim()}
              onLocalRef={onLocalRef}
            />
          ),
          a: ({ href, children }) => {
            const url = href?.trim() ?? "";
            if (isHttpUrl(url) || url.startsWith("mailto:")) {
              return (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            }
            const label = nodeText(children).trim() || url;
            return <BoardRefLabel label={label} onLocalRef={onLocalRef} />;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
