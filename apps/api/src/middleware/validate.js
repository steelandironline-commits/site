/** Parse req[part] with a Zod schema; ZodErrors are rendered by errorHandler. */
export const parse = (schema, value) => schema.parse(value ?? {});
