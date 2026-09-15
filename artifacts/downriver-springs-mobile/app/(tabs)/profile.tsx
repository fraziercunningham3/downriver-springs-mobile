import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProfile, updateActiveProfile, isHydrated } = useApp();
  const [name, setName] = useState(activeProfile.name);
  const [handle, setHandle] = useState(activeProfile.handle);
  const [bio, setBio] = useState(activeProfile.bio);
  const [vehicle, setVehicle] = useState(activeProfile.vehicle);
  const [avatarUri, setAvatarUri] = useState(activeProfile.avatarUri);
  const [saved, setSaved] = useState(false);

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  };

  const save = async () => {
    updateActiveProfile({ name: name.trim() || activeProfile.name, handle: handle.trim() || activeProfile.handle, bio: bio.trim(), vehicle: vehicle.trim(), avatarUri });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  if (!isHydrated) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: Platform.OS === 'web' ? 100 : 116 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={styles.screenTitle}>My profile</Text><View style={{ width: 42 }} /></View>
        <View style={styles.profileHero}><Pressable onPress={chooseAvatar} style={({ pressed }) => [styles.avatarEdit, pressed && styles.pressed]}>{avatarUri ? <Image source={{ uri: avatarUri }} style={styles.profileAvatar} /> : <View style={[styles.profileAvatar, { backgroundColor: colors.accent }]}><Text style={styles.profileInitials}>{activeProfile.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View>}<View style={styles.cameraBadge}><Feather name="camera" size={13} color="#FFFFFF" /></View></Pressable><Text style={styles.profileName}>{activeProfile.name}</Text><Text style={styles.profileHandle}>{activeProfile.handle}</Text>{activeProfile.role === 'master' ? <View style={styles.masterBadge}><Feather name="shield" size={12} color="#2455D6" /><Text style={styles.masterBadgeText}>MASTER PROFILE · DOWNRIVER SPRINGS</Text></View> : null}</View>
        <Text style={styles.sectionLabel}>PROFILE DETAILS</Text>
        <View style={styles.formCard}><Text style={styles.fieldLabel}>Name</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.mutedForeground} /><Text style={styles.fieldLabel}>Handle</Text><TextInput value={handle} onChangeText={setHandle} style={styles.input} autoCapitalize="none" placeholderTextColor={colors.mutedForeground} /><Text style={styles.fieldLabel}>About you</Text><TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.multiline]} multiline placeholder="What do you want the community to know?" placeholderTextColor={colors.mutedForeground} /><Text style={styles.fieldLabel}>Vehicle</Text><TextInput value={vehicle} onChangeText={setVehicle} style={styles.input} placeholder="Year, make, and model" placeholderTextColor={colors.mutedForeground} /></View>
        <Pressable testID="save-profile" onPress={save} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}><Feather name={saved ? 'check' : 'save'} size={17} color="#FFFFFF" /><Text style={styles.saveButtonText}>{saved ? 'Profile saved' : 'Save profile'}</Text></Pressable>
        {activeProfile.role === 'master' ? <Pressable testID="open-admin" onPress={() => router.push('/admin')} style={({ pressed }) => [styles.adminButton, pressed && styles.pressed]}><Feather name="settings" size={17} color={colors.primary} /><Text style={styles.adminButtonText}>Open master admin</Text><Feather name="chevron-right" size={17} color={colors.primary} /></Pressable> : null}
        <View style={styles.freeNote}><Feather name="heart" size={15} color="#2455D6" /><Text style={styles.freeNoteText}>Downriver Springs is free for customers. Your profile helps the community turn good service into confidence.</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, topBar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', alignItems: 'center', justifyContent: 'center' }, screenTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 20 }, pressed: { opacity: 0.78 },
  profileHero: { alignItems: 'center', marginBottom: 28 }, avatarEdit: { position: 'relative', marginBottom: 13 }, profileAvatar: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center' }, profileInitials: { color: '#1B3B9E', fontFamily: 'Inter_700Bold', fontSize: 26 }, cameraBadge: { position: 'absolute', right: -2, bottom: 1, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#F6F7F9' }, profileName: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 21 }, profileHandle: { color: '#718096', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 }, masterBadge: { marginTop: 11, backgroundColor: '#EAF0FF', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }, masterBadgeText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 }, sectionLabel: { marginHorizontal: 20, marginBottom: 10, color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 }, formCard: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#DCE2EB', padding: 15 }, fieldLabel: { color: '#526174', fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 9, marginBottom: 6 }, input: { height: 42, borderRadius: 11, backgroundColor: '#F6F7F9', paddingHorizontal: 12, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 13 }, multiline: { height: 74, paddingTop: 11, textAlignVertical: 'top' }, saveButton: { marginHorizontal: 20, marginTop: 14, height: 48, borderRadius: 14, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, saveButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 13 }, adminButton: { marginHorizontal: 20, marginTop: 10, height: 46, borderRadius: 14, backgroundColor: '#DDE6FF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, adminButtonText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1 }, freeNote: { marginHorizontal: 20, marginTop: 24, padding: 13, borderRadius: 13, backgroundColor: '#EAF0FF', flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, freeNoteText: { color: '#3653A2', fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 17, flex: 1 },
});