import { LS_HISTORY_KEY, LS_VAULT_KEY, type QueryEntry, type VaultEntry, type ParsedSection } from "./types";

export function loadHistory(): QueryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveHistory(entries: QueryEntry[]) {
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(entries.slice(0, 5)));
}

export function loadVault(): VaultEntry[] {
  try {
    const raw = localStorage.getItem(LS_VAULT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveVault(entries: VaultEntry[]) {
  localStorage.setItem(LS_VAULT_KEY, JSON.stringify(entries));
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function parseResponse(raw: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\[.*\]$/.test(line.trim())) {
      sections.push({ type: "heading", content: line.trim().replace(/^\[|\]$/g, "") });
      i++;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const lang = line.trim().replace(/^```/, "").trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      sections.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      sections.push({ type: "table", content: tableLines.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const textLines: string[] = [];
    while (
      i < lines.length &&
      !lines[i].trim().startsWith("```") &&
      !/^\[.*\]$/.test(lines[i].trim()) &&
      !(lines[i].includes("|") && lines[i].trim().startsWith("|"))
    ) {
      if (lines[i].trim() === "" && textLines.length > 0) {
        textLines.push("");
        i++;
        continue;
      }
      textLines.push(lines[i]);
      i++;
    }

    const joined = textLines.join("\n").trim();
    if (joined) {
      sections.push({ type: "text", content: joined });
    }
  }

  return sections;
}

export function formatResponseAsMarkdown(query: string, response: string, mode: string): string {
  return `# IT Ops Console — ${mode.replace("-", " ").toUpperCase()}\n\n**Query:** ${query}\n\n---\n\n${response}`;
}
