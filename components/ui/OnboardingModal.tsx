import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Globe,
  Sparkles,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Zap,
  FolderTree,
  Wrench,
  Check,
} from 'lucide-react-native';
import { COLORS, useThemeUpdate, TXT, notifyThemeChange, TRANSLATIONS } from '../../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Step = 0 | 1 | 2 | 3;

interface OnboardingModalProps {
  visible: boolean;
  onFinish: () => void;
}

export function OnboardingModal({ visible, onFinish }: OnboardingModalProps) {
  useThemeUpdate();
  const isLight = COLORS.background === '#F4F4F6';

  const [step, setStep] = useState<Step>(0);
  const [selectedLang, setSelectedLang] = useState<'vi' | 'en' | 'zh'>('vi');

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const triggerAnimation = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(15);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    if (visible) {
      triggerAnimation();
    }
  }, [visible, step]);

  const handleSelectLang = async (lang: 'vi' | 'en' | 'zh') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLang(lang);
    if (lang === 'en') {
      Object.assign(TXT, TRANSLATIONS.en);
    } else {
      Object.assign(TXT, TRANSLATIONS.vi);
    }
    await AsyncStorage.setItem('@app_language', lang);
    notifyThemeChange();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step < 3) {
      setStep((prev) => (prev + 1) as Step);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 0) {
      setStep((prev) => (prev - 1) as Step);
    }
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem('@has_completed_onboarding_v2', 'true');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onFinish();
  };

  const renderStepIndicator = () => (
    <View style={styles.indicatorRow}>
      {[0, 1, 2, 3].map((s) => {
        const isActive = s === step;
        const isPast = s < step;
        return (
          <View
            key={s}
            style={[
              styles.indicatorBar,
              {
                backgroundColor: isActive
                  ? '#00F0FF'
                  : isPast
                  ? 'rgba(0, 240, 255, 0.4)'
                  : isLight
                  ? 'rgba(0,0,0,0.1)'
                  : 'rgba(255,255,255,0.12)',
                width: isActive ? 28 : 12,
              },
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.85)' }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isLight ? '#FFFFFF' : '#0B1120',
              borderColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.1)',
            },
          ]}
        >
          {/* Header Step Indicator */}
          <View style={styles.cardHeader}>
            {step > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                <ArrowLeft size={18} color={isLight ? '#0F172A' : '#F0F2F8'} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 32 }} />
            )}
            {renderStepIndicator()}
            <Text style={[styles.stepText, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
              {step + 1}/4
            </Text>
          </View>

          {/* Animated Page Content */}
          <Animated.View
            style={[
              styles.bodyContent,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* STEP 0: LANGUAGE */}
            {step === 0 && (
              <View style={styles.stepContainer}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 240, 255, 0.1)' }]}>
                  <Globe size={32} color="#00F0FF" />
                </View>
                <Text style={[styles.title, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Chọn ngôn ngữ
                </Text>
                <Text style={[styles.subtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.6)' }]}>
                  Select your preferred language to continue
                </Text>

                <View style={styles.langList}>
                  <TouchableOpacity
                    style={[
                      styles.langOption,
                      selectedLang === 'vi' && styles.langOptionActive,
                      { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)' },
                    ]}
                    onPress={() => handleSelectLang('vi')}
                  >
                    <Text style={styles.flag}>🇻🇳</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.langName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Tiếng Việt</Text>
                      <Text style={[styles.langSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Mặc định hệ thống</Text>
                    </View>
                    {selectedLang === 'vi' && <CheckCircle2 size={20} color="#00F0FF" />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.langOption,
                      selectedLang === 'en' && styles.langOptionActive,
                      { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)' },
                    ]}
                    onPress={() => handleSelectLang('en')}
                  >
                    <Text style={styles.flag}>🇺🇸</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.langName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>English</Text>
                      <Text style={[styles.langSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>International standard</Text>
                    </View>
                    {selectedLang === 'en' && <CheckCircle2 size={20} color="#00F0FF" />}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 1: WELCOME & CAPABILITIES */}
            {step === 1 && (
              <View style={styles.stepContainer}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                  <Sparkles size={32} color="#8B5CF6" />
                </View>
                <Text style={[styles.title, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Chào mừng đến với VSign
                </Text>
                <Text style={[styles.subtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.6)' }]}>
                  Hệ sinh thái công cụ iOS tối thượng
                </Text>

                <View style={styles.featureGrid}>
                  <View style={[styles.featureItem, { backgroundColor: isLight ? '#F8FAFC' : 'rgba(255,255,255,0.04)' }]}>
                    <Wrench size={18} color="#00F0FF" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.featureTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Ký IPA Ngoại Tuyến</Text>
                      <Text style={[styles.featureDesc, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Ký app trực tiếp không cần máy tính</Text>
                    </View>
                  </View>

                  <View style={[styles.featureItem, { backgroundColor: isLight ? '#F8FAFC' : 'rgba(255,255,255,0.04)' }]}>
                    <FolderTree size={18} color="#10B981" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.featureTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Filza Mini & Bypass</Text>
                      <Text style={[styles.featureDesc, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Duyệt container app & sửa file Plist</Text>
                    </View>
                  </View>

                  <View style={[styles.featureItem, { backgroundColor: isLight ? '#F8FAFC' : 'rgba(255,255,255,0.04)' }]}>
                    <Zap size={18} color="#F59E0B" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.featureTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Live Mod & Dọn Rác</Text>
                      <Text style={[styles.featureDesc, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Tiêm Save Game & giải phóng bộ nhớ</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* STEP 2: VERSIONS & EXPLOIT MATRIX */}
            {step === 2 && (
              <View style={styles.stepContainer}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                  <Smartphone size={32} color="#10B981" />
                </View>
                <Text style={[styles.title, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Tương thích hệ điều hành
                </Text>
                <Text style={[styles.subtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.6)' }]}>
                  Lõi Sandbox Bypass được hỗ trợ toàn diện
                </Text>

                <View style={styles.versionList}>
                  <View style={[styles.versionRow, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.04)' }]}>
                    <ShieldCheck size={18} color="#10B981" />
                    <Text style={[styles.versionName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>iOS 17.0 – 17.7</Text>
                    <View style={styles.readyBadge}>
                      <Text style={styles.readyText}>Verified</Text>
                    </View>
                  </View>

                  <View style={[styles.versionRow, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.04)' }]}>
                    <ShieldCheck size={18} color="#10B981" />
                    <Text style={[styles.versionName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>iOS 18.0 – 18.3</Text>
                    <View style={styles.readyBadge}>
                      <Text style={styles.readyText}>Verified</Text>
                    </View>
                  </View>

                  <View style={[styles.versionRow, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.04)' }]}>
                    <ShieldCheck size={18} color="#10B981" />
                    <Text style={[styles.versionName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>iOS 26 / 27 Beta</Text>
                    <View style={styles.readyBadge}>
                      <Text style={styles.readyText}>Active</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* STEP 3: READY */}
            {step === 3 && (
              <View style={styles.stepContainer}>
                <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 240, 255, 0.1)' }]}>
                  <CheckCircle2 size={36} color="#00F0FF" />
                </View>
                <Text style={[styles.title, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Mọi thứ đã sẵn sàng!
                </Text>
                <Text style={[styles.subtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.6)' }]}>
                  Hệ thống đã được thiết lập thành công. Chạm nút bên dưới để bắt đầu trải nghiệm.
                </Text>

                <View style={[styles.summaryCard, { backgroundColor: isLight ? '#F8FAFC' : 'rgba(255,255,255,0.04)' }]}>
                  <View style={styles.summaryItem}>
                    <Check size={16} color="#10B981" />
                    <Text style={[styles.summaryText, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                      Lõi Native C++/Swift hoạt động ổn định
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Check size={16} color="#10B981" />
                    <Text style={[styles.summaryText, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                      Kho ứng dụng và công cụ quản lý container đã mở
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Action Button */}
          <TouchableOpacity activeOpacity={0.8} style={styles.nextBtn} onPress={handleNext}>
            <LinearGradient
              colors={['#00F0FF', '#0052FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextBtnGradient}
            >
              <Text style={styles.nextBtnText}>
                {step === 3 ? 'BẮT ĐẦU SỬ DỤNG' : 'TIẾP TỤC'}
              </Text>
              <ArrowRight size={18} color="#000" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indicatorBar: {
    height: 4,
    borderRadius: 2,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bodyContent: {
    minHeight: 280,
    justifyContent: 'center',
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  langList: {
    width: '100%',
    gap: 10,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  langOptionActive: {
    borderColor: '#00F0FF',
  },
  flag: {
    fontSize: 24,
  },
  langName: {
    fontSize: 15,
    fontWeight: '700',
  },
  langSub: {
    fontSize: 12,
    marginTop: 1,
  },
  featureGrid: {
    width: '100%',
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  featureDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  versionList: {
    width: '100%',
    gap: 10,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  versionName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700',
  },
  readyBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  summaryCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  nextBtn: {
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  nextBtnGradient: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
