import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>

      <TouchableOpacity
        style={{ backgroundColor: '#2563eb', padding: 14, borderRadius: 10, width: '80%' }}
        onPress={() => router.push('/create')}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>Create Order</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={{ borderColor: '#2563eb', borderWidth: 1, padding: 14, borderRadius: 10, width: '80%' }}
        onPress={() => router.push('/join')}
      >
        <Text style={{ color: '#2563eb', textAlign: 'center' }}>Join Order</Text>
      </TouchableOpacity>

    </View>
  );
}
