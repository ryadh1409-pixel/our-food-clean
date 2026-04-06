import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Platform } from 'react-native';

import { auth, ensureAuthReady, storage } from '@/services/firebase';

/** Matches Storage rules: `profiles/{auth.uid}.jpg` */
export function profileImageStoragePath(uid: string): string {
  return `profiles/${uid}.jpg`;
}

/**
 * React Native `fetch(file://)` / `fetch(content://)` is unreliable; read local
 * assets with expo-file-system, then build a Blob for the modular Storage SDK.
 */
async function blobFromPickerUri(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Could not read image');
    }
    return response.blob();
  }

  const useFileSystem =
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library:');

  if (useFileSystem) {
    const base64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
    });
    const response = await fetch(
      `data:application/octet-stream;base64,${base64}`,
    );
    return response.blob();
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read image');
  }
  return response.blob();
}

/** Upload profile image for a signed-in user → Storage download URL. */
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

  const blob = await blobFromPickerUri(uri.trim());
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';

  const storageRef = ref(storage, profileImageStoragePath(uid));
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}

/** Current user convenience — same path as signup. */
export async function uploadProfilePhoto(uri: string): Promise<string> {
  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return uploadUserProfileImage(user.uid, uri);
}
