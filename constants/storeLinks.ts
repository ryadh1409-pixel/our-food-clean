import Constants from 'expo-constants';

type StoreExtra = {
  /** Numeric App Store ID only (e.g. 6471234567). Set in app.json → expo.extra. */
  iosAppStoreId?: string;
  /** Optional override; defaults to expo.android.package from app config. */
  androidPlayStorePackage?: string;
};

function readExtra(): StoreExtra {
  return (Constants.expoConfig?.extra ?? {}) as StoreExtra;
}

/**
 * App Store URL: uses configured numeric ID when present, otherwise App Store search (always valid).
 */
export function getIosAppStoreUrl(): string {
  const raw = readExtra().iosAppStoreId?.trim() ?? '';
  const id = raw.replace(/\D/g, '');
  if (id.length >= 9) {
    return `https://apps.apple.com/app/id${id}`;
  }
  return 'https://apps.apple.com/search?term=HalfOrder';
}

/**
 * Play Store listing for the app package from config.
 */
export function getPlayStoreUrl(): string {
  const extra = readExtra();
  const pkg =
    extra.androidPlayStorePackage?.trim() ||
    Constants.expoConfig?.android?.package ||
    'com.anonymous.ourfoodclean';
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
}
