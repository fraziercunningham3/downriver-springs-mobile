import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { identifyRevenueCatUser, resetRevenueCatUser } from '@/lib/revenuecat';
import { Platform } from 'react-native';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createGalleryUpload,
  deleteGalleryUpload,
  listGalleryUploads,
  requestGalleryUploadUrl,
  type GalleryUpload as ApiGalleryUpload,
} from '@workspace/api-client-react';

export type MediaKind = 'photo' | 'video';
export type InspectionComponent = 'Engine' | 'Mounts' | 'Leaks' | 'Wiring' | 'Exhaust';
export type FindingSeverity = 'watch' | 'attention' | 'urgent';

export type Finding = {
  title: string;
  severity: FindingSeverity;
  confidence: number;
  detail: string;
  evidence: string[];
  recommendation: string;
};

export type Inspection = {
  id: string;
  createdAt: string;
  component: InspectionComponent;
  mediaKind: MediaKind;
  mediaUri?: string;
  vehicle: string;
  reportedBy?: string;
  observation?: string;
  status?: 'media_saved' | 'analyzed';
  findings: Finding[];
  summary: string;
};

export type WorkOrderStatus = 'In progress' | 'Awaiting approval' | 'Ready for pickup';

export type WorkOrder = {
  id: string;
  vehicle: string;
  plate: string;
  status: WorkOrderStatus;
  updatedAt: string;
  service: string;
  progress: number;
  eta: string;
  technician: string;
  note: string;
  estimate: string;
  approved: boolean;
};

export type ShopUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'staff';
};

export type ShopVehicle = {
  id: string;
  label: string;
  plate: string;
};

export type ShopSyncState = 'idle' | 'syncing' | 'offline' | 'error';

export type Profile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarUri?: string;
  vehicle: string;
  role: 'master' | 'member';
  shopCustomer: boolean;
  joinedAt: string;
};

export type CommunityPost = {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  mediaUri?: string;
  mediaKind?: MediaKind;
  likes: number;
  reviewRating?: number;
};

export type GalleryUpload = {
  id: string;
  uri: string;
  mediaUri?: string;
  thumbnailUri?: string;
  mediaKind: MediaKind;
  title: string;
  createdAt: string;
  ownerId?: string;
  remote?: boolean;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
};

type AppContextValue = {
  inspections: Inspection[];
  workOrders: WorkOrder[];
  profiles: Profile[];
  posts: CommunityPost[];
  galleryUploads: GalleryUpload[];
  chatMessages: ChatMessage[];
  activeProfile: Profile;
  isHydrated: boolean;
  isAnalyzing: boolean;
  analysisStage: 'preparing' | 'analyzing' | null;
  cancelInspection: () => void;
  shopUser: ShopUser | null;
  shopToken: string | null;
  shopVehicles: ShopVehicle[];
  shopSyncState: ShopSyncState;
  shopError: string | null;
  lastShopSyncAt: string | null;
  shopAuthLoading: boolean;
  addInspection: (input: {
    component: InspectionComponent;
    mediaKind: MediaKind;
    mediaUri?: string;
    durationMs?: number;
    vehicle?: string;
    observation?: string;
  }) => Promise<Inspection>;
  approveWorkOrder: (id: string) => Promise<void>;
  refreshWorkOrders: () => Promise<void>;
  signInShopCustomer: (input: { email: string; password: string }) => Promise<void>;
  registerShopCustomer: (input: { name: string; email: string; phone: string; password: string; vehicle?: string; plate?: string }) => Promise<void>;
  completeShopProfile: (input: { name: string; email: string; phone: string }) => Promise<void>;
  signOutShopCustomer: () => Promise<void>;
  updateActiveProfile: (updates: Partial<Pick<Profile, 'name' | 'handle' | 'bio' | 'vehicle' | 'avatarUri'>>) => void;
  createPost: (input: { text: string; mediaUri?: string; mediaKind?: MediaKind; reviewRating?: number }) => void;
  addGalleryUpload: (input: { uri: string; mediaKind: MediaKind }) => Promise<void>;
  removeGalleryUpload: (id: string) => Promise<void>;
  addChatMessage: (text: string) => void;
  togglePostLike: (id: string) => void;
  removeProfile: (id: string) => void;
  importShopCustomer: (input: { name: string; vehicle: string }) => void;
};

