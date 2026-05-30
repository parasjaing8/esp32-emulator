import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';
import { type PinDef, type PinMode } from '@/constants/gpio';

type Filter = 'ALL' | 'OUTPUT' | 'INPUT' | 'ADC';
const FILTERS: Filter[] = ['ALL', 'OUTPUT', 'INPUT', 'ADC'];

export default function GpioScreen() {
  const { boardInfo, pinStates, pinModes, adcValues, setPinMode, writePin, simMode } = useDevice();
  const [filter, setFilter]           = useState<Filter>('ALL');
  const [modePin, setModePin]         = useState<PinDef | null>(null);

  const pins: PinDef[] = boardInfo?.pins ?? [];

  const filtered = pins.filter((p) => {
    const m = pinModes[p.gpio] ?? p.defaultMode;
    if (filter === 'OUTPUT') return m === 'OUTPUT' || m === 'PWM';
    if (filter === 'INPUT')  return m === 'INPUT' || m === 'INPUT_PULLUP' || m === 'INPUT_PULLDOWN';
    if (filter === 'ADC')    return m === 'ADC' || p.adcChannel !== undefined;
    return true;
  });

  const isConnected = !!boardInfo;

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.title}>GPIO</Text>
          <Text style={S.subtitle}>
            {isConnected ? `${pins.length} pins · ${boardInfo?.chip}` : 'No board'}
          </Text>
        </View>
        {simMode && isConnected && (
          <View style={S.liveBadge}>
            <View style={S.liveDot} />
            <Text style={S.liveText}>LIVE SIM</Text>
          </View>
        )}
      </View>

      {/* Filter bar */}
      <View style={S.filterBar}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[S.filterBtn, filter === f && S.filterBtnActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[S.filterText, filter === f && S.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isConnected ? (
        <View style={S.empty}>
          <Feather name="sliders" size={40} color={colors.mutedForeground} />
          <Text style={S.emptyText}>Connect a board to view GPIO</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.gpio)}
          numColumns={2}
          columnWrapperStyle={S.row}
          contentContainerStyle={S.grid}
          renderItem={({ item }) => (
            <PinCard
              pin={item}
              mode={pinModes[item.gpio] ?? item.defaultMode}
              state={pinStates[item.gpio] ?? 0}
              adcVal={adcValues[item.gpio]}
              onToggle={() => writePin(item.gpio, (pinStates[item.gpio] ?? 0) === 1 ? 0 : 1)}
              onLongPress={() => setModePin(item)}
            />
          )}
          ListEmptyComponent={
            <Text style={S.noMatchText}>No pins match filter "{filter}"</Text>
          }
        />
      )}

      {/* Mode change sheet */}
      <ModeSheet
        pin={modePin}
        currentMode={modePin ? (pinModes[modePin.gpio] ?? modePin.defaultMode) : 'INPUT'}
        onClose={() => setModePin(null)}
        onSelect={(mode) => { if (modePin) setPinMode(modePin.gpio, mode); setModePin(null); }}
      />
    </SafeAreaView>
  );
}

// ── Pin Card ──────────────────────────────────────────────────────────────────

