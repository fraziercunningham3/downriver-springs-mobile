import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProfile, profiles, importShopCustomer, removeProfile, shopUser, shopToken, signInShopCustomer, signOutShopCustomer, shopAuthLoading, shopError } = useApp();
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [expertReviews, setExpertReviews] = useState<Array<{ id: string; vin: string; vehicle: string; question: string; pricingContext: string; status: string; response?: string | null; media: Array<{ kind: 'photo' | 'video' }>; customer?: { name: string; email: string } }>>([]);
  const [reviewResponses, setReviewResponses] = useState<Record<string, string>>({});
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const isAdmin = activeProfile.role === 'master' || shopUser?.role === 'staff';

  useEffect(() => {
    if (shopUser?.role !== 'staff' || !shopToken) return;
    fetch(`${API_BASE_URL}/shop/staff/expert-reviews`, { headers: { Authorization: `Bearer ${shopToken}` } })
      .then(async (response) => {
        const result = await response.json() as { reviews?: typeof expertReviews; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Could not load the review queue.');
        setExpertReviews(result.reviews ?? []);
      })
      .catch((error) => setQueueMessage(error instanceof Error ? error.message : 'Could not load the review queue.'));
  }, [shopToken, shopUser?.role]);

  if (!isAdmin) return <View style={[styles.locked, { backgroundColor: colors.background }]}><Feather name="lock" size={24} color={colors.primary} /><Text style={styles.lockedTitle}>Master profile only</Text><Text style={styles.lockedBody}>Only the Downriver Springs master profile can manage community profiles.</Text><Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Go back</Text></Pressable></View>;

  if (shopUser?.role === 'staff') {
    return (
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 100 }} style={[styles.screen, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}><Text style={styles.screenTitle}>Travis · expert queue</Text><Pressable onPress={() => signOutShopCustomer()} style={styles.iconButton}><Feather name="log-out" size={18} color={colors.foreground} /></Pressable></View>
        <View style={styles.adminHero}><View style={styles.adminIcon}><Feather name="shield" size={20} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.adminTitle}>Private customer reviews</Text><Text style={styles.adminBody}>Review real VIN evidence, answer with verified observations, and keep uncertainty clear.</Text></View></View>
        {queueMessage ? <Text style={styles.queueMessage}>{queueMessage}</Text> : null}
        {expertReviews.length === 0 ? <View style={styles.emptyQueue}><Feather name="inbox" size={22} color={colors.mutedForeground} /><Text style={styles.emptyQueueTitle}>No expert reviews yet.</Text><Text style={styles.emptyQueueBody}>New Pro requests will appear here.</Text></View> : expertReviews.map((review) => (
          <View key={review.id} style={styles.reviewCard}><View style={styles.reviewHeader}><Text style={styles.reviewVehicle}>{review.vehicle}</Text><Text style={styles.reviewStatus}>{review.status.replace('_', ' ')}</Text></View><Text style={styles.reviewCustomer}>{review.customer?.name ?? 'Customer'} · {review.customer?.email ?? 'email unavailable'}</Text><Text style={styles.reviewVin}>VIN {review.vin}</Text><Text style={styles.reviewQuestion}>{review.question}</Text>{review.pricingContext ? <Text style={styles.reviewPricing}>Pricing context: {review.pricingContext}</Text> : null}<View style={styles.attachmentRow}>{review.media.map((item, index) => <Pressable key={`${review.id}-${index}`} onPress={() => openAttachment(review.id, index)} style={styles.attachmentButton}><Feather name={item.kind === 'video' ? 'video' : 'image'} size={13} color="#2455D6" /><Text style={styles.attachmentText}>{item.kind === 'video' ? 'Video' : 'Photo'} {index + 1}</Text></Pressable>)}</View><TextInput value={reviewResponses[review.id] ?? review.response ?? ''} onChangeText={(value) => setReviewResponses((current) => ({ ...current, [review.id]: value }))} multiline placeholder="Write a verified response for the customer…" placeholderTextColor="#94A0B2" style={styles.responseInput} /><View style={styles.reviewActions}><Pressable onPress={() => updateReview(review.id, 'in_review')} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Mark in review</Text></Pressable><Pressable onPress={() => updateReview(review.id, 'answered')} style={styles.importButton}><Text style={styles.importButtonText}>Send answer</Text></Pressable></View></View>
        ))}
      </ScrollView>
    );
  }

  const addCustomer = () => {
    if (!name.trim() || !vehicle.trim()) {
      Alert.alert('Add a customer', 'Enter the customer name and vehicle before importing.');
      return;
    }
    importShopCustomer({ name, vehicle });
    setName('');
    setVehicle('');
  };

  const updateReview = async (id: string, status: 'in_review' | 'answered') => {
    if (!shopToken) return;
    const response = await fetch(`${API_BASE_URL}/shop/staff/expert-reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shopToken}` },
      body: JSON.stringify({ status, response: reviewResponses[id] }),
    });
    const result = await response.json() as { review?: (typeof expertReviews)[number]; error?: string };
    if (!response.ok || !result.review) {
      setQueueMessage(result.error ?? 'Could not save the expert response.');
      return;
    }
    setExpertReviews((current) => current.map((review) => review.id === id ? result.review! : review));
    setQueueMessage('Expert review saved.');
  };

  const openAttachment = async (reviewId: string, index: number) => {
    if (!shopToken) return;
    const response = await fetch(`${API_BASE_URL}/shop/expert-reviews/${reviewId}/media/${index}`, { headers: { Authorization: `Bearer ${shopToken}` } });
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) {
      setQueueMessage(result.error ?? 'Could not open that attachment.');
      return;
    }
    await Linking.openURL(result.url);
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 100 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={styles.screenTitle}>Master admin</Text><View style={{ width: 42 }} /></View>
        <View style={styles.adminHero}><View style={styles.adminIcon}><Feather name="shield" size={20} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.adminTitle}>Travis Maxon · master profile</Text><Text style={styles.adminBody}>The service voice and community lead for Downriver Spring Service.</Text></View></View>
        <View style={styles.businessCard}><View style={styles.businessHeader}><Feather name="map-pin" size={16} color={colors.primary} /><Text style={styles.businessName}>Downriver Spring Service</Text></View><Text style={styles.businessCopy}>3377 Dix Hwy · Lincoln Park, MI 48146</Text><Text style={styles.businessCopy}>(313) 928-4208 · Mon–Fri, 8:00 AM–6:00 PM</Text><Text style={styles.businessSpecialties}>Suspension · leaf springs · alignments · lift kits · electrical · exhaust · engine & transmission</Text></View>
         <Text style={styles.sectionLabel}>TRAVIS STAFF SIGN-IN</Text>
         <View style={styles.importCard}><Text style={styles.fieldLabel}>Staff email</Text><TextInput value={staffEmail} onChangeText={setStaffEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="Travis staff email" placeholderTextColor={colors.mutedForeground} /><Text style={styles.fieldLabel}>Password</Text><TextInput value={staffPassword} onChangeText={setStaffPassword} secureTextEntry style={styles.input} placeholder="Staff account password" placeholderTextColor={colors.mutedForeground} />{shopError ? <Text style={styles.queueMessage}>{shopError}</Text> : null}<Pressable disabled={shopAuthLoading} onPress={() => signInShopCustomer({ email: staffEmail, password: staffPassword }).catch(() => undefined)} style={styles.importButton}><Text style={styles.importButtonText}>{shopAuthLoading ? 'Signing in…' : 'Open expert queue'}</Text></Pressable></View>
        <Text style={styles.sectionLabel}>IMPORT SHOP CUSTOMER</Text>
        <View style={styles.importCard}><Text style={styles.fieldLabel}>Customer name</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Taylor Reed" placeholderTextColor={colors.mutedForeground} /><Text style={styles.fieldLabel}>Vehicle</Text><TextInput value={vehicle} onChangeText={setVehicle} style={styles.input} placeholder="e.g. 2020 Toyota RAV4" placeholderTextColor={colors.mutedForeground} /><Pressable testID="import-shop-customer" onPress={addCustomer} style={({ pressed }) => [styles.importButton, pressed && styles.pressed]}><Feather name="user-plus" size={17} color="#FFFFFF" /><Text style={styles.importButtonText}>Add customer from shop</Text></Pressable></View>
        <View style={styles.sectionHeader}><Text style={styles.sectionLabel}>MANAGE PROFILES</Text><Text style={styles.profileCount}>{profiles.length} profiles</Text></View>
        {profiles.map((profile) => <View key={profile.id} style={styles.profileRow}><View style={[styles.profileDot, { backgroundColor: profile.role === 'master' ? '#2455D6' : '#DDE6FF' }]}><Feather name={profile.role === 'master' ? 'shield' : 'user'} size={15} color={profile.role === 'master' ? '#FFFFFF' : '#2455D6'} /></View><View style={styles.profileCopy}><Text style={styles.profileName}>{profile.name}</Text><Text style={styles.profileMeta}>{profile.handle} · {profile.vehicle}</Text></View>{profile.role === 'master' ? <Text style={styles.masterLabel}>MASTER</Text> : <Pressable testID={`delete-profile-${profile.id}`} onPress={() => Alert.alert('Remove profile?', `${profile.name} will be removed from the local community list.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeProfile(profile.id) }])} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Feather name="trash-2" size={16} color="#C73E3E" /></Pressable>}</View>)}
        <View style={styles.adminNote}><Feather name="info" size={15} color="#2455D6" /><Text style={styles.adminNoteText}>The master profile cannot be deleted. In the production version, this role should be protected by account authentication and server-side permissions.</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, locked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, lockedTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 14 }, lockedBody: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 }, backButton: { marginTop: 18, paddingHorizontal: 18, height: 40, borderRadius: 11, backgroundColor: '#2455D6', justifyContent: 'center' }, backButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  topBar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', alignItems: 'center', justifyContent: 'center' }, screenTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 20 }, pressed: { opacity: 0.78 },
  adminHero: { marginHorizontal: 20, padding: 17, borderRadius: 18, backgroundColor: '#17202A', flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }, adminIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' }, adminTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 }, adminBody: { color: '#B8C2D3', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  businessCard: { marginHorizontal: 20, padding: 14, backgroundColor: '#EAF0FF', borderRadius: 15, marginBottom: 26 }, businessHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 }, businessName: { color: '#1B3B9E', fontFamily: 'Inter_700Bold', fontSize: 13 }, businessCopy: { color: '#3653A2', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 }, businessSpecialties: { color: '#3653A2', fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 8 },
  sectionLabel: { marginLeft: 20, color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 }, importCard: { marginHorizontal: 20, marginTop: 10, padding: 15, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB' }, fieldLabel: { color: '#526174', fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3, marginBottom: 6 }, input: { height: 42, borderRadius: 11, backgroundColor: '#F6F7F9', paddingHorizontal: 12, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 10 }, importButton: { height: 44, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 2 }, importButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  sectionHeader: { marginTop: 28, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, profileCount: { marginRight: 20, color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 11 }, profileRow: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, profileDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, profileCopy: { flex: 1 }, profileName: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 13 }, profileMeta: { color: '#8B97A8', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }, masterLabel: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.7 }, deleteButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }, adminNote: { marginHorizontal: 20, marginTop: 18, padding: 12, borderRadius: 13, backgroundColor: '#EAF0FF', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, adminNoteText: { color: '#3653A2', fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, flex: 1 },
  queueMessage: { marginHorizontal: 20, marginBottom: 12, color: '#2455D6', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  emptyQueue: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 17, padding: 22, borderWidth: 1, borderColor: '#DCE2EB' }, emptyQueueTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 12 }, emptyQueueBody: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  reviewCard: { marginHorizontal: 20, marginBottom: 12, padding: 15, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#DCE2EB' }, reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, reviewVehicle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 14, flex: 1 }, reviewStatus: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase' }, reviewCustomer: { color: '#526174', fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 7 }, reviewVin: { color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 4 }, reviewQuestion: { color: '#233043', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18, marginTop: 13 }, reviewPricing: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 8 }, responseInput: { minHeight: 88, backgroundColor: '#F6F7F9', borderRadius: 11, padding: 11, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 12, textAlignVertical: 'top', marginTop: 13 }, reviewActions: { flexDirection: 'row', gap: 8, marginTop: 10 }, secondaryAction: { flex: 1, height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#B6C8F9', alignItems: 'center', justifyContent: 'center' }, secondaryActionText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 11 },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }, attachmentButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 9, height: 30, backgroundColor: '#EAF0FF' }, attachmentText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 10 },
});