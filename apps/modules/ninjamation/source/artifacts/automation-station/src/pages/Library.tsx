import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Terminal, Code2, FileJson, Loader2, Download } from "lucide-react";
import { Link } from "wouter";
import { useListScripts, useGetScriptFormats } from "@workspace/api-client-react";

export default function Library() {
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [category, setCategory] = useState("");

  const { data: formatsData } = useGetScriptFormats();
  const { data: scriptsData, isLoading } = useListScripts({ 
    search: search.length > 2 ? search : undefined, 
    format: format || undefined, 
    category: category || undefined,
    limit: 50 
  });

  const getFormatIcon = (fmt: string) => {
    switch(fmt.toLowerCase()) {
      case 'powershell': return <Terminal className="w-4 h-4 text-blue-400" />;
      case 'python': return <Code2 className="w-4 h-4 text-yellow-400" />;
      case 'batch': return <Terminal className="w-4 h-4 text-gray-400" />;
      default: return <FileJson className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar Filters */}
        <aside className="w-full md:w-64 flex-shrink-0 space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" /> Filters
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Format</label>
                <div className="space-y-2">
                  <button 
                    onClick={() => setFormat("")}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!format ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-white/5 text-foreground/70'}`}
                  >
                    All Formats
                  </button>
                  {formatsData?.formats.map(f => (
                    <button 
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${format === f ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-white/5 text-foreground/70'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Category</label>
                <div className="space-y-2">
                  <button 
                    onClick={() => setCategory("")}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!category ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-white/5 text-foreground/70'}`}
                  >
                    All Categories
                  </button>
                  {formatsData?.categories.map(c => (
                    <button 
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors capitalize ${category === c ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-white/5 text-foreground/70'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h1 className="text-3xl font-black font-display">Script Library</h1>
            
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search scripts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-32">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : scriptsData?.scripts.length === 0 ? (
            <div className="text-center py-20 glass rounded-2xl">
              <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium mb-2">No scripts found</h3>
              <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {scriptsData?.scripts.map((script, idx) => (
                <motion.div
                  key={script.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                >
                  <Link href={`/scripts/${script.id}`}>
                    <div className="glass glass-hover p-6 rounded-2xl h-full flex flex-col cursor-pointer border border-transparent hover:border-primary/30 group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 group-hover:bg-primary/10 group-hover:border-primary/20 transition-colors">
                          {getFormatIcon(script.format)}
                        </div>
                        {script.source === 'ai_generated' && (
                          <span className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold bg-primary/20 text-primary rounded-full border border-primary/20">
                            AI Generated
                          </span>
                        )}
                      </div>
                      
                      <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1">{script.name}</h3>
                      <p className="text-sm text-muted-foreground mb-6 line-clamp-2 flex-1">{script.description}</p>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                        <span className="capitalize bg-white/5 px-2 py-1 rounded-md">{script.category}</span>
                        <div className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {script.downloadCount}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