const STORAGE_KEY = 'downriver-springs-app-state';
const SHOP_AUTH_KEY = 'downriver-springs-shop-auth';
const SHOP_CACHE_PREFIX = 'downriver-springs-shop-cache:';

const DEVICE_ID_KEY = 'downriver-springs-analysis-device-id';
const seededInspections: Inspection[] = [];

function createDeviceId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

const seededProfiles: Profile[] = [
  {
    id: 'profile-admin',
    name: 'Travis Maxon',
    handle: '@travismaxon',
    bio: 'The service voice behind Downriver Spring Service — helping customers make confident repair and vehicle-buying decisions.',
    vehicle: 'Downriver Spring Service · Lincoln Park, MI',
    role: 'master',
    shopCustomer: false,
    joinedAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'profile-member-1',
    name: 'Jordan Miller',
    handle: '@jordanm',
    bio: 'Learning the sounds my car makes before they become surprises.',
    vehicle: '2017 Honda CR-V',
    role: 'member',
    shopCustomer: true,
    joinedAt: '2026-08-22T12:00:00.000Z',
  },
];

const seededPosts: CommunityPost[] = [
  {
    id: 'post-1',
    authorId: 'profile-admin',
    createdAt: '2026-09-13T15:10:00.000Z',
    text: 'Buying a used car? Bring the questions, not just the keys. Share what you are looking at and the community can help you make a confident next step.',
    likes: 12,
    reviewRating: 5,
  },
  {
    id: 'post-2',
    authorId: 'profile-member-1',
    createdAt: '2026-09-12T18:20:00.000Z',
    text: 'The inspection scan caught a possible oil seep before I bought the CR-V. Downriver Springs confirmed what to ask the seller and mechanic.',
    likes: 8,
    reviewRating: 5,
  },
];

const seededChatMessages: ChatMessage[] = [
  { id: 'chat-1', authorId: 'profile-admin', createdAt: '2026-09-13T16:15:00.000Z', text: 'Welcome to the Downriver community. Share questions, inspection wins, and honest service reviews.' },
  { id: 'chat-2', authorId: 'profile-member-1', createdAt: '2026-09-13T16:22:00.000Z', text: 'Has anyone had a mount inspection done before buying a higher-mileage SUV?' },
  { id: 'chat-3', authorId: 'profile-admin', createdAt: '2026-09-13T16:27:00.000Z', text: 'Yes — scan the mounts, then ask for a cold-start and loaded test drive. The combination tells a much clearer story.' },
];

