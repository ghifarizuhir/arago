import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, classMaterials, classes, classEnrollments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { streamTutor } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  materialId: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, messages } = parsed.data

  // Enrollment-scoped re-fetch of the published material. Never trust client content.
  const [material] = await db
    .select({ content: teachingMaterials.content })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(classMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .innerJoin(classes, eq(classes.id, classMaterials.classId))
    .innerJoin(
      classEnrollments,
      and(eq(classEnrollments.classId, classes.id), eq(classEnrollments.studentId, session.user.id)),
    )
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
        isNull(classes.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (!material.content) {
    return NextResponse.json({ error: 'Material has no content' }, { status: 422 })
  }

  const result = streamTutor({ materialContent: material.content, messages })
  return result.toDataStreamResponse()
}
