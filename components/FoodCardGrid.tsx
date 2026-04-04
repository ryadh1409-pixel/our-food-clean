import React from 'react';
import {
  type StyleProp,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

type Props<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function FoodCardGrid<T>({
  data,
  keyExtractor,
  renderItem,
  contentContainerStyle,
}: Props<T>) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {data.map((item) => (
        <View key={keyExtractor(item)} style={styles.cell}>
          {renderItem(item)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    gap: 16,
  },
  cell: {
    width: '100%',
  },
});