const AppContext = createContext<AppContextValue | null>(null);

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [inspections, setInspections] = useState<Inspection[]>(seededInspections);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>(seededProfiles);
  const [posts, setPosts] = useState<CommunityPost[]>(seededPosts);
  const [galleryUploads, setGalleryUploads] = useState<GalleryUpload[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(seededChatMessages);
  const [activeProfileId, setActiveProfileId] = useState('profile-admin');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'preparing' | 'analyzing' | null>(null);
  const inspectionAbortControllerRef = useRef<AbortController | null>(null);
  const [shopToken, setShopToken] = useState<string | null>(null);
  const [shopUser, setShopUser] = useState<ShopUser | null>(null);
  const [shopVehicles, setShopVehicles] = useState<ShopVehicle[]>([]);
  const [shopSyncState, setShopSyncState] = useState<ShopSyncState>('idle');
  const [shopError, setShopError] = useState<string | null>(null);
  const [lastShopSyncAt, setLastShopSyncAt] = useState<string | null>(null);
  const [shopAuthLoading, setShopAuthLoading] = useState(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(SHOP_AUTH_KEY)])
      .then(async ([raw, authRaw]) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<{
            inspections: Inspection[];
            workOrders: WorkOrder[];
            profiles: Profile[];
            posts: CommunityPost[];
            galleryUploads: GalleryUpload[];
            chatMessages: ChatMessage[];
            activeProfileId: string;
          }>;
          const storedInspections = parsed.inspections?.map((inspection) => ({
            ...inspection,
            reportedBy: inspection.reportedBy ?? 'Downriver Springs',
            observation: inspection.observation ?? inspection.summary,
            status: inspection.status ?? 'analyzed',
            findings: inspection.findings.map((finding) => ({
              ...finding,
              evidence: finding.evidence?.length ? finding.evidence : [finding.detail],
            })),
          }));
          setInspections(storedInspections?.filter((inspection) => inspection.id !== 'inspection-1') ?? seededInspections);
          setProfiles(parsed.profiles?.length
            ? parsed.profiles.map((profile) =>
                profile.id === 'profile-admin' && profile.name === 'Downriver Springs'
                  ? { ...profile, ...seededProfiles[0] }
                  : profile,
              )
            : seededProfiles);
          setPosts(parsed.posts?.length ? parsed.posts : seededPosts);
          setGalleryUploads(parsed.galleryUploads ?? []);
          setChatMessages(parsed.chatMessages?.length ? parsed.chatMessages : seededChatMessages);
          if (parsed.activeProfileId) setActiveProfileId(parsed.activeProfileId);
        }
        if (authRaw) {
          const auth = JSON.parse(authRaw) as {
            token?: string;
            user?: ShopUser;
            vehicles?: ShopVehicle[];
          };
          if (auth.token && auth.user?.id && (auth.user.role === 'customer' || auth.user.role === 'staff')) {
            setShopToken(auth.token);
            setShopUser(auth.user);
            identifyRevenueCatUser(auth.user.id).catch(() => undefined);
            setShopVehicles(auth.vehicles ?? []);
            const cached = await AsyncStorage.getItem(`${SHOP_CACHE_PREFIX}${auth.user.id}`);
            if (cached) {
              const parsedCache = JSON.parse(cached) as {
                vehicles?: ShopVehicle[];
                workOrders?: WorkOrder[];
                syncedAt?: string;
              };
              setShopVehicles(parsedCache.vehicles ?? auth.vehicles ?? []);
              setWorkOrders(parsedCache.workOrders ?? []);
              setLastShopSyncAt(parsedCache.syncedAt ?? null);
            }
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setIsHydrated(true));
  }, []);

  useEffect(() => {
    if (!isHydrated || !shopToken || !shopUser) return;
    let active = true;
    setShopSyncState('syncing');
    fetchShopDashboard(shopToken)
      .then(async (dashboard) => {
        if (!active) return;
        const syncedAt = new Date().toISOString();
        setShopVehicles(dashboard.vehicles);
        setWorkOrders(dashboard.workOrders);
        setLastShopSyncAt(syncedAt);
        setShopSyncState('idle');
        setShopError(null);
        await saveShopCache(shopUser.id, dashboard.vehicles, dashboard.workOrders, syncedAt);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ShopRequestError && error.status === 401) {
          setShopError('Your shop session expired. Sign in again to see current updates.');
          setShopToken(null);
          setShopUser(null);
          setShopVehicles([]);
          setWorkOrders([]);
          AsyncStorage.removeItem(SHOP_AUTH_KEY).catch(() => undefined);
        } else {
          setShopSyncState('offline');
          setShopError('We could not reach the service desk. Showing your last saved updates.');
        }
      });
    return () => {
      active = false;
    };
  }, [isHydrated, shopToken, shopUser]);

  useEffect(() => {
    if (!isHydrated || !shopToken || !shopUser) return;
    let active = true;
    syncRemoteGallery(shopToken)
      .then(async (uploads) => {
        const hydratedUploads = await Promise.all(
          uploads.map((upload) => hydrateRemoteGalleryUpload(upload, shopToken)),
        );
        if (!active) return;
        setGalleryUploads((current) => {
          const localOnly = current.filter((item) => !item.remote);
          return [...hydratedUploads, ...localOnly];
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isHydrated, shopToken, shopUser]);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ inspections, profiles, posts, galleryUploads, chatMessages, activeProfileId })).catch(() => undefined);
  }, [inspections, profiles, posts, galleryUploads, chatMessages, activeProfileId, isHydrated]);

  const value = useMemo<AppContextValue>(
    () => ({
      inspections,
      workOrders,
      profiles,
      posts,
      galleryUploads,
      chatMessages,
      activeProfile: profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? seededProfiles[0],
      isHydrated,
      isAnalyzing,
      analysisStage,
      cancelInspection: () => inspectionAbortControllerRef.current?.abort(),
      shopUser,
      shopToken,
      shopVehicles,
      shopSyncState,
      shopError,
      lastShopSyncAt,
      shopAuthLoading,
      addInspection: async ({ component, mediaKind, mediaUri, durationMs, vehicle, observation }) => {
        inspectionAbortControllerRef.current?.abort();
        const controller = new AbortController();
        inspectionAbortControllerRef.current = controller;
        setIsAnalyzing(true);
        setAnalysisStage('preparing');
        try {
          if (!mediaUri) throw new Error('Inspection media is missing.');
          const media = await buildMediaPayload(mediaKind, mediaUri, durationMs, controller.signal);
          assertNotAborted(controller.signal);
          const payloadSize = media.reduce((total, item) => total + item.data.length, 0);
          if (payloadSize > MAX_ANALYSIS_BYTES) {
            throw new Error('This media is too large to analyze. Try a shorter video or a smaller photo.');
          }
          const body = JSON.stringify({ component, mediaKind, vehicle: vehicle?.trim() || '2017 Honda CR-V', media });
          setAnalysisStage('analyzing');
          let response = await requestAnalysis(await getAnalysisToken(controller.signal), body, controller.signal);
          if (response.status === 401) {
            assertNotAborted(controller.signal);
            await AsyncStorage.removeItem(ANALYSIS_TOKEN_KEY);
            response = await requestAnalysis(await getAnalysisToken(controller.signal), body, controller.signal);
          }
          const result = (await response.json()) as {
            analysisId?: string;
            createdAt?: string;
            findings?: Finding[];
            summary?: string;
            error?: string;
          };
          assertNotAborted(controller.signal);
          if (
            !response.ok ||
            !result.analysisId ||
            !result.createdAt ||
            !result.findings?.length ||
            !result.summary
          ) {
            throw new Error(result.error ?? 'The vision model could not analyze this media.');
          }
          const inspection: Inspection = {
            id: result.analysisId,
            createdAt: result.createdAt,
            component,
            mediaKind,
            mediaUri,
            vehicle: vehicle?.trim() || '2017 Honda CR-V',
            reportedBy: profiles.find((profile) => profile.id === activeProfileId)?.name ?? 'Community member',
            observation: observation?.trim() || result.summary,
            status: 'analyzed',
            findings: result.findings,
            summary: result.summary,
          };
          assertNotAborted(controller.signal);
          setInspections((current) => [inspection, ...current]);
          return inspection;
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw new InspectionCancelledError();
          }
          throw error;
        } finally {
          if (inspectionAbortControllerRef.current === controller) {
            inspectionAbortControllerRef.current = null;
            setIsAnalyzing(false);
            setAnalysisStage(null);
          }
        }
      },
      approveWorkOrder: async (id) => {
        if (!shopToken || !shopUser) throw new Error('Sign in to approve a work order.');
        setShopSyncState('syncing');
        setShopError(null);
        try {
          const response = await fetch(`${API_BASE_URL}/shop/work-orders/${encodeURIComponent(id)}/approve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${shopToken}` },
          });
          const result = await readShopResponse<{ workOrder: WorkOrder }>(response);
          setWorkOrders((current) => current.map((order) => order.id === id ? result.workOrder : order));
          const syncedAt = new Date().toISOString();
          setLastShopSyncAt(syncedAt);
          setShopSyncState('idle');
          await saveShopCache(shopUser.id, shopVehicles, workOrders.map((order) => order.id === id ? result.workOrder : order), syncedAt);
        } catch (error) {
          setShopSyncState(error instanceof ShopRequestError && (error.status === 0 || error.status >= 500) ? 'offline' : 'error');
          setShopError('This approval could not be saved. Your last known updates are still available.');
          throw error;
        }
      },
      refreshWorkOrders: async () => {
        if (!shopToken || !shopUser) return;
        setShopSyncState('syncing');
        setShopError(null);
        try {
          const dashboard = await fetchShopDashboard(shopToken);
          const syncedAt = new Date().toISOString();
          setShopVehicles(dashboard.vehicles);
          setWorkOrders(dashboard.workOrders);
          setLastShopSyncAt(syncedAt);
          setShopSyncState('idle');
          await saveShopCache(shopUser.id, dashboard.vehicles, dashboard.workOrders, syncedAt);
        } catch (error) {
          setShopSyncState(error instanceof ShopRequestError && (error.status === 0 || error.status >= 500) ? 'offline' : 'error');
          setShopError('We could not reach the service desk. Showing your last saved updates.');
          throw error;
        }
      },
      signInShopCustomer: async ({ email, password }) => {
        setShopAuthLoading(true);
        setShopError(null);
        try {
          const result = await requestShopAuth('/shop/auth/sign-in', { email: email.trim(), password });
          setShopToken(result.token);
          setShopUser(result.user);
          await identifyRevenueCatUser(result.user.id);
          setShopVehicles(result.user.role === 'customer' ? result.vehicles : []);
          setWorkOrders(result.user.role === 'customer' ? result.workOrders : []);
          setShopSyncState('idle');
          const syncedAt = new Date().toISOString();
          setLastShopSyncAt(syncedAt);
          await AsyncStorage.setItem(SHOP_AUTH_KEY, JSON.stringify({ token: result.token, user: result.user, vehicles: result.vehicles }));
          await saveShopCache(result.user.id, result.vehicles, result.workOrders, syncedAt);
        } catch (error) {
          setShopSyncState('error');
          setShopError(error instanceof Error ? error.message : 'We could not sign you in.');
          throw error;
        } finally {
          setShopAuthLoading(false);
        }
      },
      registerShopCustomer: async ({ name, email, phone, password, vehicle, plate }) => {
        setShopAuthLoading(true);
        setShopError(null);
        try {
          const result = await requestShopAuth('/shop/auth/register', {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            password,
            ...(vehicle?.trim() && plate?.trim()
              ? { vehicle: { label: vehicle.trim(), plate: plate.trim() } }
              : {}),
          });
          setShopToken(result.token);
          setShopUser(result.user);
          await identifyRevenueCatUser(result.user.id);
          setShopVehicles(result.vehicles);
          setWorkOrders(result.workOrders);
          setShopSyncState('idle');
          const syncedAt = new Date().toISOString();
          setLastShopSyncAt(syncedAt);
          await AsyncStorage.setItem(SHOP_AUTH_KEY, JSON.stringify({ token: result.token, user: result.user, vehicles: result.vehicles }));
          await saveShopCache(result.user.id, result.vehicles, result.workOrders, syncedAt);
        } catch (error) {
          setShopSyncState('error');
          setShopError(error instanceof Error ? error.message : 'We could not create your shop account.');
          throw error;
        } finally {
          setShopAuthLoading(false);
        }
      },
      completeShopProfile: async ({ name, email, phone }) => {
        if (!shopToken) throw new Error('Your account session has expired.');
        setShopAuthLoading(true);
        setShopError(null);
        try {
          const response = await fetch(`${API_BASE_URL}/shop/auth/profile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shopToken}` },
            body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
          });
          const result = await readShopResponse<{ user: ShopUser }>(response);
          setShopUser(result.user);
          await AsyncStorage.setItem(SHOP_AUTH_KEY, JSON.stringify({ token: shopToken, user: result.user, vehicles: shopVehicles }));
        } catch (error) {
          setShopError(error instanceof Error ? error.message : 'We could not update your account.');
          throw error;
        } finally {
          setShopAuthLoading(false);
        }
      },
      signOutShopCustomer: async () => {
        await resetRevenueCatUser().catch(() => undefined);
        setShopToken(null);
        setShopUser(null);
        setShopVehicles([]);
        setWorkOrders([]);
        setShopSyncState('idle');
        setShopError(null);
        setLastShopSyncAt(null);
        await AsyncStorage.removeItem(SHOP_AUTH_KEY);
      },
      updateActiveProfile: (updates) => {
        setProfiles((current) => current.map((profile) => profile.id === activeProfileId ? { ...profile, ...updates } : profile));
      },
      createPost: ({ text, mediaUri, mediaKind, reviewRating }) => {
        const trimmed = text.trim();
        if (!trimmed && !mediaUri) return;
        setPosts((current) => [{
          id: createId('post'),
          authorId: activeProfileId,
          createdAt: new Date().toISOString(),
          text: trimmed,
          mediaUri,
          mediaKind,
          likes: 0,
          reviewRating,
        }, ...current]);
      },
      addGalleryUpload: async ({ uri, mediaKind }) => {
        if (!uri) return;
        const localId = createId('gallery');
        const localUpload: GalleryUpload = {
          id: localId,
          uri,
          mediaUri: uri,
          thumbnailUri: uri,
          mediaKind,
          title: mediaKind === 'video' ? 'Community video' : 'Community photo',
          createdAt: new Date().toISOString(),
        };
        setGalleryUploads((current) => [localUpload, ...current]);

        if (!shopToken || !shopUser) return;

        try {
          const media = await readUploadBlob(uri);
          const originalName = getLocalFileName(uri, mediaKind);
          const contentType = media.type || (mediaKind === 'video' ? 'video/mp4' : 'image/jpeg');
          const originalUpload = await requestGalleryUploadUrl(
            { name: originalName, size: media.size, contentType },
            authenticatedRequest(shopToken),
          );
          await putUpload(originalUpload.uploadURL, media, contentType);

          let thumbnailPath: string | undefined;
          if (mediaKind === 'video') {
            try {
              const thumbnail = await getThumbnailAsync(uri, { time: 0, quality: 0.7 });
              const thumbnailBlob = await readUploadBlob(thumbnail.uri);
              const thumbnailUpload = await requestGalleryUploadUrl(
                { name: `${originalName}.jpg`, size: thumbnailBlob.size, contentType: 'image/jpeg' },
                authenticatedRequest(shopToken),
              );
              await putUpload(thumbnailUpload.uploadURL, thumbnailBlob, 'image/jpeg');
              thumbnailPath = thumbnailUpload.objectPath;
            } catch {
              thumbnailPath = undefined;
            }
          }

          const created = await createGalleryUpload(
            {
              objectPath: originalUpload.objectPath,
              thumbnailPath,
              originalName,
              title: localUpload.title,
              mediaKind,
              contentType,
              size: media.size,
            },
            authenticatedRequest(shopToken),
          );
          const hydrated = await hydrateRemoteGalleryUpload(created.upload, shopToken);
          setGalleryUploads((current) => current.map((item) => item.id === localId ? hydrated : item));
        } catch {
          // Keep the local copy so the offline-first gallery remains usable.
        }
      },
      removeGalleryUpload: async (id) => {
        const upload = galleryUploads.find((item) => item.id === id);
        if (!upload) return;
        if (upload.remote && shopToken) {
          await deleteGalleryUpload(id, authenticatedRequest(shopToken));
        }
        setGalleryUploads((current) => current.filter((item) => item.id !== id));
      },
      addChatMessage: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setChatMessages((current) => [...current, { id: createId('chat'), authorId: activeProfileId, createdAt: new Date().toISOString(), text: trimmed }]);
      },
      togglePostLike: (id) => {
        setPosts((current) => current.map((post) => post.id === id ? { ...post, likes: post.likes + 1 } : post));
      },
      removeProfile: (id) => {
        if (id === 'profile-admin') return;
        setProfiles((current) => current.filter((profile) => profile.id !== id));
        setPosts((current) => current.filter((post) => post.authorId !== id));
        setChatMessages((current) => current.filter((message) => message.authorId !== id));
      },
      importShopCustomer: ({ name, vehicle }) => {
        const trimmedName = name.trim();
        const trimmedVehicle = vehicle.trim();
        if (!trimmedName || !trimmedVehicle) return;
        setProfiles((current) => [{
          id: createId('profile'),
          name: trimmedName,
          handle: `@${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18)}`,
          bio: 'Customer from Downriver Spring Service',
          vehicle: trimmedVehicle,
          role: 'member',
          shopCustomer: true,
          joinedAt: new Date().toISOString(),
        }, ...current]);
      },
    }),
    [inspections, workOrders, profiles, posts, galleryUploads, chatMessages, activeProfileId, isHydrated, isAnalyzing, analysisStage, shopToken, shopUser, shopVehicles, shopSyncState, shopError, lastShopSyncAt, shopAuthLoading],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}

