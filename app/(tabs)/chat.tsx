import { useAuth } from '@/services/AuthContext';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  createdAt?: number;
};

export default function ChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const flatListRef = useRef<FlatList<Message> | null>(null);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const outgoingText = input;
    setError('');
    const userMessage: Message = {
      id: Date.now().toString(),
      text: outgoingText,
      sender: 'user',
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: outgoingText,
          user: {
            uid: user?.uid ?? '',
            name: user?.displayName ?? 'User',
          },
        }),
      });

      const data = (await res.json()) as { response?: string };

      const botMessage: Message = {
        id: Date.now().toString() + '-bot',
        text: data.response ?? 'No response from server',
        sender: 'bot',
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        text: 'Error connecting to AI',
        sender: 'bot',
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      setError('Could not reach AI server.');
    }

    setLoading(false);
  };

  const handleMicPress = () => {
    Speech.stop();
    setListening(true);
    setTimeout(() => setListening(false), 1500);
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.message,
        item.sender === 'user' ? styles.user : styles.bot,
      ]}
    >
      <Text style={styles.text}>{item.text}</Text>
      {item.createdAt ? (
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {loading ? (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#9CA3AF" />
          <Text style={styles.typingText}>Typing...</Text>
        </View>
      ) : null}
      {listening ? <Text style={styles.listeningText}>Listening...</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={handleMicPress} style={styles.micButton}>
          <Text style={styles.micText}>🎤</Text>
        </TouchableOpacity>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor="#8A8A8A"
          style={styles.input}
          editable={!loading}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={[styles.button, loading && styles.buttonDisabled]}
          disabled={loading}
        >
          <Text style={{ color: '#fff' }}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  messagesContent: { padding: 12, paddingBottom: 20 },

  message: {
    padding: 12,
    borderRadius: 10,
    marginVertical: 5,
    maxWidth: '80%',
  },

  user: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },

  bot: {
    backgroundColor: '#333',
    alignSelf: 'flex-start',
  },

  text: { color: '#fff' },
  time: { color: '#B6B6B6', marginTop: 4, fontSize: 11 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  typingText: { color: '#B6B6B6', fontSize: 13 },
  listeningText: {
    color: '#93C5FD',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
  },
  errorText: {
    color: '#FCA5A5',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
  },

  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#222',
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micText: { fontSize: 16 },

  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
  },

  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
