import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type PaymentChoice = 'pay_at_restaurant_split';

type PaymentOptionProps = {
  value: PaymentChoice;
  onChange: (v: PaymentChoice) => void;
};

const SINGLE_OPTION: PaymentChoice = 'pay_at_restaurant_split';

export default function PaymentOption({ value, onChange }: PaymentOptionProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[
          styles.option,
          value === SINGLE_OPTION && styles.optionSelected,
        ]}
        onPress={() => onChange(SINGLE_OPTION)}
        activeOpacity={0.8}
      >
        <Text style={styles.label}>
          Pay at restaurant and split the bill together
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#FFD700',
    backgroundColor: '#2C2C2E',
  },
  label: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
