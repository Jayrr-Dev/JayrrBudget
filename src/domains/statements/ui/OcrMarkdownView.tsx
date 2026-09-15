"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders statement OCR markdown (headings, tables, lists) in the View OCR dialog.
 */
export function OcrMarkdownView({ markdown }: { markdown: string }) {
  const source = markdown.trim() || "(empty)";

  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-sm">
      <div className="ocr-md space-y-3 text-[var(--foreground)] [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_a]:underline">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-[var(--border)]">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="px-2 py-1.5 font-medium text-[var(--muted-foreground)]">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-[var(--border)] px-2 py-1.5 align-top">
                {children}
              </td>
            ),
            hr: () => <hr className="my-4 border-[var(--border)]" />,
            code: ({ children }) => (
              <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs">
                {children}
              </code>
            ),
          }}
        >
          {source}
        </ReactMarkdown>
      </div>
    </div>
  );
}
