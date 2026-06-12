// Minimal markdown renderer for chat replies — headings, bold, italics, inline
// code, fenced code blocks, bullet/numbered lists. Deliberately tiny (no deps)
// and safe: everything is rendered as React text nodes, never HTML.

import React from "react";

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Split on inline code first, then bold, then italics.
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="bg-[#0d1117] border border-[#21262d] rounded px-1 py-0.5 text-[0.85em] font-mono text-[#e6edf3]">
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**") && bp.length > 4) {
        nodes.push(
          <strong key={`${keyPrefix}-b${i}-${j}`} className="text-[#e6edf3] font-semibold">
            {bp.slice(2, -2)}
          </strong>,
        );
      } else if (bp) {
        nodes.push(bp);
      }
    });
  });
  return nodes;
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trimStart().startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="bg-[#0d1117] border border-[#21262d] rounded p-2.5 my-1.5 overflow-x-auto text-xs font-mono text-[#e6edf3]">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={key++} className="font-semibold text-[#e6edf3] mt-2 mb-1">
          {renderInline(heading[2] ?? "", `h${key}`)}
        </p>,
      );
      i++;
      continue;
    }

    // Table — consecutive lines starting with "|"
    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) {
        const raw = (lines[i] ?? "").trim();
        // Skip the |---|---| separator row
        if (!/^[\s|:-]+$/.test(raw)) {
          rows.push(raw.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        blocks.push(
          <div key={key++} className="my-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {(head ?? []).map((c, j) => (
                    <th key={j} className="text-left font-semibold text-[#e6edf3] border border-[#30363d] bg-[#161b22] px-2 py-1.5 align-top">
                      {renderInline(c, `th${key}-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, j) => (
                      <td key={j} className="border border-[#30363d] px-2 py-1.5 align-top">
                        {renderInline(c, `td${key}-${r}-${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // Bullet / numbered list — gather consecutive items
    const isListItem = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1 space-y-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="h-1 w-1 rounded-full bg-[#8b949e] shrink-0 mt-[0.5em]" />
              <span className="min-w-0">{renderInline(item, `li${key}-${j}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — gather until blank/structural line
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !isListItem(lines[i] ?? "") &&
      !/^#{1,4}\s/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").trimStart().startsWith("```")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1 leading-relaxed">
        {renderInline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className="text-sm text-[#c9d1d9] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{blocks}</div>;
}
