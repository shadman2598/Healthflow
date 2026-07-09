"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "../../lib/api";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowUser } from "../../types/healthflow";
import { IconArrowLeft, IconShield } from "../ui/Icons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const staffSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  inviteCode: z.string().min(6),
  role: z.enum(["RECEPTIONIST", "DOCTOR"])
});

type StaffSignupFormValues = z.infer<typeof staffSignupSchema>;

type StaffSignupFormProps = {
  defaultRole?: "RECEPTIONIST" | "DOCTOR";
  title?: string;
};

export function StaffSignupForm({
  defaultRole = "RECEPTIONIST",
  title = "Staff Registration"
}: StaffSignupFormProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<StaffSignupFormValues>({
    resolver: zodResolver(staffSignupSchema),
    defaultValues: { role: defaultRole, inviteCode: "" }
  });

  const onSubmit = async (data: StaffSignupFormValues): Promise<void> => {
    try {
      const res = await apiRequest<{ user: HealthFlowUser }>("/auth/signup/staff", {
        method: "POST",
        body: data
      });
      showToast("Staff account created");
      router.replace(res.user.redirectTo ?? "/receptionist/dashboard");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Signup failed", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/30 to-teal-50/40 px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <IconArrowLeft className="h-4 w-4" />
          Who are you?
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
            <IconShield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">Register with your clinic invite code</p>
          </div>
        </div>

        <form className="card space-y-4 p-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">First name</label>
              <Input {...register("firstName")} />
              {errors.firstName ? <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p> : null}
            </div>
            <div>
              <label className="label">Last name</label>
              <Input {...register("lastName")} />
              {errors.lastName ? <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p> : null}
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <Input type="email" {...register("email")} />
            {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
          </div>
          <div>
            <label className="label">Password</label>
            <Input type="password" {...register("password")} />
            {errors.password ? <p className="mt-1 text-xs text-red-600">{errors.password.message}</p> : null}
          </div>
          <div>
            <label className="label">Role</label>
            <select className="w-full" {...register("role")}>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="DOCTOR">Doctor</option>
            </select>
          </div>
          <div>
            <label className="label">Invite code</label>
            <Input placeholder="HF-RECEPT-2026" {...register("inviteCode")} />
            {errors.inviteCode ? <p className="mt-1 text-xs text-red-600">{errors.inviteCode.message}</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Register"}
          </Button>
        </form>
      </div>
    </div>
  );
}
