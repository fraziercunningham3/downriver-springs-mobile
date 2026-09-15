import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, CommunityPost } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name, uri, small = false }: { name: string; uri?: string; small?: boolean }) {
  const colors = useColors();
  return uri ? <Image source={{ uri }} style={[styles.avatar, small && styles.avatarSmall]} /> : <View style={[styles.avatar, small && styles.avatarSmall, { backgroundColor: colors.accent }]}><Text style={[styles.avatarText, small && styles.avatarTextSmall]}>{initials(name)}</Text></View>;
}

function PostCard({ post, onShare }: { post: CommunityPost; onShare: (post: CommunityPost) => void }) {
  const colors = useColors();
  const { profiles, activeProfile, togglePostLike } = useApp();
  const author = profiles.find((profile) => profile.id === post.authorId) ?? activeProfile;
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}><Avatar name={author.name} uri={author.avatarUri} small /><View style={styles.postAuthor}><Text style={styles.postAuthorName}>{author.name}</Text><Text style={styles.postHandle}>{author.handle} · community member</Text></View>{post.reviewRating ? <View style={styles.reviewBadge}><Feather name="star" size={12} color="#946516" /><Text style={styles.reviewBadgeText}>{post.reviewRating}.0</Text></View> : null}</View>
      <Text style={styles.postText}>{post.text}</Text>
      {post.mediaUri ? <Image source={{ uri: post.mediaUri }} style={styles.postMedia} /> : null}
      <View style={styles.postActions}>
        <Pressable testID={`like-post-${post.id}`} onPress={() => { togglePostLike(post.id); Haptics.selectionAsync(); }} style={({ pressed }) => [styles.postAction, pressed && styles.pressed]}><Feather name="heart" size={16} color={colors.mutedForeground} /><Text style={styles.postActionText}>{post.likes}</Text></Pressable>
        <Pressable onPress={() => onShare(post)} style={({ pressed }) => [styles.postAction, pressed && styles.pressed]}><Feather name="share-2" size={16} color={colors.primary} /><Text style={[styles.postActionText, { color: colors.primary }]}>Share</Text></Pressable>
      </View>
    </View>
  );
}

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { posts, profiles, chatMessages, activeProfile, createPost, addChatMessage, isHydrated } = useApp();
  const [mode, setMode] = useState<'feed' | 'chat'>('feed');
  const [postText, setPostText] = useState('');
  const [chatText, setChatText] = useState('');
  const [media, setMedia] = useState<{ uri: string; kind: 'photo' | 'video' } | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const chooseMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setMedia({ uri: result.assets[0].uri, kind: result.assets[0].type === 'video' ? 'video' : 'photo' });
  };

  const publish = async () => {
    if (!postText.trim() && !media) return;
    setIsPosting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPost({ text: postText, mediaUri: media?.uri, mediaKind: media?.kind, reviewRating: postText.toLowerCase().includes('service') ? 5 : undefined });
    setPostText('');
    setMedia(null);
    setIsPosting(false);
  };

  const sendChat = () => {
    addChatMessage(chatText);
    setChatText('');
  };

  const sharePost = async (post: CommunityPost) => {
    const author = profiles.find((profile) => profile.id === post.authorId) ?? activeProfile;
    await Share.share({ message: `${author.name} on Downriver Springs Community:\n\n${post.text}\n\nShared from Downriver Springs`, title: 'Share community post' });
  };

  if (!isHydrated) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 118 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><View><Text style={styles.brandKicker}>DOWNRIVER COMMUNITY</Text><Text style={styles.screenTitle}>Ask. Learn. Share.</Text></View><Pressable testID="open-profile" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}><Avatar name={activeProfile.name} uri={activeProfile.avatarUri} /></Pressable></View>
        <View style={styles.introCard}><View style={styles.introIcon}><Feather name="users" size={18} color={colors.primaryForeground} /></View><View style={{ flex: 1 }}><Text style={styles.introTitle}>Confidence is better together.</Text><Text style={styles.introBody}>Share questions, honest reviews, and the moments that helped you buy with clarity.</Text></View></View>
        <View style={styles.modeSwitch}><Pressable onPress={() => setMode('feed')} style={[styles.modeButton, mode === 'feed' && styles.modeButtonActive]}><Text style={[styles.modeText, mode === 'feed' && styles.modeTextActive]}>Community feed</Text></Pressable><Pressable onPress={() => setMode('chat')} style={[styles.modeButton, mode === 'chat' && styles.modeButtonActive]}><Text style={[styles.modeText, mode === 'chat' && styles.modeTextActive]}>Live chat</Text></Pressable></View>
        {mode === 'feed' ? <View>
          <View style={styles.composerCard}><View style={styles.composerHeader}><Avatar name={activeProfile.name} uri={activeProfile.avatarUri} small /><TextInput testID="community-post-input" value={postText} onChangeText={setPostText} placeholder="What did you learn about your car?" placeholderTextColor={colors.mutedForeground} style={styles.composerInput} multiline /></View>{media ? <View style={styles.mediaPreview}><Image source={{ uri: media.uri }} style={styles.mediaPreviewImage} /><Pressable onPress={() => setMedia(null)} style={styles.removeMedia}><Feather name="x" size={14} color="#FFFFFF" /></Pressable></View> : null}<View style={styles.composerFooter}><Pressable testID="community-add-media" onPress={chooseMedia} style={({ pressed }) => [styles.mediaButton, pressed && styles.pressed]}><Feather name="image" size={16} color={colors.primary} /><Text style={styles.mediaButtonText}>Photo / video</Text></Pressable><Pressable testID="community-post-submit" onPress={publish} disabled={isPosting} style={({ pressed }) => [styles.postButton, pressed && styles.pressed, isPosting && styles.disabled]}>{isPosting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.postButtonText}>Post</Text>}</Pressable></View></View>
          <Text style={styles.sectionLabel}>COMMUNITY REVIEWS & DISCUSSIONS</Text>
          {posts.map((post) => <PostCard key={post.id} post={post} onShare={sharePost} />)}
        </View> : <View>
          <Text style={styles.sectionLabel}>COMMUNITY CHAT</Text>
          <View style={styles.chatCard}>{chatMessages.map((message) => { const author = profiles.find((profile) => profile.id === message.authorId) ?? activeProfile; return <View key={message.id} style={styles.messageRow}><Avatar name={author.name} uri={author.avatarUri} small /><View style={styles.messageBubble}><View style={styles.messageMeta}><Text style={styles.messageAuthor}>{author.name}</Text>{author.role === 'master' ? <Text style={styles.masterTag}>MASTER PROFILE</Text> : null}</View><Text style={styles.messageText}>{message.text}</Text></View></View>; })}<View style={styles.chatComposer}><TextInput testID="community-chat-input" value={chatText} onChangeText={setChatText} placeholder="Write a message…" placeholderTextColor={colors.mutedForeground} style={styles.chatInput} onSubmitEditing={sendChat} returnKeyType="send" /><Pressable testID="community-chat-send" onPress={sendChat} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}><Feather name="arrow-up" size={17} color={colors.primaryForeground} /></Pressable></View></View>
        </View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }, brandKicker: { fontFamily: 'Inter_700Bold', color: '#2455D6', fontSize: 10, letterSpacing: 1.3, marginBottom: 5 }, screenTitle: { fontFamily: 'Inter_700Bold', color: '#17202A', fontSize: 28, letterSpacing: -0.8 },
  avatarButton: { padding: 1 }, avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, avatarSmall: { width: 32, height: 32, borderRadius: 16 }, avatarText: { color: '#1B3B9E', fontFamily: 'Inter_700Bold', fontSize: 13 }, avatarTextSmall: { fontSize: 10 }, introCard: { marginHorizontal: 20, borderRadius: 18, padding: 16, backgroundColor: '#17202A', flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 18 }, introIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' }, introTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 }, introBody: { color: '#B8C2D3', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 3 },
  modeSwitch: { marginHorizontal: 20, padding: 4, backgroundColor: '#E9EDF5', borderRadius: 13, flexDirection: 'row', marginBottom: 18 }, modeButton: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, modeButtonActive: { backgroundColor: '#FFFFFF' }, modeText: { color: '#718096', fontFamily: 'Inter_600SemiBold', fontSize: 11 }, modeTextActive: { color: '#17202A' },
  composerCard: { marginHorizontal: 20, padding: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 17, marginBottom: 24 }, composerHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, composerInput: { flex: 1, minHeight: 38, maxHeight: 84, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 13, paddingTop: 7 }, composerFooter: { borderTopWidth: 1, borderTopColor: '#EEF1F5', marginTop: 11, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, mediaButton: { flexDirection: 'row', gap: 7, alignItems: 'center' }, mediaButtonText: { color: '#2455D6', fontFamily: 'Inter_600SemiBold', fontSize: 11 }, postButton: { height: 34, minWidth: 68, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' }, postButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 }, disabled: { opacity: 0.55 }, mediaPreview: { height: 92, marginTop: 10, borderRadius: 12, overflow: 'hidden' }, mediaPreviewImage: { width: '100%', height: '100%' }, removeMedia: { position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: '#17202A', alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { marginHorizontal: 20, color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2, marginBottom: 10 }, postCard: { marginHorizontal: 20, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#DCE2EB', marginBottom: 12 }, postHeader: { flexDirection: 'row', alignItems: 'center' }, postAuthor: { flex: 1, marginLeft: 9 }, postAuthorName: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 13 }, postHandle: { color: '#8B97A8', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 }, reviewBadge: { backgroundColor: '#FFF1D7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }, reviewBadgeText: { color: '#946516', fontFamily: 'Inter_700Bold', fontSize: 10 }, postText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 14 }, postMedia: { width: '100%', height: 170, borderRadius: 12, marginTop: 12 }, postActions: { borderTopWidth: 1, borderTopColor: '#EEF1F5', marginTop: 14, paddingTop: 11, flexDirection: 'row', gap: 18 }, postAction: { flexDirection: 'row', alignItems: 'center', gap: 6 }, postActionText: { color: '#718096', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  chatCard: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 17, padding: 14 }, messageRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 15 }, messageBubble: { flex: 1, backgroundColor: '#F6F7F9', borderRadius: 13, borderTopLeftRadius: 4, padding: 10 }, messageMeta: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 4 }, messageAuthor: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 11 }, masterTag: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.6 }, messageText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 }, chatComposer: { borderTopWidth: 1, borderTopColor: '#EEF1F5', paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }, chatInput: { flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F6F7F9', color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 12 }, sendButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: 0.78 },
});