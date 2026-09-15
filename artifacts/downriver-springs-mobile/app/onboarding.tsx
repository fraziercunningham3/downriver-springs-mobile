import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { shopUser, shopError, shopAuthLoading, signInShopCustomer, registerShopCustomer, completeShopProfile } = useApp();
  const [mode, setMode] = useState<"sign-in" | "register" | "complete">(shopUser ? "complete" : "sign-in");
  const [name, setName] = useState(shopUser?.name ?? "");
  const [email, setEmail] = useState(shopUser?.email ?? "");
  const [phone, setPhone] = useState(shopUser?.phone ?? "");
  const [password, setPassword] = useState("");

  const submit = async () => {
    if (mode === "sign-in") {
      await signInShopCustomer({ email, password }).catch(() => undefined);
    } else if (mode === "register") {
      await registerShopCustomer({ name, email, phone, password }).catch(() => undefined);
    } else {
      await completeShopProfile({ name, email, phone }).catch(() => undefined);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.mark}><Ionicons name="leaf-outline" size={25} color="#FFFFFF" /></View>
      <Text style={styles.kicker}>DOWNRIVER SPRING SERVICE</Text>
      <Text style={styles.title}>{mode === "complete" ? "Finish your account" : "Your vehicle care, in one place"}</Text>
      <Text style={styles.body}>
        {mode === "complete"
          ? "Add your phone number to keep your account and service updates connected."
          : "Create an account with your full name, email, and phone so your inspections, service updates, and expert requests stay yours across devices."}
      </Text>
      <View style={styles.card}>
        {mode !== "sign-in" ? (
          <>
            <Text style={styles.label}>Full name</Text>
            <TextInput value={name} onChangeText={setName} autoCapitalize="words" placeholder="Jordan Miller" placeholderTextColor="#94A0B2" style={styles.input} />
            <Text style={styles.label}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(313) 555-0142" placeholderTextColor="#94A0B2" style={styles.input} />
          </>
        ) : null}
        <Text style={styles.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#94A0B2" style={styles.input} />
        {mode !== "complete" ? (
          <>
            <Text style={styles.label}>Password</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor="#94A0B2" style={styles.input} />
          </>
        ) : null}
        {shopError ? <View style={styles.error}><Feather name="alert-circle" size={15} color="#A64444" /><Text style={styles.errorText}>{shopError}</Text></View> : null}
        <Pressable disabled={shopAuthLoading} onPress={submit} style={({ pressed }) => [styles.submit, pressed && styles.pressed, shopAuthLoading && styles.disabled]}>
          {shopAuthLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{mode === "sign-in" ? "Sign in securely" : mode === "complete" ? "Save account details" : "Create my account"}</Text>}
        </Pressable>
        {mode !== "complete" ? (
          <Pressable onPress={() => setMode(mode === "sign-in" ? "register" : "sign-in")} style={styles.switch}>
            <Text style={styles.switchText}>{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.privacy}><Feather name="shield" size={15} color="#2455D6" /><Text style={styles.privacyText}>Your account is used to keep service records and private expert requests separate from the community feed.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 22, backgroundColor: "#F7F9FC" },
  mark: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#17202A", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  kicker: { color: "#2455D6", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.3 },
  title: { color: "#17202A", fontFamily: "Inter_700Bold", fontSize: 30, lineHeight: 35, letterSpacing: -0.8, marginTop: 8 },
  body: { color: "#718096", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, marginTop: 11, marginBottom: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: "#DCE2EB", padding: 17 },
  label: { color: "#526174", fontFamily: "Inter_700Bold", fontSize: 11, marginBottom: 6, marginTop: 3 },
  input: { height: 46, backgroundColor: "#F6F7F9", borderRadius: 12, paddingHorizontal: 13, color: "#17202A", fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 13 },
  error: { backgroundColor: "#FFF0F0", borderRadius: 11, padding: 10, flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 12 },
  errorText: { color: "#9C3B3B", fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, flex: 1 },
  submit: { height: 46, borderRadius: 13, backgroundColor: "#2455D6", alignItems: "center", justifyContent: "center" },
  submitText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  switch: { alignItems: "center", paddingTop: 17, paddingBottom: 2 },
  switchText: { color: "#2455D6", fontFamily: "Inter_700Bold", fontSize: 12 },
  privacy: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 22, paddingHorizontal: 3 },
  privacyText: { color: "#718096", fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, flex: 1 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.65 },
});