const MAX_ANALYSIS_BYTES = 5_500_000;

export async function getAnalysisToken(signal?: AbortSignal) {
  if (signal) assertNotAborted(signal);
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (signal) assertNotAborted(signal);
  if (!deviceId) {
    deviceId = createDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  const storedToken = await AsyncStorage.getItem(ANALYSIS_TOKEN_KEY);
  if (storedToken) {
    if (signal) assertNotAborted(signal);
    return storedToken;
  }

  const response = await fetch(`${API_BASE_URL}/inspection/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
    ...(signal ? { signal } : {}),
  });
  if (signal) assertNotAborted(signal);
  const payload = (await response.json()) as { token?: string; error?: string };
  if (!response.ok || !payload.token) {
    throw new Error(payload.error ?? 'Could not start a secure inspection session.');
  }
  await AsyncStorage.setItem(ANALYSIS_TOKEN_KEY, payload.token);
  return payload.token;
}

const ANALYSIS_TOKEN_KEY = 'downriver-springs-analysis-token';

const MAX_VIDEO_FRAMES = 4;

type ShopDashboardResponse = {
  user: ShopUser;
  vehicles: ShopVehicle[];
  workOrders: WorkOrder[];
};

class ShopRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readShopResponse<T>(response: Response) {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ShopRequestError(payload.error ?? 'The shop service could not complete that request.', response.status);
  }
  return payload as T;
}

async function requestShopAuth(path: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ShopRequestError('The service desk is offline. Check your connection and try again.', 0);
  }
  return readShopResponse<{
    token: string;
    user: ShopUser;
    vehicles: ShopVehicle[];
    workOrders: WorkOrder[];
  }>(response);
}

async function fetchShopDashboard(token: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/shop/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ShopRequestError('The service desk is offline.', 0);
  }
  return readShopResponse<ShopDashboardResponse>(response);
}

async function saveShopCache(userId: string, vehicles: ShopVehicle[], workOrders: WorkOrder[], syncedAt: string) {
  await AsyncStorage.setItem(
    `${SHOP_CACHE_PREFIX}${userId}`,
    JSON.stringify({ vehicles, workOrders, syncedAt }),
  );
}

async function requestAnalysis(token: string, body: string, signal: AbortSignal) {
  return fetch(`${API_BASE_URL}/inspection/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
    signal,
  });
}

