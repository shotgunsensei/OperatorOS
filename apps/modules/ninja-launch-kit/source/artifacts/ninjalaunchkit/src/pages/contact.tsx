import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSubmitContact } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail } from "lucide-react";

const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export default function Contact() {
  const submitContact = useSubmitContact();

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  function onSubmit(values: z.infer<typeof contactSchema>) {
    submitContact.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast.success("Message transmitted successfully");
          form.reset();
        },
        onError: (err) => {
          toast.error("Transmission failed", { description: err.message });
        },
      }
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-lg border-border/40">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Secure Comms</CardTitle>
          <CardDescription className="font-mono text-xs">Transmit a message to HQ</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">OPERATOR_NAME</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} className="font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">RETURN_ADDRESS</FormLabel>
                    <FormControl>
                      <Input placeholder="operator@domain.com" {...field} className="font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">PAYLOAD</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter your message here..." className="min-h-[120px] font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-bold tracking-wider hover-elevate" disabled={submitContact.isPending}>
                {submitContact.isPending ? "TRANSMITTING..." : "SEND TRANSMISSION"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
