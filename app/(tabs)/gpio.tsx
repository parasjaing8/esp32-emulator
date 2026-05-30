import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';
import { type PinDef } from '@/constants/gpio';

export default function GpioScreen() {
  const { connected, boardInfo, pinStates, setPinMode, writePin } = useDevice();
  const pins: PinDef[] = boardInfo?.pins ?? [];

  if (!connected) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.notConnected}>
          <Feather name="sliders" size={40} color={colors.mutedForeground} />
          <Text style={styles.notConnectedText}>Connect a board to control GPIO</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GPIO Control</Text>
        <Text style={styles.headerSub}>{pins.length} pins  ·  {boardInfo?.chip}</Text>
      </View>

      <FlatList
        data={pins}
        keyExtractor={(p) => String(p.gpio)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <PinCard
            pin={item}
            state={pinStates[item.gpio]}
            onToggle={() => writePin(item.gpio, pinStates[item.gpio] ? 0 : 1)}
            onModeChange={(mode) => setPinMode(item.gpio, mode)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function PinCard({
  pin, state, onToggle, onModeChange,
}: {
  pin: PinDef;
  state: number | undefined;
  onToggle: () => void;
  onModeChange: (mode: string) => void;
}) {
  const isOutput  = pin.defaultMode === 'OUTPUT';
  const isHigh    = state === 1;
  const isSystem  = !!pin.systemNote;
  const stateColor = isHigh ? colors.pinHigh : colors.mutedForeground;

  return (
    <View style={[styles.pinCard, isSystem && styles.pinCardSystem]}>
      {/* Pin number badge */}
      <View style={[styles.pinBadge, { backgroundColor: isHigh ? colors.pinHigh + '22' : colors.border }]}>
        <Text style={[styles.pinNum, { color: stateColor }]}>{pin.gpio}</Text>
      </View>

      {/* Label */}
      <Text style={styles.pinLabel} numberOfLines={1}>{pin.label}</Text>
      {isSystem && <Text style={styles.pinSystem} numberOfLines={1}>{pin.systemNote}</Text>}

      {/* State indicator */}
      <View style={styles.pinStateRow}>
        <View style={[styles.pinDot, { backgroundColor: isHigh ? colors.pinHigh : colors.border }]} />
        <Text style={[styles.pinStateText, { color: stateColor }]}>
          {state === undefined ? '—' : isHigh ? 'HIGH' : 'LOW'}
        </Text>
      </View>

      {/* Toggle (output pins only) */}
      {pin.modes.includes('OUTPUT') && !isSystem && (
        <TouchableOpacity style={[styles.toggleBtn, isHigh && styles.toggleBtnOn]} onPress={onToggle} activeOpacity={0.75}>
          <Text style={[styles.toggleText, isHigh && { color: colors.background }]}>
            {isHigh ? 'Turn OFF' : 'Turn ON'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: colors.background },
  header:          { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle:     { fontSize: 18, fontWeight: '700', color: colors.foreground },
  headerSub:       { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  notConnected:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notConnectedText:{ fontSize: 15, color: colors.mutedForeground },
  grid:            { padding: 12, gap: 10 },
  row:             { gap: 10 },
  pinCard:         { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  pinCardSystem:   { borderColor: colors.destructive + '40', backgroundColor: colors.destructive + '08' },
  pinBadge:        { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  pinNum:          { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pinLabel:        { fontSize: 11, color: colors.mutedForeground },
  pinSystem:       { fontSize: 10, color: colors.destructive, fontStyle: 'italic' },
  pinStateRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pinDot:          { width: 6, height: 6, borderRadius: 3 },
  pinStateText:    { fontSize: 11, fontWeight: '600' },
  toggleBtn:       { marginTop: 4, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  toggleBtnOn:     { backgroundColor: colors.pinHigh, borderColor: colors.pinHigh },
  toggleText:      { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
});
