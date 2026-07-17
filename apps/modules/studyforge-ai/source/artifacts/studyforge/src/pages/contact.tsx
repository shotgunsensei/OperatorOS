import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useSubmitContact } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Mail, MessageCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Contact() {
  useDocumentMeta(
    "Contact",
    "Get in touch with the StudyForge team about classroom rollouts, support, or feedback.",
  );
  const { user } = useAuth();
  const submit = useSubmitContact();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) {
      toast.error("Please write a longer message");
      return;
    }
    try {
      await submit.mutateAsync({ data: { name: name.trim(), email: email.trim(), message: message.trim() } });
      setSent(true);
      setMessage("");
    } catch (err) {
      toast.error("Could not send your message. Please try again.");
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">Get in touch</h1>
        <p className="text-muted-foreground">
          Questions, feedback, or volume pricing for tutoring teams — we read every message.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <Mail className="h-6 w-6 text-primary mb-2" aria-hidden="true" />
            <CardTitle className="text-base">Email us</CardTitle>
            <CardDescription>hello@studyforge.app</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <MessageCircle className="h-6 w-6 text-primary mb-2" aria-hidden="true" />
            <CardTitle className="text-base">Response time</CardTitle>
            <CardDescription>Within 1 business day</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CheckCircle2 className="h-6 w-6 text-primary mb-2" aria-hidden="true" />
            <CardTitle className="text-base">Tutor pricing</CardTitle>
            <CardDescription>Volume discounts available</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send a message</CardTitle>
          <CardDescription>We'll get back to you at the email below.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center text-center py-8 gap-3">
              <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Message sent</h2>
              <p className="text-sm text-muted-foreground">
                Thanks for reaching out. We'll reply to <span className="font-medium text-foreground">{email}</span> soon.
              </p>
              <Button variant="outline" onClick={() => setSent(false)}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input id="contact-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input id="contact-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={5}
                  maxLength={4000}
                  placeholder="Tell us how we can help..."
                />
                <p className="text-xs text-muted-foreground text-right">{message.length} / 4000</p>
              </div>
              <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
                {submit.isPending ? "Sending..." : "Send message"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
