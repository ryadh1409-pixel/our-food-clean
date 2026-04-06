import { auth } from '@/services/firebase';

/** Expo Router home (main tabs). */
export const VERIFY_EMAIL_HOME_HREF = '/(tabs)';

export type ReloadAuthUserFn = () => Promise<void>;

export type NavigateHomeFn = () => void;

/**
 * Reloads the current Firebase session and syncs AuthContext, then returns
 * whether email is verified. Caller should navigate exactly once if true.
 */
export async function refreshSessionAndIsEmailVerified(
  reloadAuthUser: ReloadAuthUserFn,
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  await reloadAuthUser();
  return auth.currentUser?.emailVerified === true;
}

/**
 * Same intent as `navigation.reset({ routes: [{ name: "Home" }] })` in React Navigation:
 * reload the Firebase user, then if verified call `redirectToHome` once.
 * With Expo Router, pass e.g. `() => router.replace(VERIFY_EMAIL_HOME_HREF)`.
 */
export async function checkEmailVerifiedAndRedirect(
  reloadAuthUser: ReloadAuthUserFn,
  redirectToHome: () => void,
): Promise<boolean> {
  const verified = await refreshSessionAndIsEmailVerified(reloadAuthUser);
  if (verified) {
    redirectToHome();
  }
  return verified;
}
