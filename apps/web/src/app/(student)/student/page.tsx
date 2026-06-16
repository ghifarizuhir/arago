import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import {
  classes,
  classEnrollments,
  classAssignments,
  assessments,
  submissions,
} from '@arago/db/schema'
import { eq, isNull, and, inArray, gte, lte, notInArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentDashboardPage() {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  // Enrolled, non-deleted classes.
  const enrolledClasses = await db
    .select({ id: classes.id, name: classes.name })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(and(eq(classEnrollments.studentId, session.user.id), isNull(classes.deletedAt)))

  const classIds = enrolledClasses.map((c) => c.id)

  // Submissions already made by this student (to exclude from active list).
  const mySubs =
    classIds.length === 0
      ? []
      : await db
          .select({ assignmentId: submissions.assignmentId })
          .from(submissions)
          .innerJoin(classAssignments, eq(submissions.assignmentId, classAssignments.id))
          .where(
            and(
              eq(submissions.studentId, session.user.id),
              inArray(classAssignments.classId, classIds),
            ),
          )
  const submittedIds = mySubs.map((s) => s.assignmentId)

  const now = new Date()
  const activeAssignments =
    classIds.length === 0
      ? []
      : await db
          .select({
            id: classAssignments.id,
            classId: classAssignments.classId,
            dueAt: classAssignments.dueAt,
            assessmentTitle: assessments.title,
          })
          .from(classAssignments)
          .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
          .where(
            and(
              inArray(classAssignments.classId, classIds),
              isNull(classAssignments.deletedAt),
              isNull(assessments.deletedAt),
              eq(assessments.status, 'published'),
              lte(classAssignments.openAt, now),
              gte(classAssignments.dueAt, now),
              submittedIds.length > 0
                ? notInArray(classAssignments.id, submittedIds)
                : undefined,
            ),
          )

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Kelas Saya</h2>
        {enrolledClasses.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum terdaftar di kelas mana pun.</p>
        ) : (
          <ul className="space-y-2">
            {enrolledClasses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/student/classes/${c.id}`}
                  className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800 transition-colors"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Tugas Aktif</h2>
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-neutral-400">Tidak ada tugas aktif.</p>
        ) : (
          <ul className="space-y-3">
            {activeAssignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/student/assessments/${a.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <span className="font-medium text-neutral-900">{a.assessmentTitle}</span>
                  <span className="text-xs text-neutral-500">Tenggat {new Date(a.dueAt).toLocaleString('id-ID')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
