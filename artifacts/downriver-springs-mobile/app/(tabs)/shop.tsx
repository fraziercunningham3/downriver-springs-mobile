import * as Haptics from 'expo-haptics';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, WorkOrder } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

function StatusPill({ status }: { status: WorkOrder['status'] }) {
  const bg = status === 'Awaiting approval' ? '#FFF1D7' : status === 'Ready for pickup' ? '#E6F4EC' : '#E6EDFF';
  const text = status === 'Awaiting approval' ? '#946516' : status === 'Ready for pickup' ? '#28794D' : '#2455D6';
  return <View style={[styles.statusPill, { backgroundColor: bg }]}><Text style={[styles.statusText, { color: text }]}>{status}</Text></View>;
}

function WorkOrderCard({ workOrder, onApprove, onShare }: { workOrder: WorkOrder; onApprove: (id: string) => void; onShare: (workOrder: WorkOrder) => void }) {
  const colors = useColors();
  const isApproval = workOrder.status === 'Awaiting approval';
  return (
    <View style={styles.workOrderCard}>
      <View style={styles.workOrderTop}>
        <View style={styles.vehicleIcon}><Ionicons name="car-outline" size={20} color={colors.primary} /></View>
        <View style={styles.vehicleCopy}><Text style={styles.vehicleTitle}>{workOrder.vehicle}</Text><Text style={styles.vehicleMeta}>{workOrder.plate} · {workOrder.id}</Text></View>
        <StatusPill status={workOrder.status} />
      </View>
      <Text style={styles.serviceTitle}>{workOrder.service}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${workOrder.progress * 100}%` }]} /></View>
      <View style={styles.progressMeta}><Text style={styles.progressLabel}>{workOrder.status === 'Ready for pickup' ? '100% complete' : `${Math.round(workOrder.progress * 100)}% complete`}</Text><Text style={styles.eta}>{workOrder.eta}</Text></View>
      <View style={styles.noteRow}><Feather name="message-square" size={15} color={colors.mutedForeground} /><Text style={styles.noteText}>{workOrder.note}</Text></View>
      <View style={styles.workOrderFooter}>
        <View><Text style={styles.footerLabel}>TECHNICIAN</Text><Text style={styles.footerValue}>{workOrder.technician}</Text></View>
        <View><Text style={styles.footerLabel}>ESTIMATE</Text><Text style={styles.footerValue}>{workOrder.estimate}</Text></View>
      </View>
      {isApproval ? (
        <Pressable testID={`approve-${workOrder.id}`} onPress={() => onApprove(workOrder.id)} style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}>
          <Feather name="check-circle" size={16} color={colors.primaryForeground} /><Text style={styles.approveButtonText}>Approve estimate</Text>
        </Pressable>
      ) : null}
      <Pressable testID={`share-${workOrder.id}`} onPress={() => onShare(workOrder)} style={({ pressed }) => [styles.timelineButton, pressed && styles.pressed]}>
        <Feather name="share-2" size={15} color={colors.primary} /><Text style={styles.timelineButtonText}>Share work order update</Text>
      </Pressable>
    </View>
  );
}

export default function ShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    workOrders,
    approveWorkOrder,
    refreshWorkOrders,
    isHydrated,
    shopUser,
    shopSessions,
    shopVehicles,
    shopSyncState,
    shopError,
    lastShopSyncAt,
    shopAuthLoading,
    signInShopCustomer,
    registerShopCustomer,
    signOutShopCustomer,
    revokeShopSession,
    revokeAllShopSessions,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'All' | WorkOrder['status']>('All');
  const [authMode, setAuthMode] = useState<'sign-in' | 'register'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [plate, setPlate] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const visibleOrders = useMemo(() => filter === 'All' ? workOrders : workOrders.filter((order) => order.status === filter), [filter, workOrders]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshWorkOrders();
    } catch {
      // The context preserves the last successful response and shows the error banner.
    }
    setRefreshing(false);
  };

  const approve = async (id: string) => {
    try {
      await approveWorkOrder(id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Approval not saved', 'We could not reach the service desk. Your last known work-order view is still available.');
    }
  };

  const submitAuth = async () => {
    try {
      if (authMode === 'sign-in') {
        await signInShopCustomer({ email, password });
      } else {
        await registerShopCustomer({ name, email, phone, password, vehicle, plate });
      }
    } catch {
      // The context exposes the server or offline error below the form.
    }
  };

  const shareOrder = async (order: WorkOrder) => {
    await Share.share({ message: `${order.id} · ${order.vehicle}\n${order.service}\nStatus: ${order.status}\nTechnician note: ${order.note}\nEstimate: ${order.estimate}`, title: 'Work order update' });
  };

  const confirmRevokeSession = (sessionId: string, current: boolean) => {
    Alert.alert(
      current ? 'Sign out this device?' : 'Revoke this device?',
      current
        ? 'This device will be signed out and its saved shop view will be removed.'
        : 'This device will no longer be able to open your shop account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: current ? 'Sign out' : 'Revoke',
          style: 'destructive',
          onPress: () => revokeShopSession(sessionId).catch(() => Alert.alert('Could not revoke device', 'Try again when you have a connection.')),
        },
      ],
    );
  };

  const confirmRevokeAll = () => {
    Alert.alert(
      'Sign out all devices?',
      'Every active shop session, including this device, will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out all',
          style: 'destructive',
          onPress: () => revokeAllShopSessions().catch(() => Alert.alert('Could not sign out devices', 'Try again when you have a connection.')),
        },
      ],
    );
  };

  if (!isHydrated) return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;

  if (!shopUser) {
    return (
      <ScrollView
        contentContainerStyle={[styles.authScreen, { paddingTop: insets.top + 28, paddingBottom: 80 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authMark}><Ionicons name="lock-closed-outline" size={22} color="#FFFFFF" /></View>
        <Text style={styles.brandKicker}>DOWNRIVER SPRING SERVICE</Text>
        <Text style={styles.authTitle}>{authMode === 'sign-in' ? 'Sign in to your shop portal' : 'Create your shop account'}</Text>
        <Text style={styles.authBody}>Your account keeps vehicle updates, technician notes, and approvals private across your devices.</Text>
        <View style={styles.authCard}>
          {authMode === 'register' ? (
            <>
              <Text style={styles.fieldLabel}>Your name</Text>
              <TextInput testID="shop-name" value={name} onChangeText={setName} autoCapitalize="words" style={styles.input} placeholder="e.g. Jordan Miller" placeholderTextColor="#8B97A8" />
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput testID="shop-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="e.g. (313) 555-0142" placeholderTextColor="#8B97A8" />
            </>
          ) : null}
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput testID="shop-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="you@example.com" placeholderTextColor="#8B97A8" />
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput testID="shop-password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholder="At least 8 characters" placeholderTextColor="#8B97A8" />
          {authMode === 'register' ? (
            <>
              <Text style={styles.fieldLabel}>Vehicle</Text>
              <TextInput testID="shop-vehicle" value={vehicle} onChangeText={setVehicle} style={styles.input} placeholder="e.g. 2019 Ford Escape" placeholderTextColor="#8B97A8" />
              <Text style={styles.fieldLabel}>License plate</Text>
              <TextInput testID="shop-plate" value={plate} onChangeText={setPlate} autoCapitalize="characters" style={styles.input} placeholder="e.g. MTR 4821" placeholderTextColor="#8B97A8" />
            </>
          ) : null}
          {shopError ? <View style={styles.authError}><Feather name="alert-circle" size={15} color="#B54141" /><Text style={styles.authErrorText}>{shopError}</Text></View> : null}
          <Pressable testID="shop-auth-submit" disabled={shopAuthLoading} onPress={submitAuth} style={({ pressed }) => [styles.authButton, pressed && styles.pressed, shopAuthLoading && styles.disabled]}>
            {shopAuthLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.authButtonText}>{authMode === 'sign-in' ? 'Sign in securely' : 'Create account'}</Text>}
          </Pressable>
          <Pressable onPress={() => setAuthMode(authMode === 'sign-in' ? 'register' : 'sign-in')} style={styles.authSwitch}>
            <Text style={styles.authSwitchText}>{authMode === 'sign-in' ? 'New to the shop portal? Create an account' : 'Already have an account? Sign in'}</Text>
          </Pressable>
        </View>
        <Pressable testID="back-to-inspection-from-auth" onPress={() => router.push('/(tabs)')} style={styles.backLink}><Ionicons name="arrow-back" size={15} color="#2455D6" /><Text style={styles.backLinkText}>Back to inspection</Text></Pressable>
      </ScrollView>
    );
  }

  const syncLabel = shopSyncState === 'syncing'
    ? 'Syncing with service desk…'
    : shopSyncState === 'offline'
      ? 'Offline · showing saved updates'
      : lastShopSyncAt
        ? `Updated ${new Date(lastShopSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'Ready to sync';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View><Text style={styles.brandKicker}>DOWNRIVER SPRING SERVICE</Text><Text style={styles.screenTitle}>Your shop portal</Text><Text style={styles.customerLabel}>{shopUser.name} · {shopVehicles.length} vehicle{shopVehicles.length === 1 ? '' : 's'}</Text></View>
          <View style={styles.headerActions}><Pressable testID="shop-sign-out" onPress={() => signOutShopCustomer()} style={({ pressed }) => [styles.portalButton, pressed && styles.pressed]}><Feather name="log-out" size={18} color={colors.primary} /></Pressable><Pressable testID="back-to-inspection" onPress={() => router.push('/(tabs)')} style={({ pressed }) => [styles.portalButton, pressed && styles.pressed]}><Ionicons name="scan-outline" size={20} color={colors.primary} /></Pressable></View>
        </View>
        <View style={[styles.liveBanner, shopSyncState === 'offline' && styles.offlineBanner]}><View style={[styles.livePulse, shopSyncState === 'offline' && styles.offlinePulse]} /><View style={{ flex: 1 }}><Text style={styles.liveTitle}>{shopSyncState === 'offline' ? 'Saved view is available' : 'Service desk is live'}</Text><Text style={styles.liveCopy}>{shopError ?? 'Work orders update as your technician posts progress.'}</Text></View><Text style={styles.liveTime}>{syncLabel}</Text></View>
         <Pressable testID="expert-review-entry" onPress={() => router.push('/expert-review')} style={({ pressed }) => [styles.expertButton, pressed && styles.pressed]}><View style={styles.expertIcon}><Feather name="search" size={16} color="#FFFFFF" /></View><View style={{ flex: 1 }}><Text style={styles.expertTitle}>Expert vehicle-buying review</Text><Text style={styles.expertCopy}>Send Travis a VIN, photos, video, and pricing context.</Text></View><Feather name="chevron-right" size={18} color="#2455D6" /></Pressable>
         <View style={styles.sessionCard}>
           <Pressable testID="shop-device-sessions-toggle" onPress={() => setShowSessions((current) => !current)} style={({ pressed }) => [styles.sessionHeader, pressed && styles.pressed]}>
             <View style={styles.sessionIcon}><Feather name="shield" size={16} color="#2455D6" /></View>
             <View style={{ flex: 1 }}><Text style={styles.sessionTitle}>Signed-in devices</Text><Text style={styles.sessionCopy}>Review and revoke access to your shop account.</Text></View>
             <Feather name={showSessions ? 'chevron-up' : 'chevron-down'} size={18} color="#718096" />
           </Pressable>
           {showSessions ? (
             <View style={styles.sessionPanel}>
               {shopSessions.map((session) => (
                 <View key={session.id} style={styles.sessionRow}>
                   <View style={{ flex: 1 }}><Text style={styles.sessionDevice}>{session.deviceName}{session.current ? ' · This device' : ''}</Text><Text style={styles.sessionMeta}>Last active {new Date(session.lastSeenAt).toLocaleDateString()}</Text></View>
                   <Pressable testID={`revoke-session-${session.id}`} onPress={() => confirmRevokeSession(session.id, session.current)} style={({ pressed }) => [styles.revokeButton, pressed && styles.pressed]}><Text style={styles.revokeText}>{session.current ? 'Sign out' : 'Revoke'}</Text></Pressable>
                 </View>
               ))}
               {shopSessions.length === 0 ? <Text style={styles.sessionEmpty}>No other active device sessions are available.</Text> : null}
               <Pressable testID="shop-revoke-all" onPress={confirmRevokeAll} style={({ pressed }) => [styles.revokeAllButton, pressed && styles.pressed]}><Feather name="log-out" size={15} color="#9C3B3B" /><Text style={styles.revokeAllText}>Sign out all devices</Text></Pressable>
             </View>
           ) : null}
         </View>
        {shopError && shopSyncState !== 'offline' ? <View style={styles.errorBanner}><Feather name="alert-circle" size={15} color="#B54141" /><Text style={styles.errorText}>{shopError}</Text></View> : null}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{workOrders.length}</Text><Text style={styles.summaryLabel}>Open orders</Text></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{workOrders.filter((order) => order.status === 'Awaiting approval').length}</Text><Text style={styles.summaryLabel}>Need approval</Text></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{workOrders.filter((order) => order.status === 'Ready for pickup').length}</Text><Text style={styles.summaryLabel}>Ready</Text></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['All', 'In progress', 'Awaiting approval', 'Ready for pickup'] as const).map((item) => {
            const active = item === filter;
            return <Pressable key={item} onPress={() => setFilter(item)} style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressed]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text></Pressable>;
          })}
        </ScrollView>
        <View style={styles.listHeader}><Text style={styles.sectionLabel}>WORK ORDERS</Text><Text style={styles.swipeHint}>Pull to refresh</Text></View>
        {visibleOrders.map((workOrder) => <WorkOrderCard key={workOrder.id} workOrder={workOrder} onApprove={approve} onShare={shareOrder} />)}
        {visibleOrders.length === 0 ? <View style={styles.emptyCard}><Feather name="clipboard" size={20} color={colors.mutedForeground} /><Text style={styles.emptyTitle}>No work orders in this view.</Text><Text style={styles.emptyBody}>Try another filter or pull down to refresh.</Text></View> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authScreen: { paddingHorizontal: 20, backgroundColor: '#F7F9FC', flexGrow: 1 },
  authMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#17202A', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  authTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 33, letterSpacing: -0.8, marginTop: 4 },
  authBody: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 22 },
  authCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', borderRadius: 18, padding: 16 },
  fieldLabel: { color: '#526174', fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 3, marginBottom: 6 },
  input: { height: 44, borderRadius: 11, backgroundColor: '#F6F7F9', paddingHorizontal: 12, color: '#17202A', fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 12 },
  authError: { backgroundColor: '#FFF0F0', borderRadius: 11, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 12 },
  authErrorText: { color: '#9C3B3B', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, flex: 1 },
  authButton: { height: 44, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' },
  authButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  authSwitch: { alignItems: 'center', paddingTop: 17, paddingBottom: 3 },
  authSwitchText: { color: '#2455D6', fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center' },
  backLink: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingVertical: 20 },
  backLinkText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 12 },
  disabled: { opacity: 0.65 },
  topBar: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerActions: { flexDirection: 'row', gap: 8 },
  brandKicker: { fontFamily: 'Inter_700Bold', color: '#2455D6', fontSize: 10, letterSpacing: 1.3, marginBottom: 5 },
  screenTitle: { fontFamily: 'Inter_700Bold', color: '#17202A', fontSize: 28, letterSpacing: -0.8 },
  customerLabel: { color: '#718096', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 },
  portalButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE2EB' },
  liveBanner: { marginHorizontal: 20, borderRadius: 16, backgroundColor: '#E9F5EE', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#CBE9D7' },
  livePulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#36A866' },
  liveTitle: { color: '#236B42', fontFamily: 'Inter_700Bold', fontSize: 13 },
  liveCopy: { color: '#4D8163', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  liveTime: { color: '#4D8163', fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  expertButton: { marginHorizontal: 20, marginTop: 12, padding: 13, borderRadius: 16, backgroundColor: '#17202A', flexDirection: 'row', alignItems: 'center', gap: 10 },
  expertIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center' },
  expertTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  expertCopy: { color: '#C7D0DE', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  sessionCard: { marginHorizontal: 20, marginTop: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB' },
  sessionHeader: { minHeight: 64, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { color: '#233043', fontFamily: 'Inter_700Bold', fontSize: 12 },
  sessionCopy: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  sessionPanel: { borderTopWidth: 1, borderTopColor: '#EEF1F5', padding: 13 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
  sessionDevice: { color: '#233043', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sessionMeta: { color: '#8B97A8', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  sessionEmpty: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, paddingVertical: 7 },
  revokeButton: { borderWidth: 1, borderColor: '#F0CACA', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  revokeText: { color: '#9C3B3B', fontFamily: 'Inter_700Bold', fontSize: 10 },
  revokeAllButton: { borderTopWidth: 1, borderTopColor: '#EEF1F5', marginTop: 7, paddingTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  revokeAllText: { color: '#9C3B3B', fontFamily: 'Inter_700Bold', fontSize: 11 },
  offlineBanner: { backgroundColor: '#FFF6E5', borderColor: '#F2D59D' },
  offlinePulse: { backgroundColor: '#C68A22' },
  errorBanner: { marginHorizontal: 20, marginTop: 10, backgroundColor: '#FFF0F0', borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: { color: '#9C3B3B', fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, flex: 1 },
  summaryRow: { marginHorizontal: 20, marginTop: 14, paddingVertical: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 21 },
  summaryLabel: { color: '#718096', fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  summaryDivider: { height: 28, width: 1, backgroundColor: '#DCE2EB' },
  filterRow: { gap: 8, paddingHorizontal: 20, marginTop: 22, marginBottom: 20 },
  filterChip: { height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#17202A', borderColor: '#17202A' },
  filterText: { color: '#718096', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  filterTextActive: { color: '#FFFFFF' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { marginLeft: 20, color: '#718096', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  swipeHint: { marginRight: 20, color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 11 },
  workOrderCard: { marginHorizontal: 20, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE2EB', marginBottom: 12 },
  workOrderTop: { flexDirection: 'row', alignItems: 'flex-start' },
  vehicleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  vehicleCopy: { flex: 1 },
  vehicleTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 15 },
  vehicleMeta: { color: '#8B97A8', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  serviceTitle: { color: '#233043', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 17, marginBottom: 11 },
  progressTrack: { height: 7, backgroundColor: '#EEF1F5', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2455D6', borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  progressLabel: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 11 },
  eta: { color: '#718096', fontFamily: 'Inter_500Medium', fontSize: 11 },
  noteRow: { flexDirection: 'row', gap: 8, backgroundColor: '#F6F7F9', padding: 10, borderRadius: 11, marginTop: 14 },
  noteText: { color: '#526174', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, flex: 1 },
  workOrderFooter: { flexDirection: 'row', gap: 38, marginTop: 15 },
  footerLabel: { color: '#8B97A8', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  footerValue: { color: '#233043', fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  approveButton: { marginTop: 15, height: 42, borderRadius: 12, backgroundColor: '#2455D6', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  approveButtonText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 12 },
  timelineButton: { height: 39, borderRadius: 12, borderWidth: 1, borderColor: '#B6C8F9', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 9 },
  timelineButtonText: { color: '#2455D6', fontFamily: 'Inter_700Bold', fontSize: 11 },
  pressed: { opacity: 0.78 },
  emptyCard: { marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DCE2EB', padding: 20 },
  emptyTitle: { color: '#17202A', fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 12 },
  emptyBody: { color: '#718096', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
});