from pathlib import Path

path = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = path.read_text(encoding="utf-8")

old = """                      <td className=\"px-3 py-1.5 text-right align-top\">
                        {isCredit ? (
                          <ArrowBigUp
                            className=\"ml-auto size-4 text-[var(--foreground)]\"
                            aria-label=\"Credit\"
                          />
                        ) : (
                          <ArrowBigDown
                            className=\"ml-auto size-4 text-[var(--muted-foreground)]\"
                            aria-label=\"Debit\"
                          />
                        )}
                      </td>"""

new = """                      <td className=\"px-3 py-1.5 text-right align-top\">
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            isCredit
                              ? \"text-[var(--foreground)]\"
                              : \"text-[var(--muted-foreground)]\"
                          }`}
                          aria-label={isCredit ? \"Credit\" : \"Debit\"}
                        >
                          {isCredit ? \"CR\" : \"DR\"}
                        </span>
                      </td>"""

if old not in text:
    raise SystemExit("OLD BLOCK NOT FOUND")

text = text.replace(old, new, 1)
text = text.replace(
    'import { ArrowBigDown, ArrowBigUp, ChevronDownIcon } from "lucide-react";',
    'import { ChevronDownIcon } from "lucide-react";',
    1,
)
path.write_text(text, encoding="utf-8")
print("OK")
