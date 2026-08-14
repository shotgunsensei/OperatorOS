import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowRight, Brain, Zap, Target, ClipboardPaste, Sparkles, GraduationCap, Quote, Check } from "lucide-react";

const STEPS = [
  { icon: ClipboardPaste, title: "Paste your notes", body: "Drop in lecture notes, a chapter, or messy slides. No formatting required." },
  { icon: Sparkles, title: "AI does the work", body: "We extract key concepts and generate flashcards, quizzes, and a review sheet." },
  { icon: GraduationCap, title: "Study with a plan", body: "Follow a daily schedule paced to your exam date. Track scores, hit your goals." },
];

const TESTIMONIALS = [
  { quote: "Turned 40 pages of bio notes into flashcards in under a minute. I went from a B- to an A on my final.", name: "Maya R.", role: "Pre-med student" },
  { quote: "The exam countdown kept me honest. No more cramming the night before.", name: "Jordan T.", role: "Law school" },
  { quote: "I use it for every class now. The review sheets alone are worth it.", name: "Sam K.", role: "CS major" },
];

const FAQS = [
  { q: "Do I need to format my notes?", a: "No. Paste raw text — lecture transcripts, textbook chapters, even messy bullet points. The AI handles the structure." },
  { q: "How accurate is the AI?", a: "We extract from what you give it, so flashcards reflect your source material. You can always edit any card before studying." },
  { q: "What subjects work best?", a: "Anything text-based: biology, history, law, languages, computer science, business. Math derivations work too as long as steps are written out." },
  { q: "Is my data private?", a: "Your study sets are private to your account. We never share or sell your data. See our Privacy Policy for details." },
];

export default function Landing() {
  useDocumentMeta("Your Notes, Forged Into Study Weapons");

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full py-24 lg:py-32 flex flex-col items-center text-center px-4">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground mb-8">
          The ultimate study companion
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl mb-6">
          Your Notes, Forged Into <span className="text-primary">Study Weapons</span>.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10">
          Paste your messy notes, lectures, or textbook chapters. Get back perfect flashcards, quizzes, review sheets, and a personalized study plan in seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link href="/signup">
            <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
              Create Your First Study Set
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base">
              View Demo
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-6">No credit card required. Free forever plan available.</p>
      </section>

      {/* How it works */}
      <section className="w-full py-20 border-t border-border/40">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">From blank page to study-ready in 60 seconds</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Three steps. No setup. No formatting headaches.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {STEPS.map((s, i) => (
              <Card key={s.title} className="relative">
                <CardContent className="p-6">
                  <div className="text-xs font-bold text-primary mb-3">STEP {i + 1}</div>
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center mb-4 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="w-full py-24 bg-card border-t border-b border-border/40">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Everything you need to ace your next exam</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Built by students, for students. Every tool earns its place.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-background p-6 rounded-xl border border-border/40 flex flex-col items-center text-center">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Smart Flashcards</h3>
              <p className="text-muted-foreground">Spaced repetition that focuses extra reps on the cards you keep getting wrong.</p>
            </div>
            <div className="bg-background p-6 rounded-xl border border-border/40 flex flex-col items-center text-center">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Instant Quizzes</h3>
              <p className="text-muted-foreground">Multiple choice and short answer questions generated from your own notes.</p>
            </div>
            <div className="bg-background p-6 rounded-xl border border-border/40 flex flex-col items-center text-center">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Custom Study Plans</h3>
              <p className="text-muted-foreground">A daily checklist paced to your exam date. Know exactly what to study and when.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="w-full py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Trusted by students across every subject</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name}>
                <CardContent className="p-6">
                  <Quote className="h-6 w-6 text-primary/40 mb-3" />
                  <p className="text-sm leading-relaxed mb-6">"{t.quote}"</p>
                  <div className="text-sm">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-muted-foreground text-xs">{t.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full py-20 bg-card border-t border-b border-border/40">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold mb-10 text-center">Common questions</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <Card key={f.q}>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-2 flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    {f.q}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-7">{f.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to study smarter?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join thousands of students turning notes into top grades. Free forever — upgrade only when you outgrow it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
                Start studying free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-base">
                See pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
