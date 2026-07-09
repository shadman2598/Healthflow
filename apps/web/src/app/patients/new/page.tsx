"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError, apiRequest } from "../../../lib/api";
import { useToast } from "../../../contexts/toast-context";
import { IconArrowLeft } from "../../../components/ui/Icons";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

const patientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
  healthcareNumber: z.string().min(4),
  dateOfBirth: z.string().optional(),
  heightCm: z.string().optional(),
  weightKg: z.string().optional(),
  address: z.string().optional(),
  internalNotes: z.string().optional(),
  isRegularPatient: z.boolean().optional()
});

type PatientForm = z.infer<typeof patientSchema>;

export default function NewPatientPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { isRegularPatient: false }
  });

  const onSubmit = async (data: PatientForm): Promise<void> => {
    try {
      const res = await apiRequest<{ profile: { id: string } }>("/patient-profiles", {
        method: "POST",
        body: {
          ...data,
          heightCm: data.heightCm ? Number(data.heightCm) : undefined,
          weightKg: data.weightKg ? Number(data.weightKg) : undefined,
          dateOfBirth: data.dateOfBirth || undefined,
          address: data.address || undefined,
          internalNotes: data.internalNotes || undefined
        }
      });
      showToast("Patient created");
      router.replace(`/patients/${res.profile.id}`);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Failed to create patient", "error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/patients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <IconArrowLeft className="h-4 w-4" />
        Back to patients
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Add patient</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">First name *</label>
                <Input {...register("firstName")} />
                {errors.firstName ? <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p> : null}
              </div>
              <div>
                <label className="label">Last name *</label>
                <Input {...register("lastName")} />
                {errors.lastName ? <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p> : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Email *</label>
                <Input type="email" {...register("email")} />
                {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
              </div>
              <div>
                <label className="label">Phone *</label>
                <Input {...register("phone")} />
                {errors.phone ? <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p> : null}
              </div>
            </div>
            <div>
              <label className="label">Healthcare number *</label>
              <Input className="font-mono" {...register("healthcareNumber")} />
              {errors.healthcareNumber ? <p className="mt-1 text-xs text-red-600">{errors.healthcareNumber.message}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Date of birth</label>
                <Input type="date" {...register("dateOfBirth")} />
              </div>
              <div>
                <label className="label">Height (cm)</label>
                <Input type="number" {...register("heightCm")} />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <Input type="number" {...register("weightKg")} />
              </div>
            </div>
            <div>
              <label className="label">Address (optional)</label>
              <Input {...register("address")} />
            </div>
            <div>
              <label className="label">Internal notes (staff only)</label>
              <textarea rows={3} className="w-full" {...register("internalNotes")} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isRegularPatient")} />
              Regular patient
            </label>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Create patient"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
