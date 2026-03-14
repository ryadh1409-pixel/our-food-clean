import { useAlertsSummary } from '@/hooks/useAlertsSummary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import SignOutButton from './SignOutButton';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/founder', label: 'Founder' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/investor', label: 'Investor' },
  { href: '/admin/growth', label: 'Growth' },
  { href: '/admin/growth-radar', label: 'Growth Radar' },
  { href: '/admin/predictions', label: 'Predictions' },
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/alerts', label: 'Alerts' },
  { href: '/admin/notifications', label: 'Send Push' },
  { href: '/admin/social-growth', label: 'Social Growth' },
];

export default function AdminLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const router = useRouter();
  const { total: alertCount, highActivityCount } = useAlertsSummary();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-8">
              <Link
                href="/admin/dashboard"
                className="text-xl font-bold text-gray-900"
              >
                HalfOrder Admin
              </Link>
              <nav className="flex items-center gap-4">
                {NAV.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`relative inline-flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                      router.pathname === href ||
                      router.pathname.startsWith(href + '/')
                        ? 'bg-primary text-gray-900'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                    {href === '/admin/alerts' && alertCount > 0 && (
                      <span
                        className={`ml-1.5 min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                          highActivityCount > 0
                            ? 'bg-red-500 text-white'
                            : 'bg-amber-500 text-gray-900'
                        }`}
                      >
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    )}
                  </Link>
                ))}
                <Link
                  href="/admin/alerts"
                  className="relative p-2 rounded-md text-gray-600 hover:bg-gray-100"
                  title="Alerts"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {alertCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </Link>
              </nav>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{title}</h1>
        {children}
      </main>
    </div>
  );
}
