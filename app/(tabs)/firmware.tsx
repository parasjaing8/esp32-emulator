import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtEta(progress: number, elapsed: number): string {
  if (progress <= 0) return '–';
  const total = elapsed / (progress / 100);
  const rem = Math.max(0, total - elapsed);
  return rem < 10 ? 'almost done' : `~${Math.round(rem)}s`;
}

export default function FirmwareScreen() {
  const { boardInfo, flashFirmware, otaProgress, bootPartition, appPartition, flashHistory } = useDevice();
  const [selected, setSelected] = useState<{ name: string; uri: string; size: number } | null>(null);
  const [flashDone, setFlashDone]   = useState(false);
  const [startTime, setStartTime]   = useState(0);
  const [elapsed, setElapsed]       = useState(0);
  const isConnected = !!boardInfo;
  const isFlashing  = otaProgress !== null;

  // Elapsed timer
  useEffect(() => {
    if (!isFlashing) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startTime) / 1000)), 500);
    return () => clearInterval(t);
  }, [isFlashing, startTime]);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const f = result.assets[0];
    if (!f.name.endsWith('.bin')) {
      Alert.alert('Wrong file type', 'Please select an ESP32 firmware .bin file.');
      return;
    }
    setSelected({ name: f.name, uri: f.uri, size: f.size ?? 0 });
    setFlashDone(false);
  }

  function confirmFlash() {
    if (!selected || !boardInfo) return;
    Alert.alert(
      'Flash Firmware',
      `Flash "${selected.name}" to the app partition?\n\nThe board will be ready to reboot after flashing. The OS partition is never overwritten.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flash', style: 'destructive',
          onPress: async () => {
            setStartTime(Date.now());
            setElapsed(0);
            setFlashDone(false);
            await flashFirmware(selected.uri, selected.name, Math.round(selected.size / 1024));
            setFlashDone(true);
          },
        },
      ]
    );
  }

  const barPct = `${otaProgress ?? 0}%` as `${number}%`;
  const barColor = (otaProgress ?? 0) >= 80 ? colors.success : (otaProgress ?? 0) >= 40 ? colors.accent : colors.primary;

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      <View style={S.header}>
        <Text style={S.title}>Firmware</Text>
        {boardInfo && <Text style={S.subtitle}>{boardInfo.chip} · OS {boardInfo.fw_version}</Text>}
      </View>

      <ScrollView contentContainerStyle={S.content}>
        {!isConnected ? (
          <View style={S.empty}>
            <Feather name="upload-cloud" size={40} color={colors.mutedForeground} />
            <Text style={S.emptyText}>Connect a board to manage firmware</Text>
          </View>
        ) : (
          <>
            {/* Partition visualizer */}
            <View style={S.card}>
              <Text style={S.cardLabel}>FLASH PARTITIONS</Text>
              <View style={S.vizRow}>
                <PartViz
                  label="Partition A"
                  sub="OS Firmware"
                  ver={boardInfo?.fw_version ?? '–'}
                  active={appPartition === 'os'}
                  locked
                  color={colors.primary}
                />
                <View style={S.vizArrow}>
                  <Feather name="chevrons-right" size={20} color={colors.mutedForeground} />
                </View>
                <PartViz
                  label="Partition B"
                  sub="App Firmware"
                  ver={boardInfo?.app_version ?? 'empty'}
                  active={appPartition === 'app'}
                  color={colors.success}
                />
              </View>
              <View style={S.bootRow}>
                <TouchableOpacity
                  style={[S.bootBtn, appPartition === 'os' && S.bootBtnActive]}
                  onPress={() => bootPartition('os')}
                  activeOpacity={0.8}
                >
                  <Feather name="refresh-cw" size={13} color={appPartition === 'os' ? colors.primary : colors.mutedForeground} />
                  <Text style={[S.bootBtnText, appPartition === 'os' && { color: colors.primary }]}>Boot OS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.bootBtn, appPartition === 'app' && S.bootBtnActive]}
                  onPress={() => bootPartition('app')}
                  activeOpacity={0.8}
                >
                  <Feather name="refresh-cw" size={13} color={appPartition === 'app' ? colors.success : colors.mutedForeground} />
                  <Text style={[S.bootBtnText, appPartition === 'app' && { color: colors.success }]}>Boot App</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Flash section */}
            <View style={S.card}>
              <Text style={S.cardLabel}>FLASH NEW FIRMWARE</Text>
              <Text style={S.helpText}>
                Select a .bin file compiled for your ESP32. It will be written to Partition B via BLE OTA.
                The OS partition is never overwritten.
              </Text>

              {/* File picker */}
              <TouchableOpacity style={S.pickBtn} onPress={pickFile} disabled={isFlashing} activeOpacity={0.8}>
                <View style={S.pickIcon}>
                  <Feather name="folder" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.pickBtnLabel}>
                    {selected ? selected.name : 'Choose .bin file…'}
                  </Text>
                  {selected && (
                    <Text style={S.pickBtnSub}>{(selected.size / 1024).toFixed(1)} KB</Text>
                  )}
                </View>
                {selected && <Feather name="check-circle" size={16} color={colors.success} />}
              </TouchableOpacity>

              {/* Progress */}
              {isFlashing && (
                <View style={S.progressSection}>
                  <View style={S.progressLabelRow}>
                    <Text style={S.progressLabel}>Flashing…</Text>
                    <Text style={S.progressPct}>{otaProgress}%</Text>
                  </View>
                  <View style={S.progressBg}>
                    <View style={[S.progressFill, { width: barPct, backgroundColor: barColor }]} />
                  </View>
                  <Text style={S.progressEta}>ETA: {fmtEta(otaProgress ?? 0, elapsed)} · Do not disconnect</Text>
                </View>
              )}

              {/* Flash button or success CTA */}
              {flashDone ? (
                <TouchableOpacity
                  style={S.successBtn}
                  onPress={() => bootPartition('app')}
                  activeOpacity={0.8}
                >
                  <Feather name="play-circle" size={18} color="#fff" />
                  <Text style={S.successBtnText}>Boot to App Firmware</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[S.flashBtn, (!selected || isFlashing) && S.flashBtnDim]}
                  onPress={confirmFlash}
                  disabled={!selected || isFlashing}
                  activeOpacity={0.8}
                >
                  <Feather name="zap" size={16} color="#fff" />
                  <Text style={S.flashBtnText}>{isFlashing ? `Flashing ${otaProgress}%…` : 'Flash Firmware'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* History */}
            {flashHistory.length > 0 && (
              <View style={S.card}>
                <Text style={S.cardLabel}>FLASH HISTORY</Text>
                {flashHistory.map((r, i) => (
                  <View key={i} style={[S.histRow, i > 0 && S.histRowBorder]}>
                    <View style={S.histIcon}>
                      <Feather name="package" size={14} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.histName} numberOfLines={1}>{r.name}</Text>
                      <Text style={S.histMeta}>{r.sizeKb} KB · {fmtDate(r.date)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={S.warning}>
              ⚠ Flashing only writes to Partition B. The OS firmware in Partition A is never modified by this app.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PartViz({ label, sub, ver, active, locked, color }: {
  label: string; sub: string; ver: string; active: boolean; locked?: boolean; color: string;
}) {
  return (
    <View style={[S.vizCard, active && { borderColor: color, backgroundColor: color + '10' }]}>
      {active && (
        <View style={[S.vizBadge, { backgroundColor: color + '20' }]}>
          <View style={[S.vizDot, { backgroundColor: color }]} />
          <Text style={[S.vizBadgeText, { color }]}>RUNNING</Text>
        </View>
      )}
      {locked && (
        <View style={S.lockRow}>
          <Feather name="lock" size={10} color={colors.mutedForeground} />
          <Text style={S.lockText}>Protected</Text>
        </View>
      )}
      <Text style={S.vizLabel}>{label}</Text>
      <Text style={[S.vizSub, active && { color: colors.foreground }]}>{sub}</Text>
      <Text style={S.vizVer}>{ver}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.background },
  header:       { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title:        { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground },
  subtitle:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  content:      { padding: 16, gap: 14, paddingBottom: 32, flexGrow: 1 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText:    { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  card:         { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14 },
  cardLabel:    { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, color: colors.mutedForeground },
  helpText:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, lineHeight: 19 },
  vizRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vizCard:      { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4, minHeight: 100 },
  vizBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  vizDot:       { width: 5, height: 5, borderRadius: 3 },
  vizBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  lockRow:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  lockText:     { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  vizLabel:     { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, letterSpacing: 0.4 },
  vizSub:       { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
  vizVer:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  vizArrow:     { alignItems: 'center' },
  bootRow:      { flexDirection: 'row', gap: 10 },
  bootBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  bootBtnActive:{ borderColor: colors.primary, backgroundColor: colors.primary + '12' },
  bootBtnText:  { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
  pickBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 14, borderStyle: 'dashed' },
  pickIcon:     { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  pickBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.primary },
  pickBtnSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
  progressSection: { gap: 8 },
  progressLabelRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  progressPct:  { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },
  progressBg:   { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressEta:  { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center' },
  flashBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.destructive, borderRadius: 10, padding: 15 },
  flashBtnDim:  { opacity: 0.4 },
  flashBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  successBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, borderRadius: 10, padding: 15 },
  successBtnText:{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  histRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  histRowBorder:{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  histIcon:     { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  histName:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  histMeta:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  warning:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 16, lineHeight: 18 },
});