async function buildMediaPayload(mediaKind: MediaKind, mediaUri: string, durationMs: number | undefined, signal: AbortSignal) {
  if (mediaKind === 'photo') {
    return [{ mimeType: 'image/jpeg' as const, data: await readBase64(mediaUri, signal) }];
  }

  const duration = Math.max(0, durationMs ?? 0);
  const times = duration > 1000
    ? [0.12, 0.38, 0.64, 0.9].map((ratio) => Math.floor((duration - 1) * ratio))
    : [0, 1000, 2000, 3000];
  const frames: { mimeType: 'image/jpeg'; data: string }[] = [];
  for (const time of times.slice(0, MAX_VIDEO_FRAMES)) {
    const thumbnail = await runWithCancellation(
      () => getThumbnailAsync(mediaUri, { time, quality: 0.55 }),
      signal,
    );
    frames.push({ mimeType: 'image/jpeg', data: await readBase64(thumbnail.uri, signal) });
  }
  return frames;
}

export class InspectionCancelledError extends Error {
  constructor() {
    super('Inspection cancelled.');
    this.name = 'InspectionCancelledError';
  }
}
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '')
  : process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : '/api';

function authenticatedRequest(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}
async function readBase64(uri: string, signal?: AbortSignal) {
  const operation = () => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return signal ? runWithCancellation(operation, signal) : operation();
}

