import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { forgotPassword } from "@/app/api/auth";
import { useDocumentTitle } from "@/app/lib/useDocumentTitle";
import { handleApiError } from "@/app/lib/errorHandler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  useDocumentTitle("Hauzab - Forgot Password");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      handleApiError(error, "Unable to send a reset link.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <img src="/logo.png" alt="Hauzab" className="size-12 rounded-lg object-contain" />
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                If that email is registered, a reset link has been sent. Check your inbox
                and follow the link to choose a new password.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Enter your account email and we'll send a link to reset your password.
              </p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
              </Form>
              <div className="text-center text-sm">
                <Link to="/login" className="text-muted-foreground hover:text-foreground">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}