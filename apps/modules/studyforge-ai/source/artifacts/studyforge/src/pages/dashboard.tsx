import { useGetDashboard } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Brain, FileText, Target, Plus, AlertCircle, Sparkles, ArrowRight, BookOpen, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StreakWidget } from "@/components/streak-widget";
import { ScoreTrend } from "@/components/score-trend";

export default function Dashboard() {
  useDocumentMeta("Dashboard");
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        <AlertCircle className="mr-2 h-6 w-6" />
        <span>Failed to load dashboard.</span>
      </div>
    );
  }

  const isNewUser = dashboard.studySetsCount === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            {isNewUser ? "Welcome to StudyForge. Let's get your first set going." : "Welcome back. Here's your study overview."}
          </p>
        </div>
        <Link href="/sets/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Study Set
          </Button>
        </Link>
      </div>

      {isNewUser && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Get started in 3 steps</h3>
                <p className="text-sm text-muted-foreground mb-4">Build your first study set and unlock the full StudyForge experience.</p>
                <ol className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span> Create a study set from your notes</li>
                  <li className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span> Practice flashcards & take a quiz</li>
                  <li className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span> Add an exam date for a personalized plan</li>
                </ol>
                <Link href="/sets/new">
                  <Button size="sm">
                    Create your first set
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {dashboard.plan === "free" && !isNewUser && (
        <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-accent">Upgrade to Pro</h3>
            <p className="text-sm text-muted-foreground">Get unlimited study sets, advanced quizzes, and priority support.</p>
          </div>
          <Link href="~/pricing">
            <Button variant="secondary">View Plans</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Study Sets</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.studySetsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboard.planUsage.studySetsUsed} / {dashboard.planUsage.studySetsLimit || "∞"} used this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flashcards</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.flashcardsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all sets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quiz Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.averageQuizScore}%</div>
            <p className="text-xs text-muted-foreground mt-1">From {dashboard.quizAttemptsCount} attempts</p>
          </CardContent>
        </Card>
      </div>

      {!isNewUser && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StreakWidget
            current={dashboard.streak?.current ?? 0}
            longest={dashboard.streak?.longest ?? 0}
            activity={dashboard.activity ?? []}
          />
          <ScoreTrend data={dashboard.scoreHistory ?? []} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent Study Sets</h2>
            {dashboard.recentStudySets.length > 0 && (
              <Link href="/sets" className="text-sm text-muted-foreground hover:text-primary transition-colors">View all</Link>
            )}
          </div>
          {dashboard.recentStudySets.length === 0 ? (
            <Card className="p-8 text-center bg-muted/20 border-dashed">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
              <p className="font-medium mb-1">No study sets yet</p>
              <p className="text-sm text-muted-foreground mb-4">Paste your notes and we'll do the rest.</p>
              <Link href="/sets/new">
                <Button variant="outline">Create your first set</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {dashboard.recentStudySets.map(set => (
                <Link key={set.id} href={`/sets/${set.id}`}>
                  <Card className="hover:bg-accent/5 transition-colors cursor-pointer border-border/50">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{set.title}</h3>
                        <p className="text-sm text-muted-foreground">{set.subject}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{set.flashcardCount} cards</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold">Today's Study Plan</h2>
          {dashboard.todaySessions.length === 0 ? (
            <Card className="p-8 text-center bg-muted/20 border-dashed">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
              <p className="font-medium mb-1">Nothing scheduled today</p>
              <p className="text-sm text-muted-foreground">Open a study set to generate a plan paced to your exam date.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {dashboard.todaySessions.map(session => (
                <Card key={session.sessionId} className={`border-border/50 ${session.completed ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`h-4 w-4 rounded-full border ${session.completed ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                    <div>
                      <h3 className={`font-semibold ${session.completed ? 'line-through' : ''}`}>{session.topic}</h3>
                      <p className="text-sm text-muted-foreground">{session.studySetTitle} • {session.estimatedMinutes} mins</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}