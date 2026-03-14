import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  banned?: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banningId, setBanningId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserRow[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const createdAt = data?.createdAt?.toDate?.();
          list.push({
            id: d.id,
            name: data?.displayName ?? data?.name ?? '—',
            email: data?.email ?? '—',
            createdAt: createdAt ? createdAt.toISOString().slice(0, 10) : '—',
            banned: data?.banned === true,
          });
        });
        list.sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || ''),
        );
        setUsers(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const handleBan = async (id: string, currentBanned: boolean) => {
    if (banningId) return;
    setBanningId(id);
    try {
      await updateDoc(doc(db, 'users', id), { banned: !currentBanned });
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, banned: !currentBanned } : u)),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setBanningId(null);
    }
  };

  return (
    <ProtectedRoute>
      <AdminLayout title="Users">
        {loading ? (
          <p className="text-gray-500">Loading users...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr key={u.id} className={u.banned ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {u.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {u.createdAt}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleBan(u.id, u.banned ?? false)}
                          disabled={banningId === u.id}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            u.banned
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          } disabled:opacity-50`}
                        >
                          {banningId === u.id
                            ? '...'
                            : u.banned
                              ? 'Unban'
                              : 'Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && (
              <p className="px-4 py-8 text-center text-gray-500">
                No users yet.
              </p>
            )}
          </div>
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