function PinCard({ pin, mode, state, adcVal, onToggle, onLongPress }: {
  pin: PinDef;
  mode: PinMode;
  state: number;
  adcVal?: number;
  onToggle: () => void;
  onLongPress: () => void;
}) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [state, flashAnim]);

  const isHigh   = state === 1;
  const isSystem = !!pin.systemNote;
  const isOutput = mode === 'OUTPUT' || mode === 'PWM';
  const isAdc    = mode === 'ADC' || (pin.adcChannel !== undefined && mode !== 'OUTPUT');
  const adcPct   = adcVal !== undefined ? adcVal / 4095 : 0;

  const borderColor = isSystem
    ? colors.warning + '60'
    : isHigh && isOutput ? colors.success
    : colors.border;

  const cardBg = isHigh && isOutput ? colors.success + '1A' : colors.card;
  const borderWidth = isHigh && isOutput ? 2 : 1;

  const modeColor = isAdc ? colors.warning
    : isOutput ? colors.primary
    : colors.mutedForeground;

  return (
    <Pressable
      style={S.pinWrap}
      onPress={isOutput && !isSystem ? onToggle : undefined}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <Animated.View style={[
        S.pinCard,
        { borderColor, backgroundColor: cardBg, borderWidth },
        isHigh && isOutput && S.pinCardHighShadow,
        isSystem && S.pinCardSystem,
        { opacity: flashAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 1] }) },
      ]}>
        {/* GPIO number badge */}
        <View style={[S.numBadge, { backgroundColor: isHigh ? colors.success + '22' : colors.border + '80' }]}>
          <Text style={[S.numText, { color: isHigh ? colors.success : colors.mutedForeground }]}>
            {pin.gpio}
          </Text>
        </View>

        {/* Label */}
        <Text style={S.pinLabel} numberOfLines={1}>{pin.label}</Text>

        {/* Mode badge */}
        <View style={[S.modeBadge, { backgroundColor: modeColor + '18' }]}>
          <Text style={[S.modeText, { color: modeColor }]}>{mode}</Text>
        </View>

        {/* System note */}
        {isSystem && <Text style={S.sysNote}>{pin.systemNote}</Text>}

        {/* State indicator */}
        <View style={S.stateRow}>
          <View style={[S.dot, { backgroundColor: isHigh ? colors.success : colors.border }]} />
          <Text style={[S.stateText, { color: isHigh ? colors.success : colors.mutedForeground }]}>
            {isHigh ? 'HIGH' : 'LOW'}
          </Text>
        </View>

        {/* ADC bar */}
        {isAdc && adcVal !== undefined && (
          <View style={S.adcSection}>
            <View style={S.adcBarBg}>
              <View style={[S.adcBarFill, { width: `${Math.round(adcPct * 100)}%` as `${number}%` }]} />
            </View>
            <Text style={S.adcVal}>{adcVal}</Text>
          </View>
        )}

        {/* Toggle hint for output */}
        {isOutput && !isSystem && (
          <Text style={[S.tapHint, isHigh && { color: colors.success + 'AA' }]}>
            Tap to {isHigh ? 'turn OFF' : 'turn ON'}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Mode Sheet ────────────────────────────────────────────────────────────────

function ModeSheet({ pin, currentMode, onClose, onSelect }: {
  pin: PinDef | null;
  currentMode: PinMode;
  onClose: () => void;
  onSelect: (mode: PinMode) => void;
}) {
  if (!pin) return null;
  const modes = pin.systemNote ? [] : pin.modes;
  return (
    <Modal visible={!!pin} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.overlay} onPress={onClose}>
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <Text style={S.sheetTitle}>GPIO{pin.gpio} — Set Mode</Text>
          {pin.systemNote ? (
            <View style={S.sysModeNote}>
              <Feather name="alert-triangle" size={16} color={colors.warning} />
              <Text style={S.sysModeText}>System pin: {pin.systemNote}{'\n'}Mode change not recommended.</Text>
            </View>
          ) : null}
          {modes.map((m) => (
            <TouchableOpacity
              key={m}
              style={[S.modeRow, currentMode === m && S.modeRowActive]}
              onPress={() => onSelect(m)}
              activeOpacity={0.7}
            >
              <Text style={[S.modeRowText, currentMode === m && { color: colors.primary }]}>{m}</Text>
              {currentMode === m && <Feather name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={S.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={S.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const S = StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title:        { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground },
  subtitle:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '40' },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText:     { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.success, letterSpacing: 0.6 },
  filterBar:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterBtn:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
  filterTextActive: { color: '#fff' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:    { fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  noMatchText:  { textAlign: 'center', color: colors.mutedForeground, padding: 40, fontFamily: 'Inter_400Regular' },
  grid:         { padding: 12, paddingBottom: 32 },
  row:          { gap: 10, marginBottom: 10 },
  pinWrap:      { flex: 1 },
  pinCard:      { borderRadius: 12, borderWidth: 1, padding: 12, gap: 5 },
  pinCardSystem:     { borderColor: colors.warning + '50', backgroundColor: colors.warning + '06' },
  pinCardHighShadow: { shadowColor: colors.success, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  pinCardHigh:  {},
  numBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  numText:      { fontSize: 18, fontFamily: 'Inter_700Bold' },
  pinLabel:     { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  modeBadge:    { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  modeText:     { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  sysNote:      { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.warning, fontStyle: 'italic' },
  stateRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot:          { width: 9, height: 9, borderRadius: 5 },
  stateText:    { fontSize: 12, fontFamily: 'Inter_700Bold' },
  adcSection:   { gap: 3, marginTop: 2 },
  adcBarBg:     { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  adcBarFill:   { height: 5, backgroundColor: colors.warning, borderRadius: 3 },
  adcVal:       { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.warning, textAlign: 'right' },
  tapHint:      { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
  // Mode sheet
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:   { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 12 },
  sysModeNote:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.warning + '12', borderRadius: 8, padding: 12, marginBottom: 8 },
  sysModeText:  { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.warning, flex: 1, lineHeight: 18 },
  modeRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  modeRowActive:{ borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  modeRowText:  { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  cancelBtn:    { marginTop: 8, paddingVertical: 14, alignItems: 'center', borderRadius: 10, backgroundColor: colors.border + '50' },
  cancelText:   { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
});
