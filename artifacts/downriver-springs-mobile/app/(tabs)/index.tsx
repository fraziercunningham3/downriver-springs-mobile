import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isInspectionCancellationError, useApp, InspectionComponent, Inspection } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const components: { label: InspectionComponent; icon: keyof typeof Feather.glyphMap }[] = [
  { label: 'Engine', icon: 'disc' },
  { label: 'Mounts', icon: 'anchor' },
  { label: 'Leaks', icon: 'droplet' },
  { label: 'Wiring', icon: 'zap' },
  { label: 'Exhaust', icon: 'wind' },
];

const guidanceCards: { label: string; icon: keyof typeof Feather.glyphMap; detail: string }[] = [
  { label: 'Major repair', icon: 'alert-triangle', detail: 'Engine, transmission, mounts, leaks, and electrical faults.' },
  { label: 'Keep it reliable', icon: 'check-circle', detail: 'Routine maintenance questions before a small issue grows.' },
  { label: 'Make it shine', icon: 'sun', detail: 'Paint, finish, and when a wax or detail job is the right move.' },
];

function SeverityPill({ severity }: { severity: string }) {
  const style = severity === 'urgent' ? styles.urgentPill : severity === 'attention' ? styles.attentionPill : styles.watchPill;
  const text = severity === 'urgent' ? 'Urgent' : severity === 'attention' ? 'Needs attention' : 'Monitor';
  return <View style={[styles.pill, style]}><Text style={styles.pillText}>{text}</Text></View>;
}

function InspectionCard({ inspection, onShare }: { inspection: Inspection; onShare: (inspection: Inspection) => void }) {
  const colors = useColors();
  const finding = inspection.findings[0];
  return (
    <View style={styles.inspectionCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.componentIcon}><Feather name="file-text" size={16} color={colors.primary} /></View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardEyebrow}>{inspection.component.toUpperCase()} · {inspection.mediaKind}</Text>
          <Text style={styles.cardTitle}>{finding.title}</Text>
        </View>
        <SeverityPill severity={finding.severity} />
      </View>
      <Text style={styles.cardBody}>{finding.detail}</Text>
      <View style={styles.evidenceBox}>
        <Text style={styles.evidenceLabel}>VISIBLE EVIDENCE</Text>
        {(finding.evidence ?? [finding.detail]).map((evidence) => <Text key={evidence} style={styles.evidenceText}>• {evidence}</Text>)}
      </View>
      <View style={styles.confidenceRow}>
        <Text style={styles.confidenceLabel}>AI confidence</Text>
        <View style={styles.confidenceTrack}><View style={[styles.confidenceFill, { width: `${finding.confidence * 100}%` }]} /></View>
        <Text style={styles.confidenceValue}>{Math.round(finding.confidence * 100)}%</Text>
      </View>
      <View style={styles.recommendationBox}><Feather name="tool" size={15} color={colors.primary} /><Text style={styles.recommendationText}>{finding.recommendation}</Text></View>
      <Pressable testID="share-inspection-summary" onPress={() => onShare(inspection)} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}>
        <Feather name="copy" size={15} color={colors.primary} /><Text style={styles.outlineButtonText}>Copy mechanic summary</Text>
      </Pressable>
    </View>
  );
}

