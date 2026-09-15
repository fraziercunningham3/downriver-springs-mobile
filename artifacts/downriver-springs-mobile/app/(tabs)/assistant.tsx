import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnswerVehicleQuestion } from '@workspace/api-client-react';
import type { VehicleChatResponse } from '@workspace/api-client-react';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Role = 'user' | 'assistant';
type ChatItem = {
  id: string;
  role: Role;
  content: string;
  response?: VehicleChatResponse;
};

const welcomeMessage: ChatItem = {
  id: 'welcome',
  role: 'assistant',
  content: 'Ask about maintenance intervals, symptoms, repair urgency, or what data to collect before visiting a shop. I will separate your facts from general reference ranges and say when a technician needs to verify something.',
};

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mutateAsync, isPending } = useAnswerVehicleQuestion();
  const { inspections } = useApp();
  const [messages, setMessages] = useState<ChatItem[]>([welcomeMessage]);
  const [question, setQuestion] = useState('');
  const [showFacts, setShowFacts] = useState(false);
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [mileage, setMileage] = useState('');
  const [engine, setEngine] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [maintenanceHistory, setMaintenanceHistory] = useState('');
  const [error, setError] = useState<string | null>(null);

  const vehicle = useMemo(() => ({
    year: year.trim() || undefined,
    make: make.trim() || undefined,
    model: model.trim() || undefined,
    mileage: mileage.trim() || undefined,
    engine: engine.trim() || undefined,
    symptoms: symptoms.trim() || undefined,
    maintenanceHistory: maintenanceHistory.trim() || undefined,
    inspectionContext: inspections.filter((inspection) => inspection.status === 'analyzed').slice(0, 5).map((inspection) => `${inspection.vehicle} · ${inspection.component}: ${inspection.summary}`).join('\n') || undefined,
  }), [year, make, model, mileage, engine, symptoms, maintenanceHistory, inspections]);

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;
    setError(null);
    setQuestion('');
    const userMessage: ChatItem = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const history = [...messages, userMessage];
    setMessages(history);
    try {
      const response = await mutateAsync({
        data: {
          question: trimmed,
          vehicle,
          messages: history.filter((message) => message.id !== 'welcome').slice(-10).map((message) => ({ role: message.role, content: message.content })),
        },
      });
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: 'assistant', content: response.answer, response }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The vehicle assistant is unavailable right now.');
    }
  };

  const renderMessage = ({ item }: { item: ChatItem }) => {
    const isAssistant = item.role === 'assistant';
    return (
      <View style={[styles.messageRow, !isAssistant && styles.userMessageRow]}>
        {isAssistant ? <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}><Feather name="activity" size={15} color={colors.primaryForeground} /></View> : null}
        <View style={[styles.bubble, isAssistant ? styles.assistantBubble : { backgroundColor: colors.primary }]}>
          <Text style={[styles.messageText, !isAssistant && { color: colors.primaryForeground }]}>{item.content}</Text>
          {item.response ? (
            <View style={styles.responseDetails}>
              <View style={[styles.safetyTag, item.response.safetyLevel === 'urgent' ? styles.urgentTag : item.response.safetyLevel === 'attention' ? styles.attentionTag : styles.routineTag]}>
                <Text style={styles.safetyTagText}>{item.response.safetyLevel.toUpperCase()}</Text>
              </View>
              {item.response.dataPoints.length ? <View style={styles.detailSection}><Text style={styles.detailLabel}>DATA POINTS</Text>{item.response.dataPoints.map((point) => <Text key={point} style={styles.detailText}>• {point}</Text>)}</View> : null}
              {item.response.nextSteps.length ? <View style={styles.detailSection}><Text style={styles.detailLabel}>NEXT STEPS</Text>{item.response.nextSteps.map((step) => <Text key={step} style={styles.detailText}>• {step}</Text>)}</View> : null}
              {item.response.followUpQuestions.length ? <View style={styles.detailSection}><Text style={styles.detailLabel}>TO MAKE THIS MORE SPECIFIC</Text>{item.response.followUpQuestions.map((followUp) => <Text key={followUp} style={styles.detailText}>• {followUp}</Text>)}</View> : null}
              <Text style={styles.dataBasis}>{item.response.dataBasis}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: colors.primary }]}>DOWNRIVER SPRINGS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Ask DS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Maintenance and diagnostic guidance grounded in your data.</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.accent }]}><Feather name="message-circle" size={20} color={colors.primary} /></View>
      </View>

      <Pressable onPress={() => setShowFacts((current) => !current)} style={[styles.factsToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.factsToggleCopy}><Feather name="truck" size={16} color={colors.primary} /><Text style={[styles.factsToggleTitle, { color: colors.foreground }]}>Vehicle facts</Text><Text style={[styles.factsToggleHint, { color: colors.mutedForeground }]}>{year || make || model || mileage || inspections.length ? 'Context added' : 'Add context for better answers'}</Text></View>
        <Feather name={showFacts ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>

      {showFacts ? (
        <View style={[styles.factsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.factRow}><TextInput value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor={colors.mutedForeground} style={[styles.factInput, { color: colors.foreground, borderColor: colors.input }]} /><TextInput value={make} onChangeText={setMake} placeholder="Make" placeholderTextColor={colors.mutedForeground} style={[styles.factInput, { color: colors.foreground, borderColor: colors.input }]} /><TextInput value={model} onChangeText={setModel} placeholder="Model" placeholderTextColor={colors.mutedForeground} style={[styles.factInput, { color: colors.foreground, borderColor: colors.input }]} /></View>
          <View style={styles.factRow}><TextInput value={mileage} onChangeText={setMileage} placeholder="Mileage" placeholderTextColor={colors.mutedForeground} style={[styles.factInput, { color: colors.foreground, borderColor: colors.input, flex: 1 }]} /><TextInput value={engine} onChangeText={setEngine} placeholder="Engine / trim" placeholderTextColor={colors.mutedForeground} style={[styles.factInput, { color: colors.foreground, borderColor: colors.input, flex: 2 }]} /></View>
          <TextInput value={symptoms} onChangeText={setSymptoms} placeholder="Current symptoms or warning lights" placeholderTextColor={colors.mutedForeground} multiline style={[styles.factTextArea, { color: colors.foreground, borderColor: colors.input }]} />
          <TextInput value={maintenanceHistory} onChangeText={setMaintenanceHistory} placeholder="Recent maintenance or repairs" placeholderTextColor={colors.mutedForeground} multiline style={[styles.factTextArea, { color: colors.foreground, borderColor: colors.input }]} />
        </View>
      ) : null}

      <FlatList data={messages} keyExtractor={(item) => item.id} renderItem={renderMessage} contentContainerStyle={styles.messageList} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" ListFooterComponent={isPending ? <View style={styles.typing}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.typingText, { color: colors.mutedForeground }]}>Checking the facts…</Text></View> : null} />

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput value={question} onChangeText={setQuestion} placeholder="Ask about your vehicle…" placeholderTextColor={colors.mutedForeground} multiline maxLength={1600} style={[styles.questionInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} onSubmitEditing={sendQuestion} returnKeyType="send" />
        <Pressable testID="vehicle-assistant-send" onPress={sendQuestion} disabled={!question.trim() || isPending} style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primary }, (!question.trim() || isPending || pressed) && styles.sendButtonDisabled]}>
          {isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="arrow-up" size={18} color={colors.primaryForeground} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerCopy: { flex: 1, paddingRight: 12 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8, marginTop: 5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, marginTop: 5 },
  headerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  factsToggle: { marginHorizontal: 20, borderWidth: 1, borderRadius: 14, minHeight: 49, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  factsToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  factsToggleTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  factsToggleHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginLeft: 2 },
  factsCard: { marginHorizontal: 20, marginTop: 8, borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  factRow: { flexDirection: 'row', gap: 7 },
  factInput: { flex: 1, height: 39, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, fontFamily: 'Inter_400Regular', fontSize: 11 },
  factTextArea: { minHeight: 55, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingTop: 9, fontFamily: 'Inter_400Regular', fontSize: 11, textAlignVertical: 'top' },
  messageList: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 12, gap: 11 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  userMessageRow: { justifyContent: 'flex-end' },
  botAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bubble: { maxWidth: '86%', borderRadius: 16, padding: 12 },
  assistantBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', borderTopLeftRadius: 4 },
  messageText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  responseDetails: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  safetyTag: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  routineTag: { backgroundColor: '#E6F4EC' },
  attentionTag: { backgroundColor: '#FFF1D7' },
  urgentTag: { backgroundColor: '#FBE7E7' },
  safetyTagText: { color: '#526174', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.7 },
  detailSection: { marginTop: 10 },
  detailLabel: { color: '#8B97A8', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8, marginBottom: 4 },
  detailText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 2 },
  dataBasis: { color: '#8B97A8', fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 11 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
  typingText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 11, marginHorizontal: 20, marginBottom: 6 },
  composer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 9, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  questionInput: { flex: 1, minHeight: 43, maxHeight: 100, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 10, fontFamily: 'Inter_400Regular', fontSize: 13 },
  sendButton: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.45 },
});