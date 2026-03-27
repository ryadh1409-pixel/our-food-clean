import { Animated } from 'react-native';

export function runTapScale(value: Animated.Value) {
  Animated.sequence([
    Animated.spring(value, {
      toValue: 0.97,
      useNativeDriver: true,
    }),
    Animated.spring(value, {
      toValue: 1,
      useNativeDriver: true,
    }),
  ]).start();
}

export function runPulse(value: Animated.Value) {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 0.95,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0.55,
        duration: 800,
        useNativeDriver: true,
      }),
    ]),
  );
  loop.start();
  return () => loop.stop();
}
