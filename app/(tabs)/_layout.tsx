import React, { useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, Dimensions, Text,
  Platform, DeviceEventEmitter, Animated, PanResponder,
} from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { House, Wrench, LayoutGrid, FolderTree } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const TAB_BAR_WIDTH = width - 48;
const TAB_COUNT = 4;
const TAB_WIDTH = (TAB_BAR_WIDTH - 16) / TAB_COUNT;

/* ================================================================
   IPAVIET OS — DESIGN TOKENS
   ================================================================ */
const COLORS = {
  void: '#03040a',
  deep: '#080a14',
  surface: '#0d0f1a',
  cyan: '#00f0ff',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  textPrimary: '#f0f2f8',
  textSecondary: 'rgba(240,242,248,0.55)',
  textTertiary: 'rgba(240,242,248,0.3)',
  glass: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.06)',
  glassHighlight: 'rgba(255,255,255,0.08)',
};

const TAB_CONFIG = [
  { name: 'index', icon: House, label: 'Khám phá' },
  { name: 'sign', icon: Wrench, label: 'Ký App' },
  { name: 'apps', icon: LayoutGrid, label: 'Kho IPA' },
  { name: 'mmo', icon: FolderTree, label: 'Quản lý App' },
] as const;

import { useThemeUpdate, COLORS as THEME_COLORS } from '../../constants/theme';

/* ─── Tab Icon ─── */
function TabIcon({ name, isFocused, isLight }: { name: string; isFocused: boolean; isLight: boolean }) {
  const config = TAB_CONFIG.find((c) => c.name === name);
  const Icon = config?.icon || House;
  const activeColor = isLight ? '#0052FF' : '#00F0FF';
  const inactiveColor = isLight ? '#64748B' : 'rgba(240,242,248,0.35)';

  return (
    <View style={styles.iconWrapper}>
      <Icon
        size={20}
        strokeWidth={isFocused ? 2.5 : 1.8}
        color={isFocused ? activeColor : inactiveColor}
      />
      <Text
        style={[
          styles.tabLabel,
          {
            color: isFocused ? activeColor : inactiveColor,
            fontWeight: isFocused ? '700' : '500',
          },
        ]}
      >
        {config?.label || name}
      </Text>
    </View>
  );
}

/* ─── Floating Tab Bar ─── */
function FloatingTabBar({ state, navigation }: any) {
  const translateY = useRef(new Animated.Value(0)).current;
  const barScale = useRef(new Animated.Value(1)).current;
  const barOpacity = useRef(new Animated.Value(1)).current;
  const barInteractScale = useRef(new Animated.Value(1)).current;
  const barStretch = useRef(new Animated.Value(0)).current;

  const slideAnim = useRef(new Animated.Value(state.index)).current;
  const stretchAnim = useRef(new Animated.Value(1)).current;
  const flattenAnim = useRef(new Animated.Value(1)).current;
  const isDragging = useRef(false);

  const stateRef = useRef(state);
  const navigationRef = useRef(navigation);
  const visibleRoutesRef = useRef<any[]>([]);

  useEffect(() => {
    stateRef.current = state;
    navigationRef.current = navigation;
  });

  const showBar = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.spring(barScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      Animated.timing(barOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const showSub = DeviceEventEmitter.addListener('showTabBar', showBar);
    return () => showSub.remove();
  }, [showBar]);

  useEffect(() => {
    showBar();
  }, [state.index]);

  const animatePill = (toIndex: number) => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: toIndex, friction: 6, tension: 50, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(stretchAnim, { toValue: 1.3, duration: 120, useNativeDriver: true }),
        Animated.spring(stretchAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(flattenAnim, { toValue: 0.85, duration: 120, useNativeDriver: true }),
        Animated.spring(flattenAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      ]),
    ]).start();
  };

  useEffect(() => {
    if (!isDragging.current) animatePill(state.index);
  }, [state.index]);

  const visibleRoutes = state.routes.filter((route: any) =>
    TAB_CONFIG.some((c) => c.name === route.name)
  );
  visibleRoutesRef.current = visibleRoutes;

  const lastHoveredIndex = useRef(state.index);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        isDragging.current = true;
        slideAnim.stopAnimation();
        stretchAnim.stopAnimation();
        flattenAnim.stopAnimation();

        const localX = gestureState.x0 - 24;
        const targetIndex = Math.min(Math.max(Math.floor((localX - 8) / TAB_WIDTH), 0), TAB_COUNT - 1);
        lastHoveredIndex.current = targetIndex;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });

        Animated.parallel([
          Animated.spring(slideAnim, { toValue: targetIndex, friction: 6, tension: 80, useNativeDriver: true }),
          Animated.spring(barInteractScale, { toValue: 1.03, friction: 7, tension: 80, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderMove: (evt, gestureState) => {
        const localX = gestureState.moveX - 24;
        const floatIndex = (localX - 8 - TAB_WIDTH / 2) / TAB_WIDTH;
        const clampedIndex = Math.min(Math.max(floatIndex, 0), TAB_COUNT - 1);
        slideAnim.setValue(clampedIndex);

        let excess = 0;
        if (floatIndex < 0) excess = floatIndex;
        else if (floatIndex > TAB_COUNT - 1) excess = floatIndex - (TAB_COUNT - 1);
        const clampedExcess = Math.min(Math.max(excess, -0.8), 0.8);
        barStretch.setValue(clampedExcess * 0.15);

        const hoveredIndex = Math.min(Math.max(Math.floor((localX - 8) / TAB_WIDTH), 0), TAB_COUNT - 1);
        if (hoveredIndex !== lastHoveredIndex.current) {
          lastHoveredIndex.current = hoveredIndex;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }
        stretchAnim.setValue(1.12);
        flattenAnim.setValue(0.9);
      },
      onPanResponderRelease: (evt, gestureState) => {
        isDragging.current = false;
        const currentState = stateRef.current;
        const currentNavigation = navigationRef.current;
        const currentRoutes = visibleRoutesRef.current;

        const finalX = gestureState.x0 + gestureState.dx - 24;
        const finalIndex = Math.min(Math.max(Math.floor((finalX - 8) / TAB_WIDTH), 0), TAB_COUNT - 1);

        animatePill(finalIndex);

        Animated.parallel([
          Animated.spring(barInteractScale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
          Animated.spring(barStretch, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
        ]).start();

        const targetRoute = currentRoutes[finalIndex];
        if (!targetRoute) return;
        const currentRouteName = currentState.routes[currentState.index]?.name;
        const isAlreadyFocused = currentRouteName === targetRoute.name;

        const event = currentNavigation.emit({ type: 'tabPress', target: targetRoute.key, canPreventDefault: true });
        if (!isAlreadyFocused && !event.defaultPrevented) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
          currentNavigation.navigate(targetRoute.name);
        } else {
          animatePill(currentState.index);
        }
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        animatePill(state.index);
        Animated.parallel([
          Animated.spring(barInteractScale, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }),
          Animated.spring(barStretch, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }),
        ]).start();
      },
    })
  ).current;

  const pillWidth = TAB_WIDTH - 8;
  const pillLeftOffset = 12;

  const barScaleX = barStretch.interpolate({
    inputRange: [-0.15, 0, 0.15],
    outputRange: [1.12, 1, 1.12],
    extrapolate: 'clamp',
  });
  const barTranslateX = barStretch.interpolate({
    inputRange: [-0.15, 0, 0.15],
    outputRange: [-0.15 * (TAB_BAR_WIDTH / 2), 0, 0.15 * (TAB_BAR_WIDTH / 2)],
    extrapolate: 'clamp',
  });

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [
      0 * TAB_WIDTH + pillLeftOffset,
      1 * TAB_WIDTH + pillLeftOffset,
      2 * TAB_WIDTH + pillLeftOffset,
      3 * TAB_WIDTH + pillLeftOffset,
    ],
  });

  useThemeUpdate();
  const isLight = THEME_COLORS.background === '#F4F4F6';

  return (
    <Animated.View
      style={[
        styles.tabBarContainer,
        {
          transform: [{ translateY }, { translateX: barTranslateX }, { scale: barScale }, { scale: barInteractScale }, { scaleX: barScaleX }],
          opacity: barOpacity,
        },
      ]}
    >
      <View style={[styles.tabBarOuter, { backgroundColor: isLight ? '#FFFFFF' : 'rgba(13,15,26,0.92)', shadowColor: isLight ? 'rgba(0,0,0,0.15)' : '#000' }]}>
        {/* Glass Background */}
        <LinearGradient
          colors={isLight ? ['#FFFFFF', '#F8FAFC'] : ['rgba(13,15,26,0.92)', 'rgba(8,10,20,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { borderRadius: 34, borderWidth: 1, borderColor: isLight ? 'rgba(0,0,0,0.08)' : COLORS.glassBorder }]} />

        {/* Active Pill */}
        <Animated.View
          style={[
            styles.sharedPill,
            {
              width: pillWidth,
              transform: [{ translateX }, { scaleX: stretchAnim }, { scaleY: flattenAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={isLight ? ['rgba(0,82,255,0.12)', 'rgba(0,82,255,0.05)'] : ['rgba(0,240,255,0.12)', 'rgba(139,92,246,0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 28,
                borderWidth: 1,
                borderColor: isLight ? 'rgba(0,82,255,0.2)' : 'rgba(0,240,255,0.15)',
              },
            ]}
          />
        </Animated.View>

        {/* Tabs */}
        <View style={styles.tabRow} {...panResponder.panHandlers}>
          {visibleRoutes.map((route: any) => {
            const isFocused = state.routes[state.index].name === route.name;
            return (
              <View key={route.name} style={[styles.tabItem, { width: TAB_WIDTH }]}>
                <TabIcon name={route.name} isFocused={isFocused} isLight={isLight} />
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

/* ─── Root Layout ─── */
export default function TabLayout() {
  useThemeUpdate();
  const isLight = THEME_COLORS.background === '#F4F4F6';
  return (
    <>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Khám phá' }} />
        <Tabs.Screen name="sign" options={{ title: 'Ký App' }} />
        <Tabs.Screen name="apps" options={{ title: 'Kho IPA' }} />
        <Tabs.Screen name="mmo" options={{ title: 'Quản lý App' }} />
      </Tabs>
    </>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 24,
    width: '100%',
    alignItems: 'center',
    zIndex: 999,
  },
  tabBarOuter: {
    width: TAB_BAR_WIDTH,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 20,
  },
  tabRow: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tabItem: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 9,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  sharedPill: {
    position: 'absolute',
    height: 52,
    borderRadius: 28,
    top: 6,
    left: 0,
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
});