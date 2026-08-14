import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Terms() {
  useDocumentMeta("Terms of Service");
  
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <h3>1. Acceptance of Terms</h3>
          <p>By accessing and using StudyForge AI, you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h3>2. Description of Service</h3>
          <p>StudyForge AI provides AI-powered study tools including flashcards, quizzes, and study plans generated from user-provided notes. We reserve the right to modify or discontinue, temporarily or permanently, the Service with or without notice.</p>
          
          <h3>3. User Conduct</h3>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Upload or transmit any content that is unlawful, harmful, or violates copyright laws.</li>
            <li>Attempt to bypass rate limits or manipulate the service.</li>
            <li>Share your account credentials with multiple users.</li>
          </ul>
          
          <h3>4. Fair Use & Limits</h3>
          <p>We employ fair use limits on AI generation to ensure service stability. Pro and Tutor plans have higher limits but are still subject to fair use policies.</p>
        </CardContent>
      </Card>
    </div>
  );
}