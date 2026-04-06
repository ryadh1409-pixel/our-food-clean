import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { auth, ensureAuthReady, storage } from '@/services/firebase';

export function profileImageStoragePath(uid: string): string {
  return `users/${uid}/profile.jpg`;
}

/** Upload profile image for a signed-in user; path `users/{uid}/profile.jpg`. */
export async function uploadUserProfileImage(
  uid: string,
  uri: string,
): Promise<string> {
  if (!uri?.trim()) {
    throw new Error('No image selected');
  }
  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, profileImageStoragePath(uid));
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Current user convenience — same path as signup / spec. */
export async function uploadProfilePhoto(uri: string): Promise<string> {
  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return uploadUserProfileImage(user.uid, uri);
}
