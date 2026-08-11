"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../lib/zod-resolver";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "../../lib/api";
import { DEMO_INVITE_CODES } from "../../lib/demo-credentials";
import { useToast } from "../../contexts/toast-context";
import type { HealthFlowUser } from "../../types/healthflow";
import { IconArrowLeft, IconShield } from "../ui/Icons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StaffInviteInfo } from "./StaffInviteInfo";

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
  const roleLocked = defaultRole === "RECEPTIONIST" || defaultRole === "DOCTOR";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<StaffSignupFormValues>({
    resolver: zodResolver(staffSignupSchema),
    defaultValues: {
      role: defaultRole,
      inviteCode: DEMO_INVITE_CODES[defaultRole]
    }
  });

  const onSubmit = async (data: StaffSignupFormValues): Promise<void> => {
    try {
      const res = await apiRequest<{ user: HealthFlowUser }>("/auth/signup/staff", {
        method: "POST",
        body: { ...data, role: defaultRole }
      });
      showToast("Staff account created");
      router.replace(res.user.redirectTo ?? "/receptionist/dashboard");
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Signup failed", "error");
    }
  };

  const loginHref = defaultRole === "DOCTOR" ? "/login/doctor" : "/login/receptionist";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-brand-50/30 to-teal-50/40 px-6 py-12">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <IconArrowLeft className="h-4 w-4" />
          Who are you?
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
            <IconShield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">Authorized staff only — invite code required</p>
          </div>
        </div>

        <StaffInviteInfo role={defaultRole} className="mb-6" />

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
            {roleLocked ? (
              <>
                <input type="hidden" {...register("role")} value={defaultRole} />
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  {defaultRole === "DOCTOR" ? "Doctor" : "Receptionist"}
                </div>
              </>
            ) : (
              <select className="w-full" {...register("role")}>
                <option value="RECEPTIONIST">Receptionist</option>
                <option value="DOCTOR">Doctor</option>
              </select>
            )}
          </div>
          <div>
            <label className="label">Invite code</label>
            <Input placeholder={DEMO_INVITE_CODES[defaultRole]} {...register("inviteCode")} />
            <p className="mt-1 text-xs text-slate-500">
              Provided by your clinic administrator. Must match your role.
            </p>
            {errors.inviteCode ? <p className="mt-1 text-xs text-red-600">{errors.inviteCode.message}</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Register"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
