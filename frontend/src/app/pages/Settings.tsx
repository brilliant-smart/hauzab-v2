import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/app/auth/AuthContext";
import {
  changePasswordRequest,
  getProfile,
  updateProfile,
  type UserProfileData,
} from "@/app/api/auth";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  fullname: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(8, "At least 8 characters"),
  })
  .refine((d) => d.new_password !== d.current_password, {
    message: "Choose a different password",
    path: ["new_password"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: async () => (await getProfile()).data,
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", email: "", fullname: "", phone: "", address: "" },
  });

  useEffect(() => {
    if (profileQuery.data) {
      const p = profileQuery.data.profile ?? {};
      profileForm.reset({
        name: profileQuery.data.user.name,
        email: profileQuery.data.user.email,
        fullname: p.fullname ?? "",
        phone: p.phone ?? "",
        address: p.address ?? "",
      });
    }
  }, [profileQuery.data, profileForm]);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "" },
  });

  const saveProfile = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const profile: UserProfileData = {
        fullname: values.fullname || null,
        phone: values.phone || null,
        address: values.address || null,
      };
      return (await updateProfile({ name: values.name, email: values.email, profile })).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["auth", "profile"] });
      queryClient.setQueryData(["auth", "me"], data.user);
      toast.success("Profile saved");
    },
    onError: (e) => handleApiError(e, "Unable to save the profile."),
  });

  const changePassword = useMutation({
    mutationFn: async (values: PasswordValues) =>
      (await changePasswordRequest(values)).data,
    onSuccess: () => {
      toast.success("Password updated");
      passwordForm.reset();
    },
    onError: (e) => handleApiError(e, "Unable to change the password."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account profile and password."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit((v) => saveProfile.mutate(v))}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="fullname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input placeholder="As it appears on payslips" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={profileForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit((v) => changePassword.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="current_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Updating…" : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Signed in as <span className="font-medium">{user?.role}</span>
        {user?.tenant?.name ? ` at ${user.tenant.name}` : ""}.
      </p>
    </div>
  );
}