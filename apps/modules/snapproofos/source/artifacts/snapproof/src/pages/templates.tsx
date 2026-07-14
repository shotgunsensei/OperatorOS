import { useListTemplates } from "@workspace/api-client-react";

export default function Templates() {
  const { data: templates, isLoading } = useListTemplates();

  if (isLoading) {
    return <div className="p-8 animate-pulse"><div className="h-8 w-48 bg-muted rounded mb-8"></div></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {templates?.map((template) => (
          <div key={template.id} className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-secondary rounded flex items-center justify-center text-xl text-primary group-hover:bg-primary/20 transition-colors">
                {/* Fallback icon if template.icon is just a string name */}
                {template.icon.slice(0,2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-foreground">{template.name}</h3>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{template.industry}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {template.description || "Standard template format for field documentation."}
            </p>
            <div className="flex flex-wrap gap-2">
              {template.sections.slice(0,3).map(s => (
                <span key={s} className="px-2 py-1 bg-secondary text-secondary-foreground text-[10px] rounded-full">{s}</span>
              ))}
              {template.sections.length > 3 && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground text-[10px] rounded-full">+{template.sections.length - 3} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}