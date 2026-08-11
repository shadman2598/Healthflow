import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodTypeAny } from "zod";

/** Local Zod resolver — avoids @hookform/resolvers ↔ Turbopack ESM interop bugs. */
export function zodResolver<T extends FieldValues>(schema: ZodTypeAny): Resolver<T> {
  return async (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      return { values: parsed.data as T, errors: {} };
    }

    const errors = {} as FieldErrors<T>;
    for (const issue of parsed.error.issues) {
      const key = (issue.path[0] ?? "root") as keyof FieldErrors<T>;
      if (errors[key]) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errors as any)[key] = {
        type: issue.code,
        message: issue.message
      };
    }
    return { values: {} as T, errors };
  };
}
