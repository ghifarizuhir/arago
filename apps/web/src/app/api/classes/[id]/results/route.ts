import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  classes,
  classEnrollments,
  classAssignments,
  assessments,
  submissions,
  users,
} from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
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
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const assignments = await db
    .select({ id: classAssignments.id, assessmentTitle: assessments.title })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(and(eq(classAssignments.classId, id), isNull(classAssignments.deletedAt)))

  const students = await db
    .select({ studentId: classEnrollments.studentId, name: users.name, email: users.email })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .where(eq(classEnrollments.classId, id))

  const assignmentIds = assignments.map((a) => a.id)
  const subs =
    assignmentIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: submissions.assignmentId,
            studentId: submissions.studentId,
            score: submissions.score,
          })
          .from(submissions)
          .where(inArray(submissions.assignmentId, assignmentIds))

  return NextResponse.json({ class: cls, assignments, students, submissions: subs })
}
