import { z, prettifyError } from "zod";

export class ValidationError extends Error {
  readonly issues: z.ZodError["issues"];

  constructor(error: z.ZodError, context = "Invalid input") {
    super(`${context}: ${prettifyError(error)}`);
    this.name = "ValidationError";
    this.issues = error.issues;
  }
}

export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  context?: string,
): z.infer<Schema> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(result.error, context);
  }

  return result.data;
}

export function parseInputSafe<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
) {
  return schema.safeParse(data);
}

export const uuidSchema = z.uuid();

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const paginationSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const emailSchema = z.email();
