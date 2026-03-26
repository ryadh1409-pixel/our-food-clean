import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppLogo from '@/components/AppLogo';
import { theme } from '@/constants/theme';

const ONBOARDING_COMPLETE_KEY = 'onboardingComplete';
const { width } = Dimensions.get('window');

const SLIDES = [
  {
    title: 'Split Meals. Pay Half.',
    description:
      'Share your meal with someone nearby and pay only half the price.',
    icon: '🍽️',
  },
  {
    title: 'Create or Join an Order',
    description: "Start an order or join someone else's order in seconds.",
    icon: '⚡',
  },
  {
    title: 'Save Money on Every Meal',
    description:
      'Split the cost of food and enjoy your favorite meals for less.',
    icon: '💰',
  },
  {
    title: 'Free to Use',
    description: 'HalfOrder is free. Just split the meal and enjoy.',
    icon: '✨',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList<(typeof SLIDES)[0]>>(null);
  const [index, setIndex] = useState(0);

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    router.replace('/');
  };

  const handleGetStarted = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    router.replace('/');
  };

  const isLastPage = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <AppLogo
            size={Math.min(132, Math.round(width * 0.36))}
            marginTop={0}
          />
        </View>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        onScrollToIndexFailed={() => {}}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.illustrationWrap}>
              <Text style={styles.icon}>{item.icon}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          onPress={isLastPage ? handleGetStarted : handleNext}
          style={styles.primaryButton}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {isLastPage ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 8,
    alignItems: 'center',
    position: 'relative',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    position: 'absolute',
    top: 20,
    right: theme.spacing.screen,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  illustrationWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  description: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: theme.colors.primary,
    width: 20,
  },
  dotInactive: {
    backgroundColor: theme.colors.dotInactive,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  primaryButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
});
