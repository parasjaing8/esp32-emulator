import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice, type DiscoveredDevice } from '@/context/DeviceContext';
import { DeviceScanSheet } from '@/components/DeviceScanSheet';
import { colors } from '@/constants/theme';

function UptimeFmt({ secs }: { secs: number }) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const txt = h > 0
    ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
    : `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  return <Text style={S.infoVal}>{txt}</Text>;
}

export default function BoardScreen() {
  const { boardInfo, connected, connecting, disconnect,
          simMode, uptime, appPartition, scanForDevices, connectToDevice } = useDevice();
  const [showScan, setShowScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices]   = useState<DiscoveredDevice[]>([]);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blinkAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      Animated.timing(blinkAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]));
    if (simMode && connected) loop.start(); else { loop.stop(); blinkAnim.setValue(1); }
    return () => loop.stop();
  }, [simMode, connected, blinkAnim]);

  async function handleScan() {
    setScanning(true); setDevices([]);
    const found = await scanForDevices();
    setDevices(found); setScanning(false);
  }

  function openScanner() { setShowScan(true); handleScan(); }

  return (
    <SafeAreaView style={S.root} edges={['top']}>
      <View style={S.header}>
        <View>
          <Text style={S.title}>ESP32 Emulator</Text>
          {connected && boardInfo && <Text style={S.subtitle}>{boardInfo.chip} · {boardInfo.mac}</Text>}

        </View>
        <View style={S.headerRight}>
          {connected && simMode && (
            <Animated.View style={[S.simBadge, { opacity: blinkAnim }]}>
              <Text style={S.simBadgeText}>SIM</Text>
            </Animated.View>
          )}
          {connected ? (
            <TouchableOpacity style={S.disconnBtn} onPress={disconnect} activeOpacity={0.75}>
              <Feather name="bluetooth-off" size={15} color={colors.destructive} />
              <Text style={S.disconnText}>Disconnect</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[S.scanBtn, connecting && { opacity: 0.5 }]}
              onPress={openScanner} disabled={connecting} activeOpacity={0.8}>
              <Feather name="bluetooth" size={15} color="#fff" />
              <Text style={S.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={S.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />}
      >
        {!connected ? (
          <View style={S.empty}>
            <View style={S.emptyIcon}><Feather name="cpu" size={44} color={colors.primary} /></View>
            <Text style={S.emptyTitle}>No board connected</Text>
            <Text style={S.emptySub}>Scan for an ESP32 running OS firmware, or connect to simulation mode.</Text>
            <TouchableOpacity style={S.bigBtn} onPress={openScanner} activeOpacity={0.8}>
              <Feather name="search" size={18} color="#fff" />
              <Text style={S.bigBtnText}>Scan for Boards</Text>
            </TouchableOpacity>
          </View>
        ) : boardInfo ? (
          <>
            {/* Board info */}
            <View style={S.card}>
              <View style={S.cardHead}>
                <Text style={S.cardLabel}>BOARD INFO</Text>
                <View style={S.connBadge}>
                  <View style={S.connDot} />
                  <Text style={S.connText}>CONNECTED</Text>
                </View>
              </View>
              <View style={S.grid}>
                <IR label="Chip"    value={boardInfo.chip} />
                <IR label="Revision" value={boardInfo.revision} />
                <IR label="MAC"     value={boardInfo.mac} mono />
                <IR label="Flash"   value={`${boardInfo.flash_mb} MB`} />
                <IR label="PSRAM"   value={boardInfo.psram_mb > 0 ? `${boardInfo.psram_mb} MB` : 'None'} />
                <IR label="OS ver"  value={boardInfo.fw_version} mono />
                <View style={S.irow}>
                  <Text style={S.ikey}>Uptime</Text>
                  <UptimeFmt secs={uptime} />
                </View>
              </View>
            </View>

            {/* Partitions */}
            <View style={S.card}>
              <Text style={S.cardLabel}>FLASH PARTITIONS</Text>
              <View style={S.partRow}>
                <PartCard label="Partition A" sub="OS Firmware"  ver={boardInfo.fw_version}       active={appPartition === 'os'}  color={colors.primary} />
                <View style={S.arrow}>
                  <Feather name={appPartition === 'os' ? 'arrow-left' : 'arrow-right'} size={16} color={colors.mutedForeground} />
                  <Text style={S.arrowLabel}>BOOT</Text>
                </View>
                <PartCard label="Partition B" sub="App Firmware" ver={boardInfo.app_version ?? '—'} active={appPartition === 'app'} color={colors.success} />
              </View>
            </View>

            {/* Stats row */}
            <View style={S.statsRow}>
              <StatBox icon="sliders"   label="GPIO Pins"  value={String(boardInfo.pins.length)} />
              <StatBox icon="cpu"       label="Chip"       value={boardInfo.chip.replace('ESP32-','')} />
              <StatBox icon="hard-drive" label="Partition" value={appPartition.toUpperCase()} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <DeviceScanSheet
        visible={showScan}
        onClose={() => setShowScan(false)}
        onSelectDevice={async (d) => { setShowScan(false); await connectToDevice(d); }}
        devices={devices}
        isScanning={scanning || connecting}
        onScan={handleScan}
      />
    </SafeAreaView>
  );
}

function IR({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={S.irow}>
      <Text style={S.ikey}>{label}</Text>
      <Text style={[S.infoVal, mono && S.mono]}>{value}</Text>
    </View>
  );
}

function PartCard({ label, sub, ver, active, color }: {
  label: string; sub: string; ver: string; active: boolean; color: string;
}) {
  return (
    <View style={[S.partCard, active && { borderColor: color, backgroundColor: color + '12' }]}>
      {active && (
        <View style={[S.runBadge, { backgroundColor: color + '20' }]}>
          <View style={[S.runDot, { backgroundColor: color }]} />
          <Text style={[S.runText, { color }]}>RUNNING</Text>
        </View>
      )}
      <Text style={S.partLabel}>{label}</Text>
      <Text style={[S.partSub, active && { color: colors.foreground }]}>{sub}</Text>
      <Text style={S.partVer}>{ver}</Text>
    </View>
  );
}

function StatBox({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string }) {
  return (
    <View style={S.statBox}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={S.statVal}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title:       { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground },
  subtitle:    { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  simBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning },
  simBadgeText:{ fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.warning, letterSpacing: 0.6 },
  disconnBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.destructive + '50', backgroundColor: colors.destructive + '10' },
  disconnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.destructive },
  scanBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
  scanBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  content:     { padding: 16, gap: 14, flexGrow: 1 },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon:   { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle:  { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.foreground },
  emptySub:    { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 32, lineHeight: 21 },
  bigBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, marginTop: 6 },
  bigBtnText:  { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  card:        { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 14 },
  cardHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel:   { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, color: colors.mutedForeground },
  connBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  connText:    { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.success, letterSpacing: 0.5 },
  grid:        { gap: 10 },
  irow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ikey:        { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  infoVal:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  mono:        { fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },
  partRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partCard:    { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3, minHeight: 96 },
  runBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  runDot:      { width: 5, height: 5, borderRadius: 3 },
  runText:     { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  partLabel:   { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, letterSpacing: 0.5 },
  partSub:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
  partVer:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  arrow:       { alignItems: 'center', gap: 2 },
  arrowLabel:  { fontSize: 8, fontFamily: 'Inter_700Bold', color: colors.mutedForeground, letterSpacing: 0.5 },
  statsRow:    { flexDirection: 'row', gap: 10 },
  statBox:     { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 5 },
  statVal:     { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.foreground },
  statLabel:   { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
});
