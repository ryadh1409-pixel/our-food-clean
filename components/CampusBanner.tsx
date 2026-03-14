import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type CampusBannerProps = {
  campusName?: string | null;
};

export default function CampusBanner({ campusName }: CampusBannerProps) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>CAMPUS MODE 🎓</Text>
      {campusName ? (
        <Text style={styles.subtext} numberOfLines={1}>
          {campusName}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  subtext: {
    fontSize: 12,
    color: '#B0B0B0',
    marginTop: 2,
  },
});
