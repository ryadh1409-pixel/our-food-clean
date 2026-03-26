import { theme } from '@/constants/theme';
import React from 'react';
import { Text, View } from 'react-native';

const STAR_COLOR = theme.colors.warning;
const TEXT_COLOR = theme.colors.text;

type TrustScoreLabelProps = {
  average: number;
  count: number;
  showTrusted?: boolean;
  compact?: boolean;
};

export function TrustScoreLabel({
  average,
  count,
  showTrusted = false,
  compact = false,
}: TrustScoreLabelProps) {
  if (count === 0) return null;
  const numStr = average.toFixed(1);
  const suffix = compact
    ? ` ${numStr}`
    : ` ${numStr} (${count} review${count === 1 ? '' : 's'})`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: STAR_COLOR, fontSize: compact ? 13 : 14 }}>★</Text>
      <Text
        style={{
          color: TEXT_COLOR,
          fontSize: compact ? 13 : 14,
          fontWeight: '600',
        }}
      >
        {suffix}
      </Text>
      {showTrusted && count >= 1 ? (
        <Text style={{ color: TEXT_COLOR, fontSize: 12, fontWeight: '500' }}>
          Trusted User
        </Text>
      ) : null}
    </View>
  );
}
