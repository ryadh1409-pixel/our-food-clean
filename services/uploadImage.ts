/**
 * Pick an image from the library and upload to Firebase Storage.
 */
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '@/services/firebase';
import { uploadUserProfileImage } from '@/services/profilePhoto';

export type PickUploadOptions = {
  /** Storage path prefix, e.g. `foodTemplates`. Default `uploads`. */
  folder?: string;
  /** Owning user id for namespacing paths. */
  uid: string;
  quality?: number;
};

/**
 * Requests gallery permission, opens picker, uploads JPEG to Storage.
 * @returns Public download URL or `null` if user cancelled / upload failed.
 */
export async function pickAndUploadImage(
  options: PickUploadOptions,
): Promise<{ url: string | null; error?: string }> {
  const uid = options.uid.trim();
  if (!uid) {
    return { url: null, error: 'Missing user id' };
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { url: null, error: 'Photo library permission denied' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: options.quality ?? 0.85,
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return { url: null };
  }

  try {
    const uri = result.assets[0].uri;
    const res = await fetch(uri);
    const blob = await res.blob();
    const folder = (options.folder ?? 'uploads').replace(/^\/+|\/+$/g, '');
    const path = `${folder}/${uid}/${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);
    return { url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    console.warn('[uploadImage]', msg);
    return { url: null, error: msg };
  }
}

/**
 * Upload a local image URI for a user → Storage download URL.
 * Uses `profiles/{userId}.jpg` (matches {@link storage.rules} and signup flow).
 */
export async function uploadImageAsync(
  uri: string,
  userId: string,
): Promise<string> {
  const uid = userId.trim();
  if (!uid) {
    throw new Error('Missing user id');
  }
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (!u) {
    throw new Error('No image selected');
  }
  return uploadUserProfileImage(uid, u);
}
