import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

const TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
let revenueCatReady = false;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

function getRevenueCatApiKey() {
  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    if (!TEST_API_KEY) throw new Error("RevenueCat test API key is not configured.");
    return TEST_API_KEY;
  }
  if (Platform.OS === "ios" && IOS_API_KEY) return IOS_API_KEY;
  if (Platform.OS === "android" && ANDROID_API_KEY) return ANDROID_API_KEY;
  throw new Error(`RevenueCat ${Platform.OS} API key is not configured.`);
}

export function initializeRevenueCat() {
  Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getRevenueCatApiKey() });
  revenueCatReady = true;
}

export async function identifyRevenueCatUser(userId: string) {
  if (!revenueCatReady) return;
  await Purchases.logIn(userId);
}

export async function resetRevenueCatUser() {
  if (!revenueCatReady) return;
  if (await Purchases.isAnonymous()) return;
  await Purchases.logOut();
}

function useSubscriptionContext() {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: revenueCatReady,
    staleTime: 60_000,
  });
  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled: revenueCatReady,
    staleTime: 300_000,
  });
  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      if (!revenueCatReady) throw new Error("Store billing is not available in this preview.");
      const result = await Purchases.purchasePackage(packageToPurchase);
      return result.customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });
  const restoreMutation = useMutation({
    mutationFn: () => {
      if (!revenueCatReady) throw new Error("Store billing is not available in this preview.");
      return Purchases.restorePurchases();
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });
  const customerInfo = customerInfoQuery.data as CustomerInfo | undefined;
  return {
    customerInfo,
    offerings: offeringsQuery.data,
    isSubscribed: Boolean(customerInfo?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER]),
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  return <SubscriptionContext.Provider value={useSubscriptionContext()}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return context;
}