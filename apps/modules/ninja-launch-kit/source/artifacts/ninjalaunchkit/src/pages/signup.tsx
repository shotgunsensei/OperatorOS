import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSignup, getGetSessionQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield } from "lucide-react";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name is required"),
});

export default function Signup() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const signup = useSignup();

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      name: "",
    },
  });

  function onSubmit(values: z.infer<typeof signupSchema>) {
    signup.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          toast.success("Account created successfully");
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast.error("Failed to create account", { description: err.message });
        },
      }
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/40 bg-card/50 backdrop-blur">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Register Operator</CardTitle>
          <CardDescription className="font-mono text-xs">Create a new command console account</CardDescription>
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
                    <FormLabel className="font-mono text-xs">EMAIL_ADDRESS</FormLabel>
                    <FormControl>
                      <Input placeholder="operator@domain.com" {...field} className="font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-bold tracking-wider hover-elevate" disabled={signup.isPending}>
                {signup.isPending ? "REGISTERING..." : "CREATE ACCOUNT"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
