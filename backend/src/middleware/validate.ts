import { ZodError, ZodObject, ZodPipe, ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'

/**
 * Generic validation middleware factory.
 *
 * Accepts a Zod schema shaped as `{ body?, params?, query? }`.
 * Parses each sub-object against the corresponding schema field.
 * On failure: passes the raw ZodError to next() → lands in the Phase 4
 *   errorHandler which formats it as 400 { error, issues }.
 * On success: replaces req.body / req.params / req.query with the
 *   parsed (typed, coerced) values so controllers receive clean data.
 *
 * Unknown fields in the body or query are refused (400), not silently
 * dropped: a typo, a field the API no longer takes, or an attempt to set
 * something like `role` is reported instead of half-applied. Checked at the
 * top level of each part the schema describes; a part it leaves out is left
 * alone, since some routes validate params and body with separate schemas.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const unknown = unknownFieldIssues(schema, { body: req.body, query: req.query })
    if (unknown.length > 0) {
      next(new ZodError(unknown))
      return
    }

    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    })

    if (!result.success) {
      next(result.error) // ZodError → errorHandler
      return
    }

    const data = result.data as {
      body?: Record<string, unknown>
      params?: Record<string, string>
      query?: Record<string, unknown>
    }

    if (data.body !== undefined) req.body = data.body
    if (data.params !== undefined) req.params = data.params as any
    if (data.query !== undefined) {
      // req.query is a getter-only accessor on Express 5's Request prototype;
      // direct assignment throws, so redefine it as an own writable property.
      Object.defineProperty(req, 'query', {
        value: data.query,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    }

    next()
  }
}

/**
 * Removes fields an older app build still sends but the API no longer reads,
 * before validate() would refuse them as unknown. For retired fields only:
 * whatever a client puts in them is thrown away, never stored or used.
 */
export function ignoreBodyFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      for (const field of fields) delete req.body[field]
    }
    next()
  }
}

// The keys an object schema allows, or undefined when the schema isn't a
// plain object (then this check leaves that part to the schema itself).
function objectKeys(schema: unknown): Set<string> | undefined {
  if (schema instanceof ZodObject) return new Set(Object.keys(schema.shape))
  if (schema instanceof ZodPipe) return objectKeys(schema.in)
  return undefined
}

function unknownFieldIssues(schema: ZodSchema, parts: { body: unknown; query: unknown }) {
  if (!(schema instanceof ZodObject)) return []
  const top = schema.shape as Record<string, unknown>

  const issues: ConstructorParameters<typeof ZodError>[0] = []
  for (const part of ['body', 'query'] as const) {
    const value = parts[part]
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const allowed = part in top ? objectKeys(top[part]) : undefined
    if (!allowed) continue
    const keys = Object.keys(value).filter((key) => !allowed.has(key))
    if (keys.length > 0) {
      issues.push({
        code: 'unrecognized_keys',
        keys,
        path: [part],
        message: `Unknown field${keys.length > 1 ? 's' : ''}: ${keys.join(', ')}.`,
        input: value as Record<string, unknown>,
      })
    }
  }
  return issues
}
