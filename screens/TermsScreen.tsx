import { theme } from '@/constants/theme';
import { TERMS_URL } from '@/services/userTerms';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const c = theme.colors;

const SCROLL_INJECT = `
(function () {
  function post(bottom) {
    try {
      window.ReactNativeWebView.postMessage(bottom ? '1' : '0');
    } catch (e) {}
  }
  function check() {
    var docEl = document.documentElement;
    var body = document.body;
    var h = Math.max(
      docEl ? docEl.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      docEl ? docEl.offsetHeight : 0,
      body ? body.offsetHeight : 0,
    );
    var y = window.pageYOffset != null ? window.pageYOffset : (docEl && docEl.scrollTop) || 0;
    var vh = window.innerHeight || (docEl && docEl.clientHeight) || 0;
    var shortPage = h > 0 && h <= vh + 16;
    var atBottom = shortPage || y + vh >= h - 48;
    post(atBottom);
  }
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('load', check);
  document.addEventListener('DOMContentLoaded', check);
  setTimeout(check, 200);
  setTimeout(check, 800);
  setTimeout(check, 2000);
  check();
})();
true;
`;

export type TermsScreenProps = {
  /** Defaults to production Terms URL. */
  termsUrl?: string;
  onAgree: () => Promise<void>;
};

export default function TermsScreen({
  termsUrl = TERMS_URL,
  onAgree,
}: TermsScreenProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const canPress = scrolledToBottom && !submitting && !pageLoading && !loadError;
  const buttonDisabled = !canPress;

  const handleAgree = async () => {
    if (buttonDisabled) return;
    setSubmitting(true);
    try {
      await onAgree();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.subtitle}>
          Scroll through the full document to continue.
        </Text>
      </View>

      <View style={styles.webWrap}>
        {pageLoading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={styles.loadingText}>Loading terms…</Text>
          </View>
        ) : null}

        <WebView
          key={reloadKey}
          source={{ uri: termsUrl }}
          style={styles.webview}
          onLoadStart={() => {
            setLoadError(false);
            setPageLoading(true);
          }}
          onLoadEnd={() => setPageLoading(false)}
          onError={() => {
            setLoadError(true);
            setPageLoading(false);
          }}
          onHttpError={() => {
            setLoadError(true);
            setPageLoading(false);
          }}
          onMessage={(e) => {
            if (e.nativeEvent.data === '1') {
              setScrolledToBottom(true);
            }
          }}
          injectedJavaScript={SCROLL_INJECT}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          originWhitelist={['https://*', 'http://*']}
          /** iOS: match app dark chrome */
          userAgent={
            Platform.OS === 'ios'
              ? 'HalfOrderApp/1 CFNetwork HalfOrder-TermsWebView'
              : undefined
          }
        />
      </View>

      {loadError ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorBanner}>
            Could not load the terms page. Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => {
              setLoadError(false);
              setPageLoading(true);
              setScrolledToBottom(false);
              setReloadKey((k) => k + 1);
            }}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading terms"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={() => void handleAgree()}
          disabled={buttonDisabled}
          style={({ pressed }) => [
            styles.cta,
            buttonDisabled && styles.ctaDisabled,
            pressed && !buttonDisabled && styles.ctaPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Agree and continue"
          accessibilityState={{ disabled: buttonDisabled }}
        >
          {submitting ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.ctaText}>Agree &amp; Continue</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          You must read to the end before you can continue. This applies once per account.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: c.white,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: c.textMuted,
    fontWeight: '500',
  },
  webWrap: {
    flex: 1,
    marginHorizontal: 0,
    backgroundColor: '#0a0c10',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0c10',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,12,0.85)',
    zIndex: 2,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: '600',
  },
  errorRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  errorBanner: {
    fontSize: 13,
    color: '#fca5a5',
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: c.primary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: c.sheetDark,
  },
  cta: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaDisabled: {
    opacity: 0.38,
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '800',
    color: c.textOnPrimary,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: c.textMuted,
    textAlign: 'center',
  },
});