async function putUpload(uploadURL: string, blob: Blob, contentType: string) {
  const response = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!response.ok) throw new Error('The selected media could not be uploaded.');
}

function getLocalFileName(uri: string, mediaKind: MediaKind) {
  const lastSegment = uri.split(/[\\/]/).pop()?.split('?')[0];
  if (lastSegment && lastSegment.includes('.')) return lastSegment.slice(-255);
  return mediaKind === 'video' ? 'gallery-video.mp4' : 'gallery-photo.jpg';
}

async function hydrateRemoteGalleryUpload(upload: ApiGalleryUpload, token: string): Promise<GalleryUpload> {
  const mediaUri = await downloadGalleryAsset(upload.mediaUrl, token, upload.id, 'media');
  const thumbnailUri = upload.mediaKind === 'video'
    ? await downloadGalleryAsset(upload.thumbnailUrl, token, upload.id, 'thumbnail')
    : mediaUri;
  return {
    id: upload.id,
    uri: thumbnailUri,
    mediaUri,
    thumbnailUri,
    mediaKind: upload.mediaKind,
    title: upload.title,
    createdAt: upload.createdAt,
    ownerId: upload.ownerId,
    remote: true,
  };
}

async function downloadGalleryAsset(
  url: string,
  token: string,
  id: string,
  suffix: string,
) {
  const absoluteUrl = getAbsoluteApiUrl(url);
  if (Platform.OS === 'web') {
    const response = await fetch(absoluteUrl, authenticatedRequest(token));
    if (!response.ok) throw new Error('Gallery media is unavailable.');
    return URL.createObjectURL(await response.blob());
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('Device media cache is unavailable.');
  }
  const destination = `${FileSystem.cacheDirectory}gallery-${id}-${suffix}`;
  const result = await FileSystem.downloadAsync(
    absoluteUrl,
    destination,
    authenticatedRequest(token),
  );
  return result.uri;
}

async function syncRemoteGallery(token: string) {
  const response = await listGalleryUploads(authenticatedRequest(token));
  return response.uploads;
}

async function readUploadBlob(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected media could not be read.');
  return response.blob();
}

function getAbsoluteApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/api') && API_BASE_URL.endsWith('/api')) {
    return `${API_BASE_URL.slice(0, -4)}${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

export function isInspectionCancellationError(error: unknown) {
  return error instanceof InspectionCancelledError || isAbortError(error);
}

function runWithCancellation<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  assertNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new InspectionCancelledError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    let operationPromise: Promise<T>;
    try {
      operationPromise = operation();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
      return;
    }
    operationPromise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw new InspectionCancelledError();
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}
