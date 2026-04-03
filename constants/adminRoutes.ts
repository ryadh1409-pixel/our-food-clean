/** Canonical admin URLs (Expo Router / `app/admin/`). */
export const adminRoutes = {
  home: '/admin',
  foodTemplates: '/admin/food-templates',
  dashboard: '/admin/dashboard',
  analytics: '/admin/analytics',
  users: '/admin/users',
  user: (id: string) => `/admin/user/${encodeURIComponent(id)}`,
  orders: (params?: { filter?: string }) =>
    params?.filter
      ? `/admin/orders?filter=${encodeURIComponent(params.filter)}`
      : '/admin/orders',
  order: (id: string) => `/admin/order/${encodeURIComponent(id)}`,
  reports: '/admin/reports',
  report: (id: string) => `/admin/report/${encodeURIComponent(id)}`,
  complaints: '/admin/complaints',
  /** Broadcast push to all / targeted users (Expo push). */
  sendNotification: '/admin/broadcast',
  aiInsights: '/admin/ai-insights',
} as const;
