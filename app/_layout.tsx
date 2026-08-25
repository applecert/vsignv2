import { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Dimensions,
  Animated,
  Image,
  Easing,
  Platform,
  AppState,
  AppStateStatus,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar as RNStatusBar,
} from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { ThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles,
  BellRing,
  Wrench,
  Orbit,
  ChevronRight,
  Download,
  Crown,
  User,
  ShoppingBag,
  MessageCircle,
  Search,
  Box,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Constants from 'expo-constants';
import { OnboardingModal } from '../components/ui/OnboardingModal';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/* ================================================================
   IPAVIET OS — DESIGN TOKENS
   ================================================================ */
const COLORS = {
  void: '#03040a',
  deep: '#080a14',
  surface: '#0d0f1a',
  elevated: '#121420',
  glass: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassHighlight: 'rgba(255,255,255,0.08)',
  cyan: '#00f0ff',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  emerald: '#10b981',
  textPrimary: '#f0f2f8',
  textSecondary: 'rgba(240,242,248,0.55)',
  textTertiary: 'rgba(240,242,248,0.3)',
};

const FONTS = {
  display: Platform.select({ ios: 'SpaceGrotesk-Regular', android: 'sans-serif' }),
  sans: Platform.select({ ios: 'Inter-Regular', android: 'sans-serif' }),
};

const GOOGLE_SHEET_WEBHOOK =
  'https://script.google.com/macros/s/AKfycbyXnH5KjwQVafxGW_W2KlpDY9KHBx_0TAmaNZBqUaPz9WR8T1PDKwB9un37fNA_YO7pmg/exec';
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

/* ================================================================
   NOTIFICATIONS SETUP
   ================================================================ */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as any),
  });
}

/* ================================================================
   AURORA BLOB COMPONENT
   ================================================================ */
function AuroraBlob({
  size,
  color,
  style,
  duration = 20000,
}: {
  size: number;
  color: string;
  style?: any;
  duration?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateX = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 50, -30, 20, 0],
  });
  const translateY = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -30, 40, 20, 0],
  });
  const scale = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 1.1, 0.95, 1.05, 1],
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.35,
          transform: [{ translateX }, { translateY }, { scale }],
        },
        style,
      ]}
    />
  );
}

/* ================================================================
   ORBITAL RING COMPONENT
   ================================================================ */
