import { theme } from '@/constants/theme';
import { logError } from '@/utils/errorLogger';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const c = theme.colors;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logError(error, { alert: false });
    if (__DEV__) {
      console.error('ErrorBoundary errorInfo:', errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {'We\'re sorry. The app encountered an error. Please try again or restart the app.'}
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.debug} numberOfLines={5}>
              {this.state.error.message}
            </Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: c.background,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: c.text,
  },
  message: {
    fontSize: 16,
    color: c.textMuted,
    textAlign: 'center',
  },
  debug: {
    marginTop: 16,
    fontSize: 12,
    color: c.textSecondary,
  },
});
