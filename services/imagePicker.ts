import * as ImagePicker from 'expo-image-picker';

import { logError } from '@/utils/errorLogger';

export class ImagePickerPermissionError extends Error {
  override readonly name = 'ImagePickerPermissionError';

  constructor(
    message: string,
    readonly source: 'library' | 'camera',
  ) {
    super(message);
  }
}

export type PickImageOptions = {
  quality?: number;
};

/**
 * Opens the photo library (after requesting permission). Returns asset URI or `null` if canceled.
 * Throws {@link ImagePickerPermissionError} when access is not granted — use Settings copy in UI.
 */
export async function pickImageFromLibrary(
  options: PickImageOptions = {},
): Promise<string | null> {
  const quality = options.quality ?? 0.7;

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted' || !perm.granted) {
    throw new ImagePickerPermissionError(
      'Please enable photo access in Settings.',
      'library',
    );
  }

  let result: Awaited<
    ReturnType<typeof ImagePicker.launchImageLibraryAsync>
  >;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality,
    });
  } catch (e) {
    logError(e);
    throw new Error('PICKER_LAUNCH_FAILED');
  }

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Opens the camera (after requesting permission). Returns asset URI or `null` if canceled.
 */
export async function takePhoto(
  options: PickImageOptions = {},
): Promise<string | null> {
  const quality = options.quality ?? 0.7;

  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted' || !perm.granted) {
    throw new ImagePickerPermissionError(
      'Please enable camera access in Settings.',
      'camera',
    );
  }

  let result: Awaited<ReturnType<typeof ImagePicker.launchCameraAsync>>;
  try {
    result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality,
    });
  } catch (e) {
    logError(e);
    throw new Error('CAMERA_LAUNCH_FAILED');
  }

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}
