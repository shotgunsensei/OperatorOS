import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { escapeHtml, parseResponse } from "../utils";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
      data-testid="button-copy-code"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : (label || "Copy")}
    </button>
  );
}

function highlightSyntax(code: string, lang: string): JSX.Element[] {
  const lines = code.split("\n");
  return lines.map((line, idx) => {
    let highlighted = escapeHtml(line);

    if (lang === "powershell" || lang === "ps1") {
      highlighted = highlighted
        .replace(/(#.*)$/gm, '<span class="text-zinc-500 italic">$1</span>')
        .replace(/(\$\w+)/g, '<span class="text-sky-400">$1</span>')
        .replace(/\b(function|param|if|else|elseif|foreach|for|while|try|catch|finally|return|throw|switch|break|continue|Import-Module|Write-Host|Write-Output|Write-Error|Get-|Set-|New-|Remove-|Invoke-|Test-|Start-|Stop-|Restart-)\b/g, '<span class="text-violet-400">$1</span>')
        .replace(/(&quot;[^&]*&quot;)/g, '<span class="text-amber-300">$1</span>')
        .replace(/(&#039;[^&]*&#039;)/g, '<span class="text-amber-300">$1</span>');
    } else if (lang === "bash" || lang === "sh" || lang === "shell" || !lang) {
      highlighted = highlighted
        .replace(/(#.*)$/gm, '<span class="text-zinc-500 italic">$1</span>')
        .replace(/(\$\w+|\$\{[^}]+\})/g, '<span class="text-sky-400">$1</span>')
        .replace(/\b(if|then|else|elif|fi|for|do|done|while|case|esac|function|return|exit|echo|sudo|grep|awk|sed|find|curl|wget|chmod|chown|mkdir|rm|cp|mv|cat|systemctl|journalctl|apt|yum|dnf|pip|npm)\b/g, '<span class="text-violet-400">$1</span>')
        .replace(/(&quot;[^&]*&quot;)/g, '<span class="text-amber-300">$1</span>')
        .replace(/(&#039;[^&]*&#039;)/g, '<span class="text-amber-300">$1</span>');
    } else if (lang === "python" || lang === "py") {
      highlighted = highlighted
        .replace(/(#.*)$/gm, '<span class="text-zinc-500 italic">$1</span>')
        .replace(/\b(def|class|import|from|if|elif|else|for|while|try|except|finally|return|raise|with|as|pass|break|continue|True|False|None|and|or|not|in|is|lambda|yield|async|await)\b/g, '<span class="text-violet-400">$1</span>')
        .replace(/(&quot;[^&]*&quot;)/g, '<span class="text-amber-300">$1</span>')
        .replace(/(&#039;[^&]*&#039;)/g, '<span class="text-amber-300">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>');
    }

    return (
      <div key={idx} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: highlighted || "&nbsp;" }} />
    );
  });
}

export function ResponseBlock({ content }: { content: string }) {
  const sections = parseResponse(content);

  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div key={i}>
          {section.type === "heading" && (
            <div className="flex items-center gap-2 mb-1 mt-2 first:mt-0">
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                {section.content}
              </span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
          )}
          {section.type === "code" && (
            <div className="relative group">
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-t text-[10px] text-zinc-500 font-mono">
                <span>{section.lang || "shell"}</span>
                <CopyButton text={section.content} />
              </div>
              <pre className="px-3 py-2 bg-zinc-950 border border-t-0 border-zinc-800 rounded-b overflow-x-auto text-[13px] font-mono text-zinc-200">
                <code>{highlightSyntax(section.content, section.lang || "")}</code>
              </pre>
            </div>
          )}
          {section.type === "text" && (
            <div className="text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {section.content}
            </div>
          )}
          {section.type === "table" && (
            <div className="overflow-x-auto border border-zinc-800 rounded">
              <pre className="px-3 py-2 text-[12px] leading-relaxed text-zinc-300 font-mono">
                {section.content}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
