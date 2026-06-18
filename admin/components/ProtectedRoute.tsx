import { isAdminAuthUser } from '@/firebase/adminAuth';
import { useAuth } from '@/firebase/useAuth';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [roleChecked, setRoleChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      if (!loading && !user) setRoleChecked(true);
      return;
    }
    const admin = isAdminAuthUser(user);
    setIsAdmin(admin);
    setRoleChecked(true);
    if (!admin) router.replace('/?unauthorized=1');
  }, [user, loading, router]);

  if (loading || !roleChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
