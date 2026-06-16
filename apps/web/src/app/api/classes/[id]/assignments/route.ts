import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classAssignments, assessments, classEnrollments, notifications } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { CreateAssignmentSchema } from '@arago/validators'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const rows = await db
    .select({
      id: classAssignments.id,
      assessmentId: classAssignments.assessmentId,
      openAt: classAssignments.openAt,
      dueAt: classAssignments.dueAt,
      assessmentTitle: assessments.title,
    })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(and(eq(classAssignments.classId, id), isNull(classAssignments.deletedAt), isNull(assessments.deletedAt)))
    .orderBy(desc(classAssignments.createdAt))

  return NextResponse.json({ assignments: rows })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = CreateAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // assessment must be in THIS workspace AND published, not soft-deleted.
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        eq(assessments.id, parsed.data.assessmentId),
        eq(assessments.workspaceId, workspaceId),
        eq(assessments.status, 'published'),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)
  if (!assessment) {
    return NextResponse.json(
      { error: 'Assessment is not a published assessment in this workspace' },
      { status: 422 },
    )
  }

  const [created] = await db
    .insert(classAssignments)
    .values({
      classId: id,
      assessmentId: parsed.data.assessmentId,
      openAt: parsed.data.openAt,
      dueAt: parsed.data.dueAt,
    })
    .returning()

  // Best-effort: notify enrolled students. Must not fail assignment creation.
  if (created) {
    try {
      const [[a], enrolled] = await Promise.all([
        db.select({ title: assessments.title }).from(assessments).where(eq(assessments.id, created.assessmentId)).limit(1),
        db.select({ studentId: classEnrollments.studentId }).from(classEnrollments).where(eq(classEnrollments.classId, id)),
      ])
      if (enrolled.length > 0) {
        await db.insert(notifications).values(
          enrolled.map((e) => ({
            userId: e.studentId,
            type: 'assignment',
            message: `Asesmen baru: ${a?.title ?? 'Asesmen'}`,
            linkPath: `/student/assessments/${created.id}`,
          })),
        )
      }
    } catch {
      // swallow — notification failure must not break assignment creation
    }
  }

  return NextResponse.json({ assignment: created }, { status: 201 })
}
