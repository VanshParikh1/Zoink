import { z } from 'zod'

export const CreateReportSchema = z.object({
  body: z.object({
    targetType: z.enum(['USER', 'LISTING']),
    targetId: z.string().uuid(),
    reason: z.enum(['SPAM', 'SCAM', 'INAPPROPRIATE', 'HARASSMENT', 'OTHER']),
    description: z
      .string()
      .min(10, 'Description must be at least 10 characters long.')
      .max(1000, 'Description cannot exceed 1000 characters.')
      .optional(),
  }),
})

export const ResolveReportSchema = z.object({
  body: z.object({
    status: z.enum(['REVIEWED', 'DISMISSED']),
    adminNotes: z
      .string()
      .max(1000, 'Admin notes cannot exceed 1000 characters.')
      .optional(),
  }),
})

export const ReportIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
})

export const AdminListReportsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'REVIEWED', 'DISMISSED']).optional(),
  }),
})
