'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/modules', label: 'Modul Ajar' },
  { href: '/blueprints', label: 'Kisi-kisi' },
  { href: '/assessments', label: 'Asesmen' },
] as const;

interface SidebarProps {
  workspaceName: string;
}

export function Sidebar({ workspaceName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Workspace
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-gray-900">
          {workspaceName}
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-2 py-4">
        <Link
          href="/workspaces"
          className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Ganti Workspace
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Keluar
        </button>
      </div>
    </aside>
  );
}
