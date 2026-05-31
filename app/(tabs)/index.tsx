import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice, type DiscoveredDevice } from '@/context/DeviceContext';
import { DeviceScanSheet } from '@/components/DeviceScanSheet';
import { DeviceSetupModal } from '@/components/DeviceSetupModal';
import { PairingSheet } from '@/components/PairingSheet';
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
          simMode, uptime, appPartition, scanForDevices, connectToDevice,
          authNeeded, submitPassword, completeSetup, dismissAuth } = useDevice();
  const [showScan, setShowScan]   = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [devices, setDevices]     = useState<DiscoveredDevice[]>([]);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blinkAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      Animated.timing(blinkAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
    ]));
    if (!connected || (simMode && connected)) loop.start();
    else { loop.stop(); blinkAnim.setValue(1); }
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
          <Text style={S.title}>FlashLink</Text>
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
              <Feather name="bluetooth" size={15} color={colors.destructive} />
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
            {/* Animated radar ring */}
            <Animated.View style={[S.radarOuter, { opacity: blinkAnim, transform: [{ scale: blinkAnim.interpolate({ inputRange: [0.25, 1], outputRange: [0.92, 1] }) }] }]}>
              <View style={S.radarInner}>
                <Feather name="cpu" size={44} color={colors.primary} />
              </View>
            </Animated.View>
            <Text style={S.emptyTitle}>No board connected</Text>
            <Text style={S.emptySub}>Scan for an ESP32 running FlashLink OS firmware over Bluetooth.</Text>
            <TouchableOpacity style={S.bigBtn} onPress={openScanner} activeOpacity={0.8}>
              <Feather name="bluetooth" size={18} color="#fff" />
              <Text style={S.bigBtnText}>Scan for Boards</Text>
            </TouchableOpacity>
          </View>
        ) : !boardInfo ? (
          <View style={S.empty}>
            <Animated.View style={[S.radarOuter, { opacity: blinkAnim }]}>
              <View style={S.radarInner}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            </Animated.View>
            <Text style={S.emptyTitle}>Connecting…</Text>
            <Text style={S.emptySub}>
              {authNeeded ? 'Enter your board password to continue.' : 'Reading board info over BLE.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Hero connection banner */}
            <View style={S.heroBanner}>
              <View style={S.heroLeft}>
                <View style={S.heroDot} />
                <View>
                  <Text style={S.heroChip}>{boardInfo.chip}</Text>
                  <Text style={S.heroMac}>{boardInfo.mac}</Text>
                </View>
              </View>
              <View style={S.heroRight}>
                <Text style={S.heroUptime}><UptimeFmt secs={uptime} /></Text>
                <Text style={S.heroUptimeLabel}>uptime</Text>
              </View>
            </View>

            {/* Specs grid */}
            <View style={S.specsGrid}>
              <SpecTile label="Flash" value={`${boardInfo.flash_mb} MB`} icon="hard-drive" />
              <SpecTile label="PSRAM" value={boardInfo.psram_mb > 0 ? `${boardInfo.psram_mb} MB` : 'None'} icon="database" />
              <SpecTile label="GPIO" value={String(boardInfo.pins.length)} icon="sliders" />
              <SpecTile label="OS ver" value={boardInfo.fw_version} icon="tag" />
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
          </>
        )}
      </ScrollView>

      <DeviceScanSheet
        visible={showScan}
        onClose={() => setShowScan(false)}
        onSelectDevice={async (d) => { setShowScan(false); await connectToDevice(d); }}
        devices={devices}
        isScanning={scanning || connecting}
        onScan={handleScan}
      />

      <PairingSheet
        visible={!!authNeeded && !showSetup}
        isFirstTimeSetup={!authNeeded?.isClaimed}
        onSetupRequired={() => setShowSetup(true)}
        onSubmit={async (password) => {
          const ok = await submitPassword(password);
          if (!ok) return 'fail';
          return authNeeded?.isClaimed ? 'ok' : 'setup_required';
        }}
      />

      <DeviceSetupModal
        visible={showSetup}
        onSubmit={async (name, password) => {
          const ok = await completeSetup(name, password);
          if (ok) setShowSetup(false);
        }}
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

function SpecTile({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string }) {
  return (
    <View style={S.specTile}>
      <Feather name={icon} size={14} color={colors.mutedForeground} />
      <Text style={S.specVal}>{value}</Text>
      <Text style={S.specLabel}>{label}</Text>
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
  content:     { padding: 16, gap: 14, flexGrow: 1, paddingBottom: 32 },
  // Empty state — animated radar ring
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 14 },
  radarOuter:  { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: colors.primary + '40', backgroundColor: colors.primary + '08', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  radarInner:  { width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: colors.primary + '60', backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:  { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.foreground },
  emptySub:    { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 32, lineHeight: 21 },
  bigBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  bigBtnText:  { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  // Hero banner when connected
  heroBanner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.success + '0C', borderRadius: 14, borderWidth: 1, borderColor: colors.success + '30', padding: 16 },
  heroLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, shadowColor: colors.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 },
  heroChip:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground },
  heroMac:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
  heroRight:   { alignItems: 'flex-end' },
  heroUptime:  { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.success },
  heroUptimeLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  // Specs grid
  specsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  specTile:    { width: '47%', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4, alignItems: 'flex-start' },
  specVal:     { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground },
  specLabel:   { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  // Standard card
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
});
