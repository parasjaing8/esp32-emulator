import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';

interface TermLine {
  id: string;
  text: string;
  dir: 'rx' | 'tx';
  ts: number;
}

export default function TerminalScreen() {
  const { connected, serialLines, sendSerial } = useDevice();
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (serialLines.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [serialLines.length]);

  function send() {
    if (!input.trim()) return;
    sendSerial(input + '\n');
    setInput('');
  }

  if (!connected) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.notConnected}>
          <Feather name="terminal" size={40} color={colors.mutedForeground} />
          <Text style={styles.notConnectedText}>Connect a board to open serial terminal</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Serial Terminal</Text>
        <Text style={styles.headerSub}>115200 baud · UART0 over BLE</Text>
      </View>

      <FlatList
        ref={listRef}
        data={serialLines}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.logContent}
        style={styles.log}
        renderItem={({ item }) => (
          <Text style={[styles.line, item.dir === 'tx' && styles.lineTx]}>
            <Text style={styles.lineDir}>{item.dir === 'rx' ? '← ' : '→ '}</Text>
            {item.text}
          </Text>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No serial output yet…</Text>}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Send command…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="send"
            onSubmitEditing={send}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} activeOpacity={0.8}>
            <Feather name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: colors.background },
  header:          { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle:     { fontSize: 18, fontWeight: '700', color: colors.foreground },
  headerSub:       { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  notConnected:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notConnectedText:{ fontSize: 15, color: colors.mutedForeground },
  log:             { flex: 1 },
  logContent:      { padding: 12, gap: 2 },
  line:            { fontFamily: 'monospace', fontSize: 12, color: colors.foreground, lineHeight: 18 },
  lineTx:          { color: colors.primary },
  lineDir:         { color: colors.mutedForeground },
  empty:           { color: colors.mutedForeground, fontSize: 13, textAlign: 'center', marginTop: 40 },
  inputRow:        { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input:           { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, fontFamily: 'monospace', fontSize: 13 },
  sendBtn:         { backgroundColor: colors.primary, borderRadius: 10, width: 44, alignItems: 'center', justifyContent: 'center' },
});
