"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../../lib/zod-resolver";
import { z } from "zod";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import { EmptyState } from "../../../components/ui/EmptyState";
import { IconUsers } from "../../../components/ui/Icons";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

type StaffMember = {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

const staffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["RECEPTIONIST", "DOCTOR", "ADMIN"])
});

type StaffForm = z.infer<typeof staffSchema>;

export default function AdminStaffPage() {
  const { showToast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: "RECEPTIONIST" }
  });

  const load = async (): Promise<void> => {
    const res = await apiRequest<{ staff: StaffMember[] }>("/auth/staff");
    setStaff(res.staff);
  };

  useEffect(() => {
    load()
      .catch(() => showToast("Failed to load staff", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const onSubmit = async (data: StaffForm): Promise<void> => {
    try {
      await apiRequest("/auth/staff", { method: "POST", body: data });
      showToast("Staff member created");
      reset({ role: "RECEPTIONIST", email: "", password: "", firstName: "", lastName: "" });
      await load();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create staff", "error");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Staff Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add staff directly or{" "}
          <Link href="/admin/settings" className="font-medium text-brand-600 hover:text-brand-700">
            generate secure invite codes
          </Link>{" "}
          in Settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
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
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create staff"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : staff.length === 0 ? (
        <EmptyState icon={<IconUsers className="h-10 w-10" />} title="No staff yet" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {member.firstName} {member.lastName}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{member.email}</td>
                  <td className="px-6 py-4"><Badge variant="secondary">{member.role}</Badge></td>
                  <td className="px-6 py-4 text-slate-500">
                    {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
