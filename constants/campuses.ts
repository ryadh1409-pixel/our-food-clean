/**
 * Campus options for Campus Mode.
 * Default list + admin-added campuses from Firestore.
 */
import { db } from '@/services/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const DEFAULT_CAMPUSES = [
  'University of Toronto',
  'Toronto Metropolitan University',
  'York University',
  'Other',
] as const;

export type CampusOption = (typeof DEFAULT_CAMPUSES)[number] | string;

/**
 * Returns merged list: default campuses + any from Firestore collection "campuses".
 * Admin can add more via Admin > Campuses.
 */
export async function getCampusOptions(): Promise<string[]> {
  const fromFirestore: string[] = [];
  try {
    const campusesRef = collection(db, 'campuses');
    const snap = await getDocs(campusesRef);
    const withOrder = snap.docs
      .map((d) => {
        const data = d.data();
        const name = data?.name;
        return typeof name === 'string' && name.trim()
          ? {
              name: name.trim(),
              order: typeof data?.order === 'number' ? data.order : 999,
            }
          : null;
      })
      .filter((x): x is { name: string; order: number } => x != null);
    withOrder.sort((a, b) => a.order - b.order);
    withOrder.forEach((x) => fromFirestore.push(x.name));
  } catch {
    // Offline or no permission: use defaults only
  }
  const combined = [...DEFAULT_CAMPUSES, ...fromFirestore];
  return [...new Set(combined)];
}
