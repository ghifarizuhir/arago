import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-neutral-900">Arago Student</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{session.user.name ?? session.user.email}</span>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
