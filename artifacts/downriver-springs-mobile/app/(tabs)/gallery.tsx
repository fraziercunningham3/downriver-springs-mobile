import React, { useState } from 'react';
import {
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { GalleryUpload, MediaKind, useApp } from '@/context/AppContext';

type GalleryItem = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  source?: ImageSourcePropType;
  uri?: string;
  mediaUri?: string;
  thumbnailUri?: string;
  mediaKind: MediaKind;
  userUploadId?: string;
};

function GalleryVideo({
  uri,
  thumbnailUri,
  height,
  viewer,
}: {
  uri: string;
  thumbnailUri?: string;
  height: number;
  viewer: boolean;
}) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  if (!viewer) {
    return (
      <View style={[styles.cardImage, styles.videoSurface, { height }]}>
        {thumbnailUri ? <Image source={{ uri: thumbnailUri }} resizeMode="cover" style={styles.cardImage} /> : null}
        <View style={styles.videoIcon}><Feather name="play" size={18} color="#FFFFFF" /></View>
        <Text style={styles.videoLabel}>VIDEO</Text>
      </View>
    );
  }

  return <VideoView player={player} nativeControls contentFit="contain" style={[styles.viewerVideo, { height }]} />;
}

const galleryItems: GalleryItem[] = [
  {
    id: 'classic-truck',
    title: 'Built to be seen',
    eyebrow: 'Customer vehicle spotlight',
    description: 'A classic truck with the kind of stance, finish, and detail that makes complete car care worth sharing.',
    source: require('@/assets/gallery/classic-truck.jpeg'),
    mediaKind: 'photo',
  },
  {
    id: 'complete-car-care',
    title: 'Complete car care',
    eyebrow: 'Downriver Spring Service',
    description: 'A clear promise: trusted automotive service, from everyday maintenance to serious repair decisions.',
    source: require('@/assets/gallery/complete-car-care.jpeg'),
    mediaKind: 'photo',
  },
  {
    id: 'spring-mark',
    title: 'The spring mark',
    eyebrow: 'Downriver Springs',
    description: 'The spring is at the center of the brand—and the work that keeps vehicles steady, safe, and ready.',
    source: require('@/assets/gallery/downriver-spring-mark.jpeg'),
    mediaKind: 'photo',
  },
];

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { galleryUploads, addGalleryUpload, removeGalleryUpload, shopUser } = useApp();
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const allItems: GalleryItem[] = [
    ...galleryItems,
    ...galleryUploads.map((upload: GalleryUpload) => ({
      id: upload.id,
      title: upload.title,
      eyebrow: upload.mediaKind === 'video' ? 'Your uploaded video' : 'Your uploaded photo',
        description: upload.remote
          ? 'Saved to your Downriver gallery and available on your signed-in devices.'
          : 'Saved to this device while it waits for a connection.',
      uri: upload.uri,
        mediaUri: upload.mediaUri,
        thumbnailUri: upload.thumbnailUri,
      mediaKind: upload.mediaKind,
        userUploadId: !upload.remote || upload.ownerId === shopUser?.id ? upload.id : undefined,
    })),
  ];

  const chooseMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access is needed', 'Allow photo library access to add photos and videos to your gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.8,
    });
    if (result.canceled) return;
    result.assets.forEach((asset) => {
      addGalleryUpload({ uri: asset.uri, mediaKind: asset.type === 'video' ? 'video' : 'photo' });
    });
  };

  const shareItem = async (item: GalleryItem) => {
    await Share.share({
      message: `${item.title}\n\n${item.description}\n\nDownriver Spring Service · Lincoln Park, MI`,
      title: item.title,
    });
  };

  const removeItem = (item: GalleryItem) => {
    if (!item.userUploadId) return;
    Alert.alert('Remove from gallery?', 'This removes the uploaded media from your Downriver gallery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeGalleryUpload(item.userUploadId!);
            setSelectedItem(null);
          } catch {
            Alert.alert('Could not remove upload', 'Check your connection and try again.');
          }
        },
      },
    ]);
  };

  const renderMedia = (item: GalleryItem, height: number, viewer = false) => {
    if (item.mediaKind === 'video') {
      return <GalleryVideo uri={item.mediaUri ?? item.uri ?? ''} thumbnailUri={item.thumbnailUri ?? item.uri} height={height} viewer={viewer} />;
    }
    return (
      <Image
        source={item.source ?? { uri: item.uri }}
        resizeMode={viewer ? 'contain' : 'cover'}
        style={[viewer ? styles.viewerImage : styles.cardImage, { height }]}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>DOWNRIVER SPRING SERVICE</Text>
          <Text style={styles.title}>The work speaks.</Text>
          <Text style={styles.subtitle}>A look at the vehicles, care, and character behind the Downriver community.</Text>
        </View>
        <Pressable onPress={chooseMedia} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Feather name="plus" size={17} color={colors.light.primaryForeground} />
          <Text style={styles.addButtonText}>Add media</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <View><Text style={styles.statValue}>{allItems.length}</Text><Text style={styles.statLabel}>gallery items</Text></View>
        <View style={styles.statDivider} />
        <View><Text style={styles.statValue}>1972</Text><Text style={styles.statLabel}>established</Text></View>
        <View style={styles.statDivider} />
        <View><Text style={styles.statValue}>MI</Text><Text style={styles.statLabel}>Lincoln Park</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.galleryList} showsVerticalScrollIndicator={false}>
        {allItems.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => setSelectedItem(item)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            {renderMedia(item, index === 0 ? (width - 40) * 0.53 : 210)}
            <View style={styles.cardBody}>
              <Text style={styles.cardEyebrow}>{item.eyebrow}</Text>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.cardActions}>
                  <Pressable onPress={() => shareItem(item)} hitSlop={10} style={styles.iconButton}>
                    <Feather name="share-2" size={16} color={colors.light.primary} />
                  </Pressable>
                  {item.userUploadId ? <Pressable onPress={() => removeItem(item)} hitSlop={10} style={styles.iconButton}><Feather name="trash-2" size={16} color={colors.light.destructive} /></Pressable> : null}
                  <Feather name="arrow-up-right" size={18} color={colors.light.primary} />
                </View>
              </View>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.storageNote}><Feather name="cloud" size={14} color={colors.light.mutedForeground} /><Text style={styles.storageNoteText}>Signed-in uploads sync to your Downriver gallery. Offline additions stay on this device until they can upload.</Text></View>
      </ScrollView>

      <Modal visible={Boolean(selectedItem)} animationType="fade" transparent onRequestClose={() => setSelectedItem(null)}>
        {selectedItem && (
          <View style={styles.modal}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedItem(null)} />
            <View style={[styles.viewer, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
              <View style={styles.viewerToolbar}>
                <Text style={styles.viewerLabel}>DOWNRIVER GALLERY</Text>
                <Pressable onPress={() => setSelectedItem(null)} hitSlop={10} style={styles.closeButton}>
                  <Feather name="x" size={21} color="#FFFFFF" />
                </Pressable>
              </View>
              {renderMedia(selectedItem, Math.min(width * 1.15, 570), true)}
              <View style={styles.viewerCopy}>
                <Text style={styles.viewerEyebrow}>{selectedItem.eyebrow}</Text>
                <Text style={styles.viewerTitle}>{selectedItem.title}</Text>
                <Text style={styles.viewerDescription}>{selectedItem.description}</Text>
                <Pressable onPress={() => shareItem(selectedItem)} style={styles.shareButton}>
                  <Feather name="share-2" size={16} color={colors.light.primaryForeground} />
                  <Text style={styles.shareButtonText}>Share this story</Text>
                </Pressable>
                {selectedItem.userUploadId ? <Pressable onPress={() => removeItem(selectedItem)} style={styles.removeButton}><Feather name="trash-2" size={15} color="#F4A4A4" /><Text style={styles.removeButtonText}>Remove upload</Text></Pressable> : null}
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light.background },
  header: { paddingHorizontal: 20, paddingBottom: 19, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerCopy: { flex: 1, paddingRight: 18 },
  kicker: { color: colors.light.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  title: { color: colors.light.foreground, fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.8, marginTop: 7 },
  subtitle: { color: colors.light.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7 },
  addButton: { minHeight: 36, borderRadius: 11, paddingHorizontal: 11, backgroundColor: colors.light.primary, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }, addButtonText: { color: colors.light.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11 },
  stats: { backgroundColor: colors.light.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.light.border, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statValue: { color: colors.light.foreground, fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center' },
  statLabel: { color: colors.light.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3, textAlign: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: colors.light.border },
  galleryList: { padding: 20, gap: 14, paddingBottom: 112 },
  card: { backgroundColor: colors.light.card, borderRadius: 18, borderWidth: 1, borderColor: colors.light.border, overflow: 'hidden' },
  pressed: { opacity: 0.86 },
  cardImage: { width: '100%', backgroundColor: '#E9EDF5' }, videoSurface: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#17202A' }, videoIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 }, videoLabel: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2, marginTop: 10 }, videoHint: { color: '#AAB5C7', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 },
  cardBody: { padding: 14 },
  cardEyebrow: { color: colors.light.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cardTitle: { color: colors.light.foreground, fontFamily: 'Inter_700Bold', fontSize: 19 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconButton: { padding: 2 },
  cardDescription: { color: colors.light.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  modal: { flex: 1, backgroundColor: '#090D14' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#090D14' },
  viewer: { flex: 1, paddingHorizontal: 16, justifyContent: 'center' },
  viewerToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  viewerLabel: { color: '#AAB5C7', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#202A39', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { alignSelf: 'center', width: '100%' }, viewerVideo: { width: '100%', alignSelf: 'center' },
  viewerCopy: { paddingTop: 18 },
  viewerEyebrow: { color: '#7FA0FF', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase' },
  viewerTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 6 },
  viewerDescription: { color: '#C5CEDC', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 7 },
  shareButton: { marginTop: 16, minHeight: 46, borderRadius: 13, backgroundColor: colors.light.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  shareButtonText: { color: colors.light.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 },
  removeButton: { minHeight: 42, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#69333A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, removeButtonText: { color: '#F4A4A4', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  storageNote: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 }, storageNoteText: { flex: 1, color: colors.light.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15 },
});