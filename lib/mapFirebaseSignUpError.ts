/** Maps Firebase Auth sign-up errors to user-facing copy. Never expose raw `error.message`. */
export function mapFirebaseSignUpError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: string }).code)
      : '';

  if (code === 'auth/email-already-in-use') {
    return 'Email already in use';
  }
  if (code === 'auth/invalid-email') {
    return 'Enter a valid email';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters';
  }
  if (code === 'auth/network-request-failed') {
    return 'Check your connection and try again';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email sign-up is not available';
  }

  return 'Something went wrong';
}
