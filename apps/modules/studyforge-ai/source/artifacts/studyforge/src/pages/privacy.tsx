import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Privacy() {
  useDocumentMeta("Privacy Policy");
  
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <h3>1. Information We Collect</h3>
          <p>We collect information you provide directly to us, such as when you create an account, upload study materials, or communicate with us.</p>
          
          <h3>2. How We Use Your Information</h3>
          <p>We use the information we collect to provide, maintain, and improve our services, specifically to generate tailored study materials (flashcards, quizzes, etc.) using AI models.</p>
          
          <h3>3. Data Security</h3>
          <p>We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access. Your study notes are stored securely and are not used to train generic foundation models without consent.</p>
          
          <h3>4. Contact Us</h3>
          <p>If you have any questions about this Privacy Policy, please contact us.</p>
        </CardContent>
      </Card>
    </div>
  );
}