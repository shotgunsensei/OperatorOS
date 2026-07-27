import { useParams, Link } from "wouter";
import { useGetScript, useDownloadScript } from "@workspace/api-client-react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Loader2, Download, ArrowLeft, Terminal, Calendar, Code2 } from "lucide-react";
import { motion } from "framer-motion";

export default function ScriptDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: script, isLoading, error } = useGetScript(parseInt(id!));
  const { refetch: download, isFetching: isDownloading } = useDownloadScript(parseInt(id!), { query: { enabled: false, queryKey: ['download-script', id] as const } });

  const handleDownload = async () => {
    const { data } = await download();
    if (data) {
      const blob = new Blob([data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = script?.fileName || 'script.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-32 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !script) {
    return (
      <div className="min-h-screen pt-32 text-center">
        <h2 className="text-2xl font-bold mb-4">Script not found</h2>
        <Link href="/library" className="text-primary hover:underline">Return to Library</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/library" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8 mb-8 relative overflow-hidden"
        >
          {script.source === 'ai_generated' && (
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-bl-xl shadow-lg">
              AI GENERATED
            </div>
          )}
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-black font-display mb-4">{script.name}</h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
                {script.description}
              </p>
            </div>
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-shrink-0 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-all neon-shadow neon-shadow-hover hover:-translate-y-0.5"
            >
              {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              Download Script
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-t border-border/50 pt-6">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <Code2 className="w-4 h-4 text-primary" />
              <span className="font-medium">{script.format}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <Terminal className="w-4 h-4" />
              <span className="capitalize">{script.category}</span>
            </div>
            {script.createdAt && (
              <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                <Calendar className="w-4 h-4" />
                <span>{new Date(script.createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-black/50"
        >
          <div className="bg-[#1d1f21] px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="ml-4 text-xs font-mono text-muted-foreground">{script.fileName}</span>
          </div>
          <SyntaxHighlighter 
            language={script.format.toLowerCase() === 'batch' ? 'bat' : script.format.toLowerCase()} 
            style={atomDark}
            customStyle={{ margin: 0, padding: '2rem', background: '#0d1117', fontSize: '0.875rem' }}
            showLineNumbers
          >
            {script.content}
          </SyntaxHighlighter>
        </motion.div>
      </div>
    </div>
  );
}
