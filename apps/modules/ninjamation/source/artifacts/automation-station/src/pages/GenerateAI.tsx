import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Terminal, Code2, Loader2, ArrowRight, Copy, Check, Download, ExternalLink } from "lucide-react";
import { useGetSubscriptionStatus, useGenerateScript } from "@workspace/api-client-react";
import type { ScriptDetail } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function GenerateAI() {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("powershell");
  const [generatedScript, setGeneratedScript] = useState<ScriptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data: subStatus } = useGetSubscriptionStatus();
  const generateMutation = useGenerateScript();

  const isPro = subStatus?.tier === "pro" || subStatus?.tier === "enterprise";
  const isGenerating = generateMutation.isPending;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPro || !prompt.trim()) return;

    setError(null);
    setGeneratedScript(null);

    generateMutation.mutate(
      { data: { prompt: prompt.trim(), format: format as "powershell" | "python" | "batch" | "bash" } },
      {
        onSuccess: (data) => {
          setGeneratedScript(data.script);
        },
        onError: (err) => {
          const message = (err as { payload?: { error?: string } })?.payload?.error
            || (err instanceof Error ? err.message : "Something went wrong. Please try again.");
          setError(message);
        },
      }
    );
  };

  const handleCopy = async () => {
    if (!generatedScript) return;
    await navigator.clipboard.writeText(generatedScript.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!generatedScript) return;
    const blob = new Blob([generatedScript.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = generatedScript.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewScript = () => {
    setGeneratedScript(null);
    setError(null);
    setPrompt("");
  };

  return (
    <div className="min-h-screen pt-24 pb-20 relative">
      {!isPro && (
        <div className="absolute inset-0 z-20 backdrop-blur-sm bg-background/50 flex items-center justify-center pt-20 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass p-8 rounded-3xl max-w-lg text-center border-secondary/30 relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary to-secondary"></div>
            <Sparkles className="w-12 h-12 text-secondary mx-auto mb-6" />
            <h2 className="text-3xl font-bold font-display mb-4">Pro Feature</h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Unlock the power of AI script generation. Describe any automation task and get a ready-to-use script
              instantly.
            </p>
            <a
              href="/pricing"
              className="inline-flex px-8 py-4 rounded-xl bg-ninja-red text-white font-bold hover:bg-red-600 transition-colors w-full justify-center shadow-lg red-glow"
            >
              Upgrade to Pro for $20/mo
            </a>
          </motion.div>
        </div>
      )}

      <div
        className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 ${!isPro ? "pointer-events-none opacity-50 filter blur-[2px]" : ""}`}
      >
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary mb-6 border border-primary/20 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-display mb-4">AI Script Generator</h1>
          <p className="text-xl text-muted-foreground">Describe your workflow. We'll write the code.</p>
        </div>

        <AnimatePresence mode="wait">
          {generatedScript ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                        AI Generated
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground">
                        {generatedScript.format}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold mt-2">{generatedScript.name}</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="p-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="p-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                      title="Download script"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <pre className="bg-background/80 rounded-xl p-6 overflow-x-auto border border-white/5 text-sm leading-relaxed max-h-[500px] overflow-y-auto">
                    <code>{generatedScript.content}</code>
                  </pre>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <button
                    onClick={handleNewScript}
                    className="flex-1 px-6 py-3 rounded-xl bg-ninja-red hover:bg-red-600 text-white font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" /> Generate Another
                  </button>
                  <Link
                    href={`/scripts/${generatedScript.id}`}
                    className="flex-1 px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-foreground font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" /> View in Library
                  </Link>
                </div>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                This script has been automatically added to the shared library for all subscribers.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-3xl p-8 relative overflow-hidden"
            >
              <form onSubmit={handleGenerate}>
                <div className="mb-8">
                  <label className="block text-sm font-medium text-foreground mb-3">Target Format</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { id: "powershell", label: "PowerShell", icon: <Terminal className="w-4 h-4" /> },
                      { id: "python", label: "Python", icon: <Code2 className="w-4 h-4" /> },
                      { id: "batch", label: "Batch", icon: <Terminal className="w-4 h-4" /> },
                      { id: "bash", label: "Bash", icon: <Terminal className="w-4 h-4" /> },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormat(f.id)}
                        className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                          format === f.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground"
                        }`}
                      >
                        {f.icon}
                        <span className="font-medium text-sm">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-8">
                  <label className="block text-sm font-medium text-foreground mb-3">Description</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Write a script that checks my downloads folder and moves all images to a 'Pictures' folder and PDFs to a 'Documents' folder..."
                    className="w-full h-40 px-4 py-3 bg-background border border-white/10 rounded-xl focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary resize-none"
                    required
                    maxLength={2000}
                    disabled={isGenerating}
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-muted-foreground">Minimum 10 characters</span>
                    <span className="text-xs text-muted-foreground">{prompt.length}/2000</span>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isGenerating || !prompt || prompt.trim().length < 10}
                    className="px-8 py-4 rounded-xl bg-ninja-red hover:bg-red-600 text-white font-bold transition-all shadow-lg red-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        Generate Script <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
