"use client";

import { tidyPiggyMarkdown } from "@/domains/ledger-ai/domain/tidyPiggyMarkdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** GFM in Piggy bubbles: tables, lists, bold. Tidies glued ** and fake pipe rows first. */
export function PiggyMarkdown({ text }: { text: string }) {
  const source = tidyPiggyMarkdown(text);
  return (
    <div className="min-w-0 space-y-2 text-sm [&_p]:leading-relaxed [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_a]:underline [&_a]:underline-offset-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-1.5 overflow-x-auto rounded-lg ring-1 ring-border/70">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-accent-subtle/50 text-foreground">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/70 px-2 py-1.5 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-2 border-border" />,
          code: ({ children }) => (
            <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[0.8em]">
              {children}
            </code>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
