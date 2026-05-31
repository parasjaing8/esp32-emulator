import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';

const BAUD_OPTIONS = [9600, 115200, 921600];
const QUICK_CMDS  = ['help', 'reset', 'gpio read 4', 'adc read 1', 'uptime', 'gpio list', 'version'];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function TerminalScreen() {
  const { boardInfo, serialLines, sendSerial, clearSerial, simMode } = useDevice();
  const insets = useSafeAreaInsets();
  const [input, setInput]             = useState('');
  const [paused, setPaused]           = useState(false);
  const [baud, setBaud]               = useState(115200);
  const [showBaud, setShowBaud]       = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [history, setHistory]         = useState<string[]>([]);
  const [histIdx, setHistIdx]         = useState(-1);
  const listRef = useRef<FlatList>(null);
  const prevLen = useRef(0);
  const isConnected = !!boardInfo;

  useEffect(() => {
    if (!paused && serialLines.length !== prevLen.current) {
      prevLen.current = serialLines.length;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [serialLines.length, paused]);

  const send = useCallback(() => {
    if (!input.trim()) return;
    const cmd = input.trimEnd();
    sendSerial(cmd + '\r\n');
    setHistory((h) => [cmd, ...h.filter((c) => c !== cmd)].slice(0, 50));
    setHistIdx(-1);
    setInput('');
  }, [input, sendSerial]);

  const sendQuick = useCallback((cmd: string) => {
    sendSerial(cmd + '\r\n');
  }, [sendSerial]);

  const navigateHistory = useCallback((dir: 'up' | 'down') => {
    setHistIdx((idx) => {
      const next = dir === 'up' ? Math.min(idx + 1, history.length - 1) : Math.max(idx - 1, -1);
      setInput(next === -1 ? '' : history[next]);
      return next;
    });
  }, [history]);

  const isLive = isConnected && serialLines.length > 0;

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.title}>Serial Terminal</Text>
          <Text style={S.subtitle}>{baud.toLocaleString()} baud · UART0{simMode ? ' · SIM' : ''}</Text>
        </View>
        <View style={S.headerRight}>
          {isLive && (
            <View style={S.liveBadge}>
              <View style={S.liveDot} />
              <Text style={S.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      </View>

      {/* Toolbar */}
      <View style={S.toolbar}>
        <TouchableOpacity style={S.toolBtn} onPress={clearSerial} activeOpacity={0.7}>
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
          <Text style={S.toolText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.toolBtn} onPress={() => setPaused(p => !p)} activeOpacity={0.7}>
          <Feather name={paused ? 'play' : 'pause'} size={14} color={paused ? colors.primary : colors.mutedForeground} />
          <Text style={[S.toolText, paused && { color: colors.primary }]}>{paused ? 'Resume' : 'Pause'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.toolBtn} onPress={() => setShowBaud(b => !b)} activeOpacity={0.7}>
          <Feather name="settings" size={14} color={showBaud ? colors.primary : colors.mutedForeground} />
          <Text style={[S.toolText, showBaud && { color: colors.primary }]}>{baud.toLocaleString()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.toolBtn} onPress={() => setShowTimestamps(t => !t)} activeOpacity={0.7}>
          <Feather name="clock" size={14} color={showTimestamps ? colors.primary : colors.mutedForeground} />
          <Text style={[S.toolText, showTimestamps && { color: colors.primary }]}>TS</Text>
        </TouchableOpacity>
        <Text style={S.lineCount}>{serialLines.length} lines</Text>
      </View>

      {/* Baud picker */}
      {showBaud && (
        <View style={S.baudPicker}>
          {BAUD_OPTIONS.map((b) => (
            <TouchableOpacity
              key={b}
              style={[S.baudOption, baud === b && S.baudOptionActive]}
              onPress={() => { setBaud(b); setShowBaud(false); }}
              activeOpacity={0.7}
            >
              <Text style={[S.baudOptionText, baud === b && { color: colors.primary }]}>{b.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!isConnected ? (
        <View style={S.empty}>
          <Feather name="terminal" size={40} color={colors.mutedForeground} />
          <Text style={S.emptyText}>Connect a board to open the terminal</Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={serialLines}
            keyExtractor={(l) => l.id}
            contentContainerStyle={S.logContent}
            style={S.log}
            scrollEnabled={!!serialLines.length}
            renderItem={({ item }) => (
              <View style={S.lineRow}>
                {showTimestamps && (
                  <Text style={S.lineTs}>{fmtTime(item.ts)}</Text>
                )}
                <Text style={[S.line, item.dir === 'tx' && S.lineTx]}>
                  <Text style={item.dir === 'tx' ? S.dirTx : S.dirRx}>
                    {item.dir === 'tx' ? '→ ' : '← '}
                  </Text>
                  {item.text}
                </Text>
              </View>
            )}
            ListEmptyComponent={<Text style={S.emptyLog}>Waiting for serial output…</Text>}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {/* Quick-send buttons */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.quickBar} contentContainerStyle={S.quickBarContent}>
              {QUICK_CMDS.map((cmd) => (
                <TouchableOpacity
                  key={cmd}
                  style={S.quickBtn}
                  onPress={() => sendQuick(cmd)}
                  activeOpacity={0.7}
                >
                  <Text style={S.quickText}>{cmd}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Input row */}
            <View style={[S.inputRow, { paddingBottom: insets.bottom + 8 }]}>
              <View style={S.histBtns}>
                <TouchableOpacity onPress={() => navigateHistory('up')} activeOpacity={0.7} disabled={history.length === 0}>
                  <Feather name="chevron-up" size={18} color={history.length > 0 ? colors.mutedForeground : colors.border} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigateHistory('down')} activeOpacity={0.7} disabled={histIdx < 0}>
                  <Feather name="chevron-down" size={18} color={histIdx >= 0 ? colors.mutedForeground : colors.border} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={S.input}
                value={input}
                onChangeText={(t) => { setInput(t); setHistIdx(-1); }}
                placeholder="Send command…"
                placeholderTextColor={colors.mutedForeground + '80'}
                returnKeyType="send"
                onSubmitEditing={send}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
              />
              <TouchableOpacity
                style={[S.sendBtn, !input.trim() && S.sendBtnDim]}
                onPress={send}
                activeOpacity={0.8}
              >
                <Feather name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#0a0e1a' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title:          { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground },
  subtitle:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '40' },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText:       { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.success, letterSpacing: 0.5 },
  toolbar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '60', backgroundColor: '#0d1220' },
  toolBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.card },
  toolText:       { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  lineCount:      { marginLeft: 'auto', fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground + '80' },
  baudPicker:     { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#0d1220', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '40' },
  baudOption:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  baudOptionActive:{ borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  baudOptionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:      { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  log:            { flex: 1, backgroundColor: '#080c16' },
  logContent:     { padding: 12, paddingBottom: 4, gap: 1 },
  line:           { fontSize: 12, color: '#86efac', lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  lineTx:         { color: '#60a5fa' },
  dirRx:          { color: '#4ade80' },
  dirTx:          { color: '#3b82f6' },
  emptyLog:       { color: colors.mutedForeground + '60', fontSize: 12, textAlign: 'center', marginTop: 40, fontFamily: 'Inter_400Regular' },
  lineRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineTs:         { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.mutedForeground + '50', paddingTop: 2, minWidth: 64 },
  quickBar:       { backgroundColor: '#0d1220', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border + '40', maxHeight: 40 },
  quickBarContent:{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  quickBtn:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  quickText:      { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.mutedForeground },
  inputRow:       { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 8, alignItems: 'center', backgroundColor: '#0d1220' },
  histBtns:       { flexDirection: 'column', alignItems: 'center', gap: 0 },
  input:          { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: '#86efac', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  sendBtn:        { backgroundColor: colors.primary, borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnDim:     { opacity: 0.5 },
});
