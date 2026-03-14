import { getIsAdminByRole } from '@/firebase/adminAuth';
import { useAuth } from '@/firebase/useAuth';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const unauthorized = router.query.unauthorized === '1';

  useEffect(() => {
    if (loading) return;
    if (unauthorized) return;
    if (!user) {
      router.replace('/admin/login');
      return;
    }
    let cancelled = false;
    getIsAdminByRole(user.uid).then((isAdmin) => {
      if (cancelled) return;
      if (isAdmin) router.replace('/admin/dashboard');
      else router.replace('/admin/login');
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, unauthorized]);

  if (unauthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <p className="text-xl font-semibold text-red-600 mb-4">
          Unauthorized access
        </p>
        <p className="text-gray-600 mb-6 text-center">
          You do not have permission to access the admin area.
        </p>
        <a
          href="/admin/login"
          className="text-primary font-medium hover:underline"
        >
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500">Redirecting...</div>
    </div>
  );
}
