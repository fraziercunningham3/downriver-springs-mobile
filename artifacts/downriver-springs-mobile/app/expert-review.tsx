import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, useApp } from "@/context/AppContext";
import { useSubscription } from "@/lib/revenuecat";

type PickedMedia = { uri: string; kind: "photo" | "video"; fileName: string; mimeType: string };

export default function ExpertReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shopUser, shopToken } = useApp();
  const { isSubscribed, offerings, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const [vin, setVin] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [question, setQuestion] = useState("");
  const [pricingContext, setPricingContext] = useState("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPurchaseConfirm, setShowPurchaseConfirm] = useState(false);

  const monthlyPackage = offerings?.current?.monthly ?? offerings?.current?.availablePackages?.[0];
  const price = monthlyPackage?.product.priceString ?? "Monthly plan";
  const canSubmit = Boolean(isSubscribed && vin.trim() && vehicle.trim() && question.trim() && media.length);

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo and video access is needed to attach vehicle evidence.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.8,
    });
    if (result.canceled) return;
    setMedia(result.assets.map((asset) => ({
      uri: asset.uri,
      kind: asset.type === "video" ? "video" : "photo",
      fileName: asset.fileName ?? `vehicle-${Date.now()}`,
      mimeType: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg"),
    })));
  };

  const submit = async () => {
    if (!shopToken || !shopUser || !canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const uploaded = [];
      for (const item of media) {
        const uploadUrlResponse = await fetch(`${API_BASE_URL}/shop/expert-reviews/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${shopToken}` },
          body: JSON.stringify({ name: item.fileName, size: 1, contentType: item.mimeType }),
        });
        const upload = await uploadUrlResponse.json() as { uploadURL?: string; objectPath?: string; error?: string };
        if (!uploadUrlResponse.ok || !upload.uploadURL || !upload.objectPath) throw new Error(upload.error ?? "Could not prepare an attachment.");
        await FileSystem.uploadAsync(upload.uploadURL, item.uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": item.mimeType } });
        uploaded.push({ kind: item.kind, objectPath: upload.objectPath, fileName: item.fileName });
      }
      const response = await fetch(`${API_BASE_URL}/shop/expert-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${shopToken}` },
        body: JSON.stringify({ vin, vehicle, question, pricingContext, media: uploaded, deliveryMethod: "app" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not submit your review.");
      setMessage("Your request is with Travis. The response will appear here in the app.");
      setVin(""); setVehicle(""); setQuestion(""); setPricingContext(""); setMedia([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit your review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={20} color="#17202A" /></Pressable><View style={styles.headerCopy}><Text style={styles.kicker}>DOWNRIVER SPRING SERVICE</Text><Text style={styles.title}>Expert vehicle review</Text></View></View>
        <Text style={styles.intro}>Send Travis the VIN, real vehicle evidence, and the pricing question you want answered before you buy.</Text>
        {!isSubscribed ? (
          <View style={styles.paywall}>
            <View style={styles.paywallIcon}><Feather name="star" size={18} color="#FFFFFF" /></View>
            <Text style={styles.paywallTitle}>Downriver Springs Pro</Text>
            <Text style={styles.paywallBody}>Unlock estimates, professional diagnostics, and expert vehicle-buying reviews. Price comes from the current store offering.</Text>
            <Text style={styles.price}>{price}<Text style={styles.priceSuffix}> / month</Text></Text>
            <Pressable onPress={() => setShowPurchaseConfirm(true)} disabled={!monthlyPackage || isPurchasing} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{isPurchasing ? "Opening store…" : "Unlock Pro"}</Text></Pressable>
            <Pressable onPress={() => restore()} disabled={isRestoring} style={styles.restore}><Text style={styles.restoreText}>{isRestoring ? "Restoring…" : "Restore purchases"}</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.proBanner}><Feather name="check-circle" size={16} color="#28794D" /><Text style={styles.proBannerText}>Pro is active · expert response delivered in the app and to {shopUser?.email}</Text></View>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>VEHICLE DETAILS</Text>
              <Text style={styles.label}>VIN</Text><TextInput value={vin} onChangeText={setVin} autoCapitalize="characters" maxLength={17} placeholder="17-character VIN" placeholderTextColor="#94A0B2" style={styles.input} />
              <Text style={styles.label}>Vehicle</Text><TextInput value={vehicle} onChangeText={setVehicle} placeholder="Year, make, model, mileage" placeholderTextColor="#94A0B2" style={styles.input} />
              <Text style={styles.label}>What should Travis review?</Text><TextInput value={question} onChangeText={setQuestion} multiline placeholder="What do you want to know before buying?" placeholderTextColor="#94A0B2" style={[styles.input, styles.textarea]} />
              <Text style={styles.label}>Pricing comparison</Text><TextInput value={pricingContext} onChangeText={setPricingContext} multiline placeholder="Asking price, location, comparable listings, or fees" placeholderTextColor="#94A0B2" style={[styles.input, styles.textareaSmall]} />
              <Text style={styles.sectionLabel}>REAL VEHICLE EVIDENCE</Text>
              <Pressable onPress={pickMedia} style={styles.uploadButton}><Feather name="paperclip" size={17} color="#2455D6" /><Text style={styles.uploadText}>{media.length ? `${media.length} attachment${media.length === 1 ? "" : "s"} selected` : "Attach photos or videos"}</Text></Pressable>
              {media.length ? <View style={styles.mediaRow}>{media.map((item) => item.kind === "photo" ? <Image key={item.uri} source={{ uri: item.uri }} style={styles.thumbnail} /> : <View key={item.uri} style={[styles.thumbnail, styles.videoThumb]}><Feather name="play" size={18} color="#FFFFFF" /></View>)}</View> : null}
              {message ? <Text style={styles.message}>{message}</Text> : null}
              <Pressable disabled={!canSubmit || submitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, (!canSubmit || submitting) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{submitting ? "Uploading securely…" : "Send expert review"}</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>
      <Modal transparent visible={showPurchaseConfirm} animationType="fade" onRequestClose={() => setShowPurchaseConfirm(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Start Downriver Springs Pro?</Text><Text style={styles.modalBody}>The store will confirm the purchase using your device account. The app does not collect card details.</Text><View style={styles.modalActions}><Pressable onPress={() => setShowPurchaseConfirm(false)} style={styles.modalCancel}><Text style={styles.modalCancelText}>Not now</Text></Pressable><Pressable onPress={async () => { setShowPurchaseConfirm(false); if (monthlyPackage) await purchase(monthlyPackage); }} style={styles.modalConfirm}><Text style={styles.modalConfirmText}>Continue</Text></Pressable></View></View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F9FC" },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE2EB", alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  kicker: { color: "#2455D6", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.1 },
  title: { color: "#17202A", fontFamily: "Inter_700Bold", fontSize: 25, letterSpacing: -0.6, marginTop: 4 },
  intro: { color: "#718096", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 17, marginBottom: 18 },
  paywall: { backgroundColor: "#17202A", borderRadius: 20, padding: 19 },
  paywallIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#2455D6", alignItems: "center", justifyContent: "center" },
  paywallTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 13 },
  paywallBody: { color: "#C7D0DE", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 7 },
  price: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 27, marginTop: 17 },
  priceSuffix: { color: "#C7D0DE", fontFamily: "Inter_400Regular", fontSize: 12 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: "#DCE2EB", padding: 16 },
  sectionLabel: { color: "#718096", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.1, marginBottom: 12, marginTop: 2 },
  label: { color: "#526174", fontFamily: "Inter_700Bold", fontSize: 11, marginBottom: 6 },
  input: { minHeight: 44, backgroundColor: "#F6F7F9", borderRadius: 11, paddingHorizontal: 12, color: "#17202A", fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 13 },
  textarea: { minHeight: 88, textAlignVertical: "top", paddingTop: 12 },
  textareaSmall: { minHeight: 65, textAlignVertical: "top", paddingTop: 12 },
  uploadButton: { height: 44, borderWidth: 1, borderColor: "#B6C8F9", borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  uploadText: { color: "#2455D6", fontFamily: "Inter_700Bold", fontSize: 12 },
  mediaRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 3 },
  thumbnail: { width: 54, height: 54, borderRadius: 9, backgroundColor: "#EAF0FF" },
  videoThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#33445D" },
  primaryButton: { height: 45, backgroundColor: "#2455D6", borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryButtonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  restore: { alignItems: "center", paddingVertical: 15 },
  restoreText: { color: "#BFD0FF", fontFamily: "Inter_700Bold", fontSize: 12 },
  proBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#E9F5EE", borderWidth: 1, borderColor: "#CBE9D7", borderRadius: 13, padding: 12, marginBottom: 13 },
  proBannerText: { color: "#28794D", fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 16, flex: 1 },
  message: { color: "#28794D", fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(23,32,42,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, width: "100%" },
  modalTitle: { color: "#17202A", fontFamily: "Inter_700Bold", fontSize: 18 },
  modalBody: { color: "#718096", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  modalCancel: { flex: 1, height: 42, borderRadius: 11, backgroundColor: "#F1F3F6", alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: "#526174", fontFamily: "Inter_700Bold", fontSize: 12 },
  modalConfirm: { flex: 1, height: 42, borderRadius: 11, backgroundColor: "#2455D6", alignItems: "center", justifyContent: "center" },
  modalConfirmText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
});