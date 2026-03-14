import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';

type Campaign = {
  id: string;
  name: string;
  channel: string;
  location: string;
  startDate: string;
  budget: number;
  usersGained: number;
  ordersCreated: number;
};

type CampaignIdea = {
  title: string;
  description: string;
  expectedUsers: string;
  estimatedCost: string;
};

type Hotspot = {
  lat: number;
  lng: number;
  count: number;
  suggestion: string;
};

type GrowthMetricRow = {
  date: string;
  referralUsers: number;
  orders: number;
  matches: number;
};

export default function GrowthPage() {
  const [flywheel, setFlywheel] = useState<{
    referralSignups: number;
    ordersFromReferrals: number;
    metrics: GrowthMetricRow[];
  }>({ referralSignups: 0, ordersFromReferrals: 0, metrics: [] });
  const [flywheelLoading, setFlywheelLoading] = useState(true);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [audience, setAudience] = useState('Students');
  const [templates, setTemplates] = useState<{
    email: string;
    instagram: string;
    push: string;
  } | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    channel: '',
    location: '',
    startDate: '',
    budget: '',
    usersGained: '',
    ordersCreated: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadCampaigns() {
      try {
        const snap = await getDocs(collection(db, 'campaigns'));
        const list: Campaign[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data?.name ?? '—',
            channel: data?.channel ?? '—',
            location: data?.location ?? '—',
            startDate: data?.startDate ?? '—',
            budget: typeof data?.budget === 'number' ? data.budget : 0,
            usersGained:
              typeof data?.usersGained === 'number' ? data.usersGained : 0,
            ordersCreated:
              typeof data?.ordersCreated === 'number' ? data.ordersCreated : 0,
          };
        });
        setCampaigns(list);
      } catch (e) {
        console.error(e);
      } finally {
        setCampaignsLoading(false);
      }
    }
    loadCampaigns();
  }, []);

  useEffect(() => {
    async function loadFlywheel() {
      setFlywheelLoading(true);
      try {
        const [metricsSnap, usersSnap, ordersSnap] = await Promise.all([
          getDocs(collection(db, 'growthMetrics')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
        ]);
        const metrics: GrowthMetricRow[] = metricsSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              date: String(data?.date ?? d.id),
              referralUsers: Number(data?.referralUsers) || 0,
              orders: Number(data?.orders) || 0,
              matches: Number(data?.matches) || 0,
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 30);
        const referredIds = new Set<string>();
        usersSnap.docs.forEach((d) => {
          const ref = d.data()?.referredBy;
          if (ref) referredIds.add(d.id);
        });
        let ordersFromReferrals = 0;
        ordersSnap.docs.forEach((d) => {
          const data = d.data();
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          const participants = (data?.participantIds ??
            data?.joinedUsers ??
            []) as string[];
          const all = hostId ? [hostId, ...participants] : participants;
          if (all.some((id: string) => referredIds.has(id)))
            ordersFromReferrals += 1;
        });
        setFlywheel({
          referralSignups: referredIds.size,
          ordersFromReferrals,
          metrics,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setFlywheelLoading(false);
      }
    }
    loadFlywheel();
  }, []);

  const loadHotspots = async () => {
    setHotspotsLoading(true);
    try {
      const res = await fetch('/api/growth/hotspots');
      const data = await res.json();
      if (res.ok && data.hotspots) setHotspots(data.hotspots);
    } catch (e) {
      console.error(e);
    } finally {
      setHotspotsLoading(false);
    }
  };

  const loadCampaignIdeas = async () => {
    setIdeasLoading(true);
    setIdeas([]);
    try {
      const res = await fetch('/api/growth/campaignIdeas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ideas) setIdeas(data.ideas);
    } catch (e) {
      console.error(e);
    } finally {
      setIdeasLoading(false);
    }
  };

  const loadOutreach = async () => {
    setTemplatesLoading(true);
    setTemplates(null);
    try {
      const res = await fetch('/api/growth/outreachMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience }),
      });
      const data = await res.json();
      if (res.ok && data.templates) setTemplates(data.templates);
    } catch (e) {
      console.error(e);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadInsights = async () => {
    setInsightLoading(true);
    setInsight('');
    try {
      const res = await fetch('/api/growth/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: 'HalfOrder analytics: orders by time and location.',
        }),
      });
      const data = await res.json();
      if (res.ok && data.insight) setInsight(data.insight);
    } catch (e) {
      console.error(e);
    } finally {
      setInsightLoading(false);
    }
  };

  const addCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'campaigns'), {
        name: form.name.trim(),
        channel: form.channel.trim() || '—',
        location: form.location.trim() || '—',
        startDate: form.startDate.trim() || '—',
        budget: Number(form.budget) || 0,
        usersGained: Number(form.usersGained) || 0,
        ordersCreated: Number(form.ordersCreated) || 0,
        createdAt: serverTimestamp(),
      });
      setForm({
        name: '',
        channel: '',
        location: '',
        startDate: '',
        budget: '',
        usersGained: '',
        ordersCreated: '',
      });
      const snap = await getDocs(collection(db, 'campaigns'));
      setCampaigns(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data?.name ?? '—',
            channel: data?.channel ?? '—',
            location: data?.location ?? '—',
            startDate: data?.startDate ?? '—',
            budget: typeof data?.budget === 'number' ? data.budget : 0,
            usersGained:
              typeof data?.usersGained === 'number' ? data.usersGained : 0,
            ordersCreated:
              typeof data?.ordersCreated === 'number' ? data.ordersCreated : 0,
          };
        }),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const totalUsersGained = campaigns.reduce((s, c) => s + c.usersGained, 0);
  const totalOrdersFromCampaigns = campaigns.reduce(
    (s, c) => s + c.ordersCreated,
    0,
  );
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const overallCac = totalUsersGained > 0 ? totalBudget / totalUsersGained : 0;
  const byChannel = campaigns.reduce<
    Record<string, { users: number; budget: number }>
  >((acc, c) => {
    const ch = c.channel || 'Other';
    if (!acc[ch]) acc[ch] = { users: 0, budget: 0 };
    acc[ch].users += c.usersGained;
    acc[ch].budget += c.budget;
    return acc;
  }, {});
  const bestChannel =
    Object.entries(byChannel).sort((a, b) => b[1].users - a[1].users)[0]?.[0] ||
    '—';

  return (
    <ProtectedRoute>
      <AdminLayout title="AI Growth Engine">
        <div className="space-y-8">
          {/* Growth Flywheel */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Growth Flywheel
            </h2>
            {flywheelLoading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs text-gray-600 uppercase">
                      Referral signups
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {flywheel.referralSignups}
                    </p>
                    <p className="text-xs text-gray-500">
                      Users with referredBy set
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-gray-600 uppercase">
                      Orders from referrals
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {flywheel.ordersFromReferrals}
                    </p>
                    <p className="text-xs text-gray-500">
                      Orders where a participant was referred
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-gray-600 uppercase">
                      Daily metrics (growthMetrics)
                    </p>
                    <p className="text-sm text-gray-700">Last 30 days below</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 font-medium text-gray-700">
                          Date
                        </th>
                        <th className="text-right py-2 font-medium text-gray-700">
                          Referral users
                        </th>
                        <th className="text-right py-2 font-medium text-gray-700">
                          Orders
                        </th>
                        <th className="text-right py-2 font-medium text-gray-700">
                          Matches
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {flywheel.metrics.map((m) => (
                        <tr key={m.date} className="border-b border-gray-100">
                          <td className="py-2 text-gray-900">{m.date}</td>
                          <td className="py-2 text-right">{m.referralUsers}</td>
                          <td className="py-2 text-right">{m.orders}</td>
                          <td className="py-2 text-right">{m.matches}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {flywheel.metrics.length === 0 && (
                    <p className="py-4 text-gray-500 text-center">
                      No growth metrics yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Section 6 – AI Insights (top card) */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              AI Insights
            </h2>
            {insight ? (
              <p className="text-gray-700 whitespace-pre-wrap">{insight}</p>
            ) : (
              <p className="text-gray-500 text-sm">
                Generate actionable insights from your analytics.
              </p>
            )}
            <button
              type="button"
              onClick={loadInsights}
              disabled={insightLoading}
              className="mt-3 px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium text-sm hover:bg-primaryDark disabled:opacity-50"
            >
              {insightLoading ? 'Generating...' : 'Generate insights'}
            </button>
          </section>

          {/* Section 1 – Hotspot Discovery */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Hotspot Discovery
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Areas with highest order density (from order latitude/longitude).
              Suggestions: Universities, Malls, Food courts, Event locations.
            </p>
            <button
              type="button"
              onClick={loadHotspots}
              disabled={hotspotsLoading}
              className="mb-4 px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium text-sm hover:bg-primaryDark disabled:opacity-50"
            >
              {hotspotsLoading ? 'Analyzing...' : 'Analyze hotspots'}
            </button>
            <div className="space-y-2">
              {hotspots.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm text-gray-700">
                    {h.lat.toFixed(4)}, {h.lng.toFixed(4)} · {h.count} orders
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-gray-800">
                    {h.suggestion}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2 – Campaign Ideas */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Campaign Ideas
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              AI-generated growth campaign ideas for HalfOrder in Toronto.
            </p>
            <button
              type="button"
              onClick={loadCampaignIdeas}
              disabled={ideasLoading}
              className="mb-4 px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium text-sm hover:bg-primaryDark disabled:opacity-50"
            >
              {ideasLoading ? 'Generating...' : 'Generate campaign ideas'}
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ideas.map((idea, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <h3 className="font-semibold text-gray-900">{idea.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {idea.description}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Expected users: {idea.expectedUsers} · Est. cost:{' '}
                    {idea.estimatedCost}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3 – Outreach Message Generator */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Outreach Message Generator
            </h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {['Restaurants', 'Students', 'Event organizers'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAudience(a)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    audience === a
                      ? 'bg-primary text-gray-900'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadOutreach}
              disabled={templatesLoading}
              className="mb-4 px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium text-sm hover:bg-primaryDark disabled:opacity-50"
            >
              {templatesLoading ? 'Generating...' : 'Generate messages'}
            </button>
            {templates && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Email template
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 rounded p-3 bg-gray-50">
                    {templates.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Instagram DM template
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 rounded p-3 bg-gray-50">
                    {templates.instagram}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Push notification text
                  </p>
                  <p className="text-sm text-gray-700 border border-gray-200 rounded p-3 bg-gray-50">
                    {templates.push}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Section 5 – Performance Score */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Performance Score
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">
                  Users gained (campaigns)
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totalUsersGained}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Orders from campaigns</p>
                <p className="text-xl font-bold text-gray-900">
                  {totalOrdersFromCampaigns}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Estimated CAC</p>
                <p className="text-xl font-bold text-gray-900">
                  ${overallCac.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Best performing channel</p>
                <p className="text-lg font-bold text-gray-900 truncate">
                  {bestChannel}
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 – Campaign Tracking */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Campaign Tracking
            </h2>
            <form
              onSubmit={addCampaign}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
            >
              <input
                type="text"
                placeholder="Campaign name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Channel"
                value={form.channel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, channel: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Location"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Start date"
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startDate: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Budget"
                value={form.budget}
                onChange={(e) =>
                  setForm((f) => ({ ...f, budget: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Users gained"
                value={form.usersGained}
                onChange={(e) =>
                  setForm((f) => ({ ...f, usersGained: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Orders created"
                value={form.ordersCreated}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ordersCreated: e.target.value }))
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add campaign'}
              </button>
            </form>
            {campaignsLoading ? (
              <p className="text-gray-500 text-sm">Loading campaigns...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Campaign
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Users gained
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Orders created
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Cost
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        CAC
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {campaigns.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {c.name}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {c.usersGained}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {c.ordersCreated}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          ${c.budget.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {c.usersGained > 0
                            ? `$${(c.budget / c.usersGained).toFixed(2)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {campaigns.length === 0 && (
                  <p className="py-4 text-center text-gray-500 text-sm">
                    No campaigns yet. Add one above.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
