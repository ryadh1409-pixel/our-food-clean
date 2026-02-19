import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { db } from "../../services/firebase";

export default function CreateScreen() {
  const [maxPeople, setMaxPeople] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const num = Number(maxPeople);
    if (Number.isNaN(num) || num < 1) {
      Alert.alert("Error", "Enter a valid number");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, "orders"), {
        maxPeople: num,
        joinedCount: 0,
        participants: [],
        status: "open",
        createdAt: serverTimestamp(),
      });
      Alert.alert("Order created", "Order created");
      setMaxPeople("");
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
        Create Order
      </Text>

      <TextInput
        placeholder="Max people (e.g. 3)"
        value={maxPeople}
        onChangeText={setMaxPeople}
        keyboardType="number-pad"
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <TouchableOpacity
        onPress={() => {
          console.log("CREATE BUTTON PRESSED");
          handleCreate();
        }}
        style={{
          backgroundColor: "#2563eb",
          padding: 14,
          borderRadius: 10,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
        }}
        disabled={loading}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>
          {loading ? "Creating..." : "Create Order"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