export default function InspectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { inspections, addInspection, cancelInspection, analysisStage, isAnalyzing, isHydrated } = useApp();
  const [selectedComponent, setSelectedComponent] = useState<InspectionComponent>('Engine');
  const [selectedGuidance, setSelectedGuidance] = useState('Major repair');
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState('');
  const [observation, setObservation] = useState('');

  const runAnalysis = async (mediaKind: 'photo' | 'video', mediaUri?: string, durationMs?: number) => {
    setMediaError(null);
    if (!vehicle.trim()) {
      setMediaError('Add the year, make, and model before starting an inspection.');
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await addInspection({ component: selectedComponent, mediaKind, mediaUri, durationMs, vehicle, observation });
      setSelectedInspection(result);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      if (isInspectionCancellationError(error)) return;
      setMediaError(error instanceof Error ? error.message : 'We could not analyze that media. Try again.');
    }
  };

  const stopAnalysis = () => {
    cancelInspection();
    setMediaError(null);
  };

  const openCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setMediaError('Camera access is needed to scan a vehicle component.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 30 });
      if (!result.canceled && result.assets[0]) await runAnalysis(result.assets[0].type === 'video' ? 'video' : 'photo', result.assets[0].uri, result.assets[0].duration ?? undefined);
    } catch { setMediaError('We could not open the camera. Try choosing media from your library instead.'); }
  };

  const openLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setMediaError('Photo library access is needed to upload inspection media.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) await runAnalysis(result.assets[0].type === 'video' ? 'video' : 'photo', result.assets[0].uri, result.assets[0].duration ?? undefined);
    } catch { setMediaError('We could not open your media library. Please try again.'); }
  };

  const shareSummary = async (inspection: Inspection) => {
    await Share.share({ message: inspection.summary, title: 'Downriver Springs inspection summary' });
  };

  if (!isHydrated) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: Platform.OS === 'web' ? 100 : 112 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View><Text style={styles.brandKicker}>DOWNRIVER SPRINGS</Text><Text style={styles.screenTitle}>Inspect your car</Text></View>
          <Pressable testID="open-shop-portal" onPress={() => router.push('/shop')} style={({ pressed }) => [styles.portalButton, pressed && styles.pressed]}><Ionicons name="speedometer-outline" size={19} color={colors.primary} /></Pressable>
        </View>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Feather name="crosshair" size={20} color={colors.primaryForeground} /></View>
          <Text style={styles.heroTitle}>Know what to ask before you arrive.</Text>
          <Text style={styles.heroBody}>Scan a component and get a mechanic-ready readout in under a minute.</Text>
          <View style={styles.heroMeta}><View style={styles.liveDot} /><Text style={styles.heroMetaText}>AI-assisted · visual clues, not a final diagnosis</Text></View>
        </View>
        <Text style={styles.sectionLabel}>WHAT KIND OF ADVICE DO YOU NEED?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.guidanceRow}>
          {guidanceCards.map((card) => {
            const active = selectedGuidance === card.label;
            return <Pressable key={card.label} onPress={() => setSelectedGuidance(card.label)} style={({ pressed }) => [styles.guidanceCard, active && styles.guidanceCardActive, pressed && styles.pressed]}><Feather name={card.icon} size={17} color={active ? colors.primaryForeground : colors.primary} /><Text style={[styles.guidanceTitle, active && styles.guidanceTitleActive]}>{card.label}</Text><Text numberOfLines={2} style={[styles.guidanceDetail, active && styles.guidanceDetailActive]}>{card.detail}</Text></Pressable>;
          })}
        </ScrollView>
        <Text style={styles.sectionLabel}>WHAT ARE YOU CHECKING?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {components.map((component) => {
            const active = component.label === selectedComponent;
            return <Pressable key={component.label} testID={`component-${component.label.toLowerCase()}`} onPress={() => setSelectedComponent(component.label)} style={({ pressed }) => [styles.componentChip, active && styles.componentChipActive, pressed && styles.pressed]}><Feather name={component.icon} size={16} color={active ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.componentChipText, active && styles.componentChipTextActive]}>{component.label}</Text></Pressable>;
          })}
        </ScrollView>
        <View style={styles.reportCard}>
          <Text style={styles.reportLabel}>CUSTOMER REPORT</Text>
          <TextInput value={vehicle} onChangeText={setVehicle} placeholder="Vehicle · e.g. 2018 Honda Civic" placeholderTextColor="#8B97A8" style={styles.reportInput} />
          <TextInput value={observation} onChangeText={setObservation} placeholder="What did you notice? (optional)" placeholderTextColor="#8B97A8" style={[styles.reportInput, styles.reportObservation]} multiline />
          <Text style={styles.reportHint}>The assistant uses your report as context and does not treat it as a confirmed diagnosis.</Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable testID="scan-photo-video" onPress={openCamera} disabled={isAnalyzing} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, isAnalyzing && styles.disabled]}>
            {isAnalyzing ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="camera" size={20} color={colors.primaryForeground} />}<Text style={styles.primaryActionText}>{isAnalyzing ? 'Analyzing…' : 'Scan now'}</Text>
          </Pressable>
          <Pressable testID="upload-photo-video" onPress={openLibrary} disabled={isAnalyzing} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, isAnalyzing && styles.disabled]}><Feather name="upload" size={19} color={colors.primary} /><Text style={styles.secondaryActionText}>Upload</Text></Pressable>
        </View>
        {isAnalyzing ? (
          <View style={styles.analysisProgress}>
            <Text style={styles.analysisStatus}>
              {analysisStage === 'preparing' ? 'Preparing selected media…' : 'Vision model is reviewing the selected media…'}
            </Text>
            <Pressable testID="cancel-inspection" onPress={stopAnalysis} style={({ pressed }) => [styles.cancelAction, pressed && styles.pressed]}>
              <Feather name="x-circle" size={16} color={colors.primary} />
              <Text style={styles.cancelActionText}>Cancel inspection</Text>
            </Pressable>
          </View>
        ) : null}
        {mediaError ? <Text style={styles.errorText}>{mediaError}</Text> : null}
        {selectedInspection ? <View><View style={styles.resultHeader}><Text style={styles.sectionLabel}>LATEST READOUT</Text><Pressable onPress={() => setSelectedInspection(null)}><Text style={styles.dismissText}>Dismiss</Text></Pressable></View><InspectionCard inspection={selectedInspection} onShare={shareSummary} /></View> : null}
        <View style={styles.recentHeader}><Text style={styles.sectionLabel}>RECENT INSPECTIONS</Text><Text style={styles.recentCount}>{inspections.length} saved</Text></View>
        {inspections.length === 0 ? <View style={styles.emptyCard}><Feather name="image" size={20} color={colors.mutedForeground} /><Text style={styles.emptyTitle}>Your inspection history will show up here.</Text><Text style={styles.emptyBody}>Start with a photo of the component you want a second set of eyes on.</Text></View> : inspections.slice(0, 3).map((inspection) => <InspectionCard key={inspection.id} inspection={inspection} onShare={shareSummary} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  brandKicker: { fontFamily: 'Inter_700Bold', color: '#2455D6', fontSize: 11, letterSpacing: 1.5, marginBottom: 5 }, screenTitle: { fontFamily: 'Inter_700Bold', color: '#17202A', fontSize: 29, letterSpacing: -0.8 },
  portalButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE2EB' },
  heroCard: { marginHorizontal: 20, padding: 20, borderRadius: 22, backgroundColor: '#17202A', overflow: 'hidden', marginBottom: 28 }, heroIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 27, maxWidth: 290, letterSpacing: -0.4 }, heroBody: { color: '#B8C2D3', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 310 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 18 }, liveDot: { width: 7, height: 7, backgroundColor: '#57C08B', borderRadius: 4, marginRight: 8 }, heroMetaText: { color: '#D6DEEC', fontFamily: 'Inter_500Medium', fontSize: 11 },
  guidanceRow: { paddingHorizontal: 20, gap: 9, marginTop: 12, marginBottom: 22 }, guidanceCard: { width: 148, minHeight: 110, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', padding: 12 }, guidanceCardActive: { backgroundColor: '#EAF0FF', borderColor: '#B6C8F9' }, guidanceTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 9 }, guidanceTitleActive: { color: '#1B3B9E' }, guidanceDetail: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 5 }, guidanceDetailActive: { color: '#3653A2' },
  sectionLabel: { marginHorizontal: 20, color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 }, chipRow: { paddingHorizontal: 20, gap: 9, marginTop: 12, marginBottom: 17 },
  componentChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB' }, componentChipActive: { backgroundColor: '#2455D6', borderColor: '#2455D6' },
  componentChipText: { color: '#526174', fontFamily: 'Inter_600SemiBold', fontSize: 12 }, componentChipTextActive: { color: '#FFFFFF' },
  reportCard: { marginHorizontal: 20, marginBottom: 15, padding: 13, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB' },
  reportLabel: { color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  reportInput: { height: 42, borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 10, paddingHorizontal: 10, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 8 },
  reportObservation: { height: 58, paddingTop: 10, textAlignVertical: 'top' },
  reportHint: { color: '#8B97A8', fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 6 },
  primaryAction: { flex: 1, height: 54, borderRadius: 16, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, primaryActionText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
  secondaryAction: { width: 112, height: 54, borderRadius: 16, backgroundColor: '#DDE6FF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, secondaryActionText: { color: '#1B3B9E', fontFamily: 'Inter_700Bold', fontSize: 14 },
  pressed: { opacity: 0.78 }, disabled: { opacity: 0.58 }, analysisProgress: { marginTop: 8, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, analysisStatus: { color: '#526174', fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 }, cancelAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 }, cancelActionText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 12 }, errorText: { color: '#C73E3E', fontFamily: 'Inter_500Medium', fontSize: 12, marginHorizontal: 20, marginTop: 7 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 10 }, dismissText: { color: '#2455D6', fontFamily: 'Inter_600SemiBold', fontSize: 12, marginRight: 20 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 10 }, recentCount: { color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 12, marginRight: 20 },
  inspectionCard: { marginHorizontal: 20, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', marginBottom: 12 }, cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  componentIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, cardHeaderCopy: { flex: 1, paddingRight: 7 },
  cardEyebrow: { color: '#8B97A8', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.9, marginBottom: 4 }, cardTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 19 },
  cardBody: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 13 }, evidenceBox: { marginTop: 14, padding: 11, borderRadius: 12, backgroundColor: '#F7F9FC' }, evidenceLabel: { color: '#8B97A8', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8, marginBottom: 5 }, evidenceText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 2 }, pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }, pillText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  urgentPill: { backgroundColor: '#FBE7E7' }, attentionPill: { backgroundColor: '#FFF1D7' }, watchPill: { backgroundColor: '#E6F4EC' }, confidenceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, gap: 8 },
  confidenceLabel: { color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 11 }, confidenceTrack: { flex: 1, height: 6, backgroundColor: '#EEF1F5', borderRadius: 4, overflow: 'hidden' }, confidenceFill: { height: '100%', backgroundColor: '#2455D6', borderRadius: 4 }, confidenceValue: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 11 },
  recommendationBox: { flexDirection: 'row', gap: 8, backgroundColor: '#F3F6FF', padding: 11, borderRadius: 12, marginTop: 14 }, recommendationText: { color: '#3653A2', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, flex: 1 },
  outlineButton: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: '#B6C8F9', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 12 }, outlineButtonText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 12 },
  emptyCard: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE2EB', padding: 20 }, emptyTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 12 }, emptyBody: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
});
