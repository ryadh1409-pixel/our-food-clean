import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '@/services/firebase';

/**
 * Expo-compatible upload: fetch local ImagePicker URI → blob → Firebase Storage.
 * Object path: `profileImages/{uid}.jpg` (must match `storage.rules`).
 */
export async function uploadProfilePhoto(
  uid: string,
  imageUri: string,
): Promise<string> {
  if (!uid?.trim()) {
    throw new Error('Not authenticated — cannot upload.');
  }
  if (!imageUri?.trim()) {
    throw new Error('No image selected.');
  }

  const response = await fetch(imageUri);
  if (!response.ok) {
    throw new Error(`Could not read image (HTTP ${response.status}).`);
  }
  const blob = await response.blob();

  const storageRef = ref(storage, `profileImages/${uid}.jpg`);
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'image/jpeg',
  });

  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}