function OrbitalRing({
  size,
  duration = 30000,
  reverse = false,
  dotColor = COLORS.cyan,
}: {
  size: number;
  duration?: number;
  reverse?: boolean;
  dotColor?: string;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'],
  });

  return (
    <View
      style={[
        styles.orbitalRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate }] },
        ]}
      >
        <View
          style={[
            styles.orbitalDot,
            {
              backgroundColor: dotColor,
              shadowColor: dotColor,
              top: -3,
              left: size / 2 - 3,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/* ================================================================
   GLASS CARD COMPONENT
   ================================================================ */
function GlassCard({
  children,
  style,
  intensity = 'normal',
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: 'light' | 'normal' | 'strong';
}) {
  const opacityMap = { light: 0.02, normal: 0.04, strong: 0.06 };
  const borderMap = { light: 0.06, normal: 0.08, strong: 0.12 };
  return (
    <View
      style={[
        {
          backgroundColor: `rgba(255,255,255,${opacityMap[intensity]})`,
          borderWidth: 1,
          borderColor: `rgba(255,255,255,${borderMap[intensity]})`,
          borderRadius: 24,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.06)',
          'rgba(255,255,255,0.01)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

export default function RootLayout() {
  const pathname = usePathname();

  /* ─── Onboarding & App State ─── */
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(true);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [userSkippedUpdate, setUserSkippedUpdate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [forceUpdateConfig, setForceUpdateConfig] = useState<{
    show: boolean;
    msg: string;
    url: string;
    allowSkip: boolean;
  } | null>(null);
  const [maintenanceConfig, setMaintenanceConfig] = useState<{
    show: boolean;
    msg: string;
    title: string;
  } | null>(null);

  /* ─── Auth & Admin ─── */
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const adminCheck =
        process.env.EXPO_PUBLIC_APP_TYPE === 'admin' &&
        user?.email?.toLowerCase() === 'mquitran@gmail.com';
      setIsAdmin(adminCheck);
    });
    return () => unsubAuth();
  }, []);

  /* ─── Notifications ─── */
  const registerForPushNotifications = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;
      if (token) {
        await fetch(
          `${GOOGLE_SHEET_WEBHOOK}?action=register_push_token&token=${encodeURIComponent(
            token
          )}&uid=${encodeURIComponent(auth.currentUser?.uid || '')}&platform=${encodeURIComponent(
            Platform.OS
          )}`
        );
      }
    } catch (e) {
      console.warn('Push token failed:', e);
    }
  }, []);

  const checkNotificationPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermissionGranted(true);
      setIsCheckingPermission(false);
      return;
    }
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') {
        setPermissionGranted(true);
        setIsCheckingPermission(false);
        registerForPushNotifications();
      } else {
        const { status: asked } = await Notifications.requestPermissionsAsync();
        setPermissionGranted(asked === 'granted');
        if (asked === 'granted') registerForPushNotifications();
        setIsCheckingPermission(false);
      }
    } catch {
      setPermissionGranted(true);
      setIsCheckingPermission(false);
    }
  }, [registerForPushNotifications]);

  /* ─── Maintenance & Version ─── */
  const checkMaintenanceFromServer = useCallback(async () => {
    try {
      const res = await fetch(
        `${GOOGLE_SHEET_WEBHOOK}?action=check_version_maintenance&version=${encodeURIComponent(
          APP_VERSION
        )}`
      );
      const json = await res.json();
      if (json.success && json.maintenance) {
        setMaintenanceConfig({
          show: true,
          msg: json.msg || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
          title: json.title || 'HỆ THỐNG BẢO TRÌ',
        });
      } else {
        setMaintenanceConfig(null);
      }
    } catch (e) {
      console.warn('Maintenance check failed:', e);
    }
  }, []);

  /* ─── Force Update Listener ─── */
  useEffect(() => {
    checkNotificationPermission();
    checkMaintenanceFromServer();

    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        checkNotificationPermission();
        checkMaintenanceFromServer();
      }
    };
    const appSub = AppState.addEventListener('change', handleAppState);

    const unsubConfig = onSnapshot(
      doc(db, 'settings', 'config'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.forceUpdateShow) {
            setForceUpdateConfig({
              show: true,
              msg:
                d.forceUpdateMsg ||
                'Đã có bản cập nhật mới. Vui lòng cập nhật để tiếp tục.',
              url: d.forceUpdateUrl || 'https://ipaviet.site',
              allowSkip: d.forceUpdateAllowSkip || false,
            });
          } else {
            setForceUpdateConfig(null);
            setUserSkippedUpdate(false);
          }
        }
      },
      (err) => console.warn('Config listener error:', err)
    );

    // Notification tap handler
    let notifSub: any;
    if (Platform.OS !== 'web') {
      notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.installUrl) {
          Linking.openURL(data.installUrl as string).catch(() => { });
        }
      });
    }

    return () => {
      appSub.remove();
      unsubConfig();
      notifSub?.remove();
    };
  }, [checkNotificationPermission, checkMaintenanceFromServer]);

  /* ─── Onboarding Check (3105 Style) ─── */
  useEffect(() => {
    AsyncStorage.getItem('@has_completed_onboarding_v2').then((val) => {
      if (!val) {
        setShowOnboarding(true);
      }
    });
  }, []);

  /* ─── Derived States ─── */
  const showForceUpdate =
    forceUpdateConfig?.show &&
    !userSkippedUpdate &&
    pathname !== '/admin' &&
    !isAdmin;

  const showMaintenance =
    maintenanceConfig?.show && pathname !== '/admin' && !isAdmin;

  const isLight = false; // IPAVIET OS is always dark
  const navigationTheme = {
    ...(isLight ? DefaultTheme : DarkTheme),
    colors: {
      ...(isLight ? DefaultTheme.colors : DarkTheme.colors),
      background: COLORS.void,
      card: COLORS.surface,
      text: COLORS.textPrimary,
      border: COLORS.glassBorder,
      primary: COLORS.cyan,
    },
  };

  /* ─── RENDER ─── */
  return (
    <>
      <StatusBar style="light" />
      <RNStatusBar barStyle="light-content" backgroundColor={COLORS.void} />

      {showMaintenance ? (
        <View style={styles.blockScreen}>
          <AuroraBackground />
          <GlassCard intensity="strong" style={styles.blockCard}>
            <View
              style={[
                styles.blockIconWrap,
                { borderColor: 'rgba(245,158,11,0.25)' },
              ]}
            >
              <LinearGradient
                colors={['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.05)']}
                style={StyleSheet.absoluteFill}
              />
              <Wrench color={COLORS.amber} size={40} strokeWidth={1.5} />
            </View>
            <Text style={styles.blockTitle}>{maintenanceConfig.title}</Text>
            <ScrollView
              style={{ maxHeight: 160, marginVertical: 12 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.blockMsg}>{maintenanceConfig.msg}</Text>
            </ScrollView>
          </GlassCard>
        </View>
      ) : showForceUpdate ? (
        <View style={styles.blockScreen}>
          <AuroraBackground />
          <GlassCard intensity="strong" style={styles.blockCard}>
            <View
              style={[
                styles.blockIconWrap,
                { borderColor: 'rgba(244,63,94,0.25)' },
              ]}
            >
              <LinearGradient
                colors={['rgba(244,63,94,0.15)', 'rgba(244,63,94,0.05)']}
                style={StyleSheet.absoluteFill}
              />
              <Sparkles color={COLORS.rose} size={40} strokeWidth={1.5} />
            </View>
            <Text style={styles.blockTitle}>YÊU CẦU CẬP NHẬT</Text>
            <ScrollView
              style={{ maxHeight: 140, marginVertical: 12 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.blockMsg}>{forceUpdateConfig.msg}</Text>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                Linking.openURL(forceUpdateConfig.url).catch(() => { })
              }
            >
              <LinearGradient
                colors={[COLORS.rose, '#be123c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.blockBtn}
              >
                <Text style={styles.blockBtnText}>CẬP NHẬT NGAY</Text>
              </LinearGradient>
            </TouchableOpacity>

            {forceUpdateConfig.allowSkip && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setUserSkippedUpdate(true)}
                style={{ marginTop: 16 }}
              >
                <Text style={[styles.blockRetryText, { color: COLORS.textTertiary }]}>
                  BỎ QUA CẬP NHẬT
                </Text>
              </TouchableOpacity>
            )}
          </GlassCard>
        </View>
      ) : permissionGranted === false ? (
        <View style={styles.blockScreen}>
          <AuroraBackground />
          <GlassCard intensity="strong" style={styles.blockCard}>
            <View
              style={[
                styles.blockIconWrap,
                { borderColor: 'rgba(244,63,94,0.25)' },
              ]}
            >
              <LinearGradient
                colors={['rgba(244,63,94,0.15)', 'rgba(244,63,94,0.05)']}
                style={StyleSheet.absoluteFill}
              />
              <BellRing color={COLORS.rose} size={40} strokeWidth={1.5} />
            </View>
            <Text style={styles.blockTitle}>BẮT BUỘC BẬT THÔNG BÁO</Text>
            <Text style={styles.blockMsg}>
              Ứng dụng yêu cầu quyền thông báo để hoạt động ổn định và thông báo
              khi các tác vụ ký app dưới nền hoàn tất.
            </Text>

            <TouchableOpacity activeOpacity={0.8} onPress={() => Linking.openSettings()}>
              <LinearGradient
                colors={[COLORS.rose, '#be123c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.blockBtn}
              >
                <Text style={styles.blockBtnText}>MỞ CÀI ĐẶT THIẾT BỊ</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={checkNotificationPermission}
              style={{ marginTop: 16 }}
            >
              <Text style={styles.blockRetryText}>THỬ LẠI</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      ) : (
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.void },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="details/[id]"
              options={{
                animation: 'slide_from_right',
                gestureEnabled: true,
                fullScreenGestureEnabled: false,
                gestureResponseDistance: { start: 35 },
                freezeOnBlur: true,
              }}
            />
            <Stack.Screen name="search" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="account" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="vip" />
            <Stack.Screen name="buy-vip" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="admin" />
          </Stack>
        </ThemeProvider>
      )}

      {/* ─── 3105-STYLE ONBOARDING MODAL ─── */}
      <OnboardingModal
        visible={showOnboarding}
        onFinish={() => setShowOnboarding(false)}
      />
    </>
  );
}

/* ================================================================
   AURORA BACKGROUND COMPONENT
   ================================================================ */
function AuroraBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AuroraBlob
        size={500}
        color="rgba(139,92,246,0.35)"
        style={{ top: -SCREEN_H * 0.1, left: -SCREEN_W * 0.2 }}
        duration={20000}
      />
      <AuroraBlob
        size={420}
        color="rgba(0,240,255,0.22)"
        style={{ bottom: -SCREEN_H * 0.1, right: -SCREEN_W * 0.15 }}
        duration={22000}
      />
      <AuroraBlob
        size={350}
        color="rgba(244,63,94,0.18)"
        style={{ top: SCREEN_H * 0.35, left: SCREEN_W * 0.3 }}
        duration={24000}
      />
      {/* Noise overlay simulation */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: 0.025,
            backgroundColor: '#000',
          },
        ]}
      />
    </View>
  );
}

/* ================================================================
   STYLES
   ================================================================ */
const styles = StyleSheet.create({
  /* Splash */
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    width: '100%',
  },
  orbitalContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbitalRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbitalDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  logoWrap: {
    width: 200,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  logoImg: {
    width: 160,
    height: 100,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '300',
    color: COLORS.textSecondary,
    letterSpacing: 3,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  authorBox: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  authorLabel: {
    fontSize: 8,
    fontWeight: '400',
    color: COLORS.textTertiary,
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 4,
  },

  /* Block Screens */
  blockScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.void,
  },
  blockCard: {
    width: '100%',
    maxWidth: 360,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  blockIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  blockTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  blockMsg: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  blockBtn: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  blockBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  blockRetryText: {
    color: COLORS.rose,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});