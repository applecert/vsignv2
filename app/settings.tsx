import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Image, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GlassView } from '../components/ui/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import JSZip from 'jszip';

// ICONS
import { 
  Palette, Languages, ShieldCheck, FileKey, Trash2, PlusCircle, 
  CheckCircle2, X, RefreshCw, Info, ChevronRight, ChevronLeft, Award, HardDrive,
  Scissors, Bell, Zap, Folder
} from 'lucide-react-native';

import { COLORS, SIZES, SHADOWS, useThemeUpdate, notifyThemeChange, loadTheme, loadLanguage, THEME_STYLES, TRANSLATIONS, TXT, loadFpsMode, saveFpsMode, FpsMode } from '../constants/theme';
import { SPRINGS, entranceAnim } from '../constants/animations';

const { width } = Dimensions.get('window');

interface CertItem { 
  id: string; 
  name: string; 
  p12Uri: string; 
  provUri: string; 
  password: string;
  profileName?: string;
  teamName?: string;
  teamId?: string;
  uuid?: string;
  expirationDate?: string;
  isExpired?: boolean;
  udid?: string;
}

function AnimatedSwitch({ value, onValueChange, styles }: { value: boolean; onValueChange: () => void; styles: any }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      stiffness: 260,
      damping: 20,
      mass: 0.8,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 20],
  });

  const scaleX = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#3A3A3C', COLORS.success],
  });

  return (
    <TouchableOpacity activeOpacity={1} onPress={onValueChange}>
      <Animated.View style={[styles.switchWrapper, { backgroundColor }]}>
        <Animated.View style={[styles.switchDot, { transform: [{ translateX }, { scaleX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

function StorageProgressBar({ uPct, sPct, tPct, oPct, isLight }: { uPct: number; sPct: number; tPct: number; oPct: number; isLight: boolean }) {
  const uAnim = useRef(new Animated.Value(0)).current;
  const sAnim = useRef(new Animated.Value(0)).current;
  const tAnim = useRef(new Animated.Value(0)).current;
  const oAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(uAnim, { toValue: uPct, stiffness: 180, damping: 22, mass: 0.8, useNativeDriver: false }),
      Animated.spring(sAnim, { toValue: sPct, stiffness: 180, damping: 22, mass: 0.8, useNativeDriver: false }),
      Animated.spring(tAnim, { toValue: tPct, stiffness: 180, damping: 22, mass: 0.8, useNativeDriver: false }),
      Animated.spring(oAnim, { toValue: oPct, stiffness: 180, damping: 22, mass: 0.8, useNativeDriver: false }),
    ]).start();
  }, [uPct, sPct, tPct, oPct]);

  const uWidth = uAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const sWidth = sAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const tWidth = tAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const oWidth = oAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: isLight ? '#E5E5EA' : 'rgba(255,255,255,0.06)', flexDirection: 'row', overflow: 'hidden', marginBottom: 12 }}>
      {uPct > 0 && <Animated.View style={{ width: uWidth, backgroundColor: '#007AFF' }} />}
      {sPct > 0 && <Animated.View style={{ width: sWidth, backgroundColor: '#34C759' }} />}
      {tPct > 0 && <Animated.View style={{ width: tWidth, backgroundColor: '#FF9500' }} />}
      {oPct > 0 && <Animated.View style={{ width: oWidth, backgroundColor: '#AF52DE' }} />}
    </View>
  );
}

// Helper: Chuyển đổi Base64 thành chuỗi nhị phân (Binary String) để tìm Plist XML
const base64ToBinaryString = (base64: string): string => {
  try {
    if (typeof atob === 'function') return atob(base64);
  } catch (e) {}
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const cleanStr = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let binary = '';
  for (let i = 0; i < cleanStr.length; i += 4) {
    const encoded1 = lookup[cleanStr.charCodeAt(i)];
    const encoded2 = lookup[cleanStr.charCodeAt(i + 1)];
    const encoded3 = lookup[cleanStr.charCodeAt(i + 2)];
    const encoded4 = lookup[cleanStr.charCodeAt(i + 3)];
    const bytes1 = (encoded1 << 2) | (encoded2 >> 4);
    const bytes2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    const bytes3 = ((encoded3 & 3) << 6) | encoded4;
    binary += String.fromCharCode(bytes1);
    if (cleanStr[i + 2] !== '=' && cleanStr[i + 2] !== undefined) binary += String.fromCharCode(bytes2);
    if (cleanStr[i + 3] !== '=' && cleanStr[i + 3] !== undefined) binary += String.fromCharCode(bytes3);
  }
  return binary;
};

// Helper: Phân tích file MobileProvision để trích xuất thông tin
const parseMobileProvisionData = (base64Data: string) => {
  try {
    const binary = base64ToBinaryString(base64Data);
    const startTag = '<?xml';
    const endTag = '</plist>';
    const startIndex = binary.indexOf(startTag);
    if (startIndex === -1) return null;
    const endIndex = binary.indexOf(endTag, startIndex);
    if (endIndex === -1) return null;
    const xml = binary.substring(startIndex, endIndex + endTag.length);
    
    const parseValue = (key: string): string => {
      const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
      const match = xml.match(regex);
      return match ? match[1] : '';
    };
    
    const parseDate = (key: string): string => {
      const regex = new RegExp(`<key>${key}</key>\\s*<date>([^<]+)</date>`);
      const match = xml.match(regex);
      return match ? match[1] : '';
    };

    const name = parseValue('Name');
    const teamName = parseValue('TeamName');
    const uuid = parseValue('UUID');
    const expDateStr = parseDate('ExpirationDate');
    
    let isExpired = false;
    let formattedDate = 'Không rõ';
    if (expDateStr) {
      const expDate = new Date(expDateStr);
      isExpired = expDate.getTime() < Date.now();
      formattedDate = expDate.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    
    let teamId = '';
    const teamIdMatch = xml.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
    if (teamIdMatch) teamId = teamIdMatch[1];

    let udid = '';
    const udidMatch = xml.match(/<key>ProvisionedDevices<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if (udidMatch) {
      const arrayContent = udidMatch[1];
      const singleUdidMatch = arrayContent.match(/<string>([^<]+)<\/string>/);
      if (singleUdidMatch) {
        udid = singleUdidMatch[1];
      }
    }

    return {
      profileName: name || 'Không rõ',
      teamName: teamName || 'Không rõ',
      teamId: teamId || 'Không rõ',
      uuid: uuid || '',
      expirationDate: formattedDate,
      isExpired,
      udid
    };
  } catch (e) {
    console.error("Lỗi parse mobileprovision:", e);
    return null;
  }
};

export default function SettingsScreen() {
  useThemeUpdate();
  const router = useRouter();
  const isLight = COLORS.background === '#F4F4F6';
  const styles = getStyles(COLORS, isLight);
  const [currentThemeStyle, setCurrentThemeStyle] = useState('light');
  const [currentLang, setCurrentLang] = useState('vi');
  const [savedCerts, setSavedCerts] = useState<CertItem[]>([]);
  const [activeCertId, setActiveCertId] = useState<string | null>(null);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  
  // Modals state
  const [certModalVisible, setCertModalVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  
  // P12 password state
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [tempZipData, setTempZipData] = useState<any>(null);
  const [certPassword, setCertPassword] = useState('');
  const [isUnzipping, setIsUnzipping] = useState(false);
  const [storageSizes, setStorageSizes] = useState({
    unsigned: '0.0 MB',
    signed: '0.0 MB',
    temp: '0.0 MB',
    all: '0.0 MB'
  });



  const headerSlide   = useRef(new Animated.Value(20)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const backBtnScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchSettings();
    loadSavedCerts();
    calculateAllStorageSizes();
    // Animate header entrance
    entranceAnim(headerSlide, headerOpacity, 0).start();
  }, []);

  const fetchSettings = async () => {
    const style = await AsyncStorage.getItem('@app_theme_style') || 'light';
    const lang = await AsyncStorage.getItem('@app_lang') || 'vi';
    const activeCert = await AsyncStorage.getItem('@active_cert_id');
    const bgMode = await AsyncStorage.getItem('@background_mode') === 'true';
    const fps = await loadFpsMode();
    setCurrentThemeStyle(style);
    setCurrentLang(lang);
    setActiveCertId(activeCert);
    setIsBackgroundMode(bgMode);
    setFpsMode(fps);
  };

  const [fpsMode, setFpsMode] = useState<FpsMode>('120fps');

  const changeFpsMode = async (mode: FpsMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFpsMode(mode);
    await saveFpsMode(mode);
  };

  const toggleBackgroundMode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newVal = !isBackgroundMode;
    
    if (newVal) {
      const Notifications = require('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          TXT.langName === 'English' ? 'Permission Required' : 'Yêu cầu cấp quyền',
          TXT.langName === 'English' ? 'Notifications must be enabled for background completed alerts.' : 'Sếp cần cấp quyền thông báo để nhận cảnh báo ký xong khi chạy ngầm.'
        );
        return;
      }
    }
    
    setIsBackgroundMode(newVal);
    await AsyncStorage.setItem('@background_mode', newVal ? 'true' : 'false');
  };

  const loadSavedCerts = async () => {
    try {
      const certsJson = await AsyncStorage.getItem('@saved_certs');
      if (certsJson) {
        const parsed = JSON.parse(certsJson) as CertItem[];
        setSavedCerts(parsed);
        const activeCert = await AsyncStorage.getItem('@active_cert_id');
        if (parsed.length > 0 && (!activeCert || !parsed.some(c => c.id === activeCert))) {
          await AsyncStorage.setItem('@active_cert_id', parsed[0].id);
          setActiveCertId(parsed[0].id);
        }
      }
    } catch (error) {}
  };

  const getDirSize = async (dirUri: string): Promise<number> => {
    try {
      const files = await FileSystem.readDirectoryAsync(dirUri);
      let total = 0;
      for (const f of files) {
        const fileUri = dirUri + f;
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists) {
          if (info.isDirectory) {
            total += await getDirSize(fileUri + '/');
          } else {
            total += info.size || 0;
          }
        }
      }
      return total;
    } catch (e) {
      return 0;
    }
  };

  const calculateAllStorageSizes = async () => {
    try {
      const docDir = FileSystem.documentDirectory;
      const cacheDir = FileSystem.cacheDirectory;
      
      let unsignedBytes = 0;
      let signedBytes = 0;
      let tempBytes = 0;
      let certsBytes = 0;
      
      if (docDir) {
        const docFiles = await FileSystem.readDirectoryAsync(docDir);
        for (const file of docFiles) {
          const fileUri = docDir + file;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists) {
            if (info.isDirectory) {
              certsBytes += await getDirSize(fileUri + '/');
            } else {
              if (file.endsWith('.ipa')) {
                if (file.startsWith('signed_')) {
                  signedBytes += info.size || 0;
                } else {
                  unsignedBytes += info.size || 0;
                }
              }
            }
          }
        }
      }
      
      if (cacheDir) {
        tempBytes = await getDirSize(cacheDir);
      }
      
      const totalBytes = unsignedBytes + signedBytes + tempBytes + certsBytes;
      
      const formatMB = (bytes: number) => {
        if (bytes === 0) return '0.0 MB';
        const mb = bytes / (1024 * 1024);
        return mb.toFixed(1) + ' MB';
      };
      
      setStorageSizes({
        unsigned: formatMB(unsignedBytes),
        signed: formatMB(signedBytes),
        temp: formatMB(tempBytes),
        all: formatMB(totalBytes)
      });
    } catch (error) {
      console.error("Error calculating storage sizes:", error);
    }
  };

  const cleanUnsignedApps = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      TXT.langName === 'English' ? 'Clear Original IPAs' : 'Xóa File IPA Gốc',
      TXT.langName === 'English' 
        ? 'Are you sure you want to delete all unsigned original IPA files?' 
        : 'Sếp có chắc chắn muốn xóa tất cả file IPA gốc chưa ký khỏi máy?',
      [
        { text: TXT.cancelBtn, style: 'cancel' },
        { text: TXT.langName === 'English' ? 'Delete' : 'Xóa', style: 'destructive', onPress: async () => {
            try {
              const docDir = FileSystem.documentDirectory;
              if (docDir) {
                const files = await FileSystem.readDirectoryAsync(docDir);
                for (const f of files) {
                  if (f.endsWith('.ipa') && !f.startsWith('signed_')) {
                    await FileSystem.deleteAsync(docDir + f, { idempotent: true });
                  }
                }
              }
              await calculateAllStorageSizes();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(TXT.successLabel, TXT.langName === 'English' ? 'Original IPA files cleared.' : 'Đã dọn dẹp sạch file IPA gốc.');
            } catch (e) {
              Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Failed to clear original IPAs.' : 'Lỗi dọn dẹp file IPA gốc.');
            }
          }
        }
      ]
    );
  };

  const cleanSignedApps = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      TXT.langName === 'English' ? 'Clear Signed Apps' : 'Xóa App Đã Ký',
      TXT.langName === 'English' 
        ? 'Are you sure you want to delete all signed IPA applications?' 
        : 'Sếp có chắc chắn muốn xóa tất cả file IPA đã ký?',
      [
        { text: TXT.cancelBtn, style: 'cancel' },
        { text: TXT.langName === 'English' ? 'Delete' : 'Xóa', style: 'destructive', onPress: async () => {
            try {
              const docDir = FileSystem.documentDirectory;
              if (docDir) {
                const files = await FileSystem.readDirectoryAsync(docDir);
                for (const f of files) {
                  if (f.startsWith('signed_') && f.endsWith('.ipa')) {
                    await FileSystem.deleteAsync(docDir + f, { idempotent: true });
                  }
                }
              }
              await calculateAllStorageSizes();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(TXT.successLabel, TXT.langName === 'English' ? 'Signed IPA apps cleared.' : 'Đã dọn dẹp sạch app đã ký.');
            } catch (e) {
              Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Failed to clear signed apps.' : 'Lỗi dọn dẹp app đã ký.');
            }
          }
        }
      ]
    );
  };

  const cleanTempFiles = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      TXT.langName === 'English' ? 'Clear Temp Cache' : 'Xóa Bộ Nhớ Tạm',
      TXT.langName === 'English' 
        ? 'Are you sure you want to delete all temporary files and caches?' 
        : 'Sếp có chắc chắn muốn dọn dẹp toàn bộ tệp tin tạm thời và cache không?',
      [
        { text: TXT.cancelBtn, style: 'cancel' },
        { text: TXT.langName === 'English' ? 'Clear' : 'Dọn dẹp', style: 'destructive', onPress: async () => {
            try {
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                const files = await FileSystem.readDirectoryAsync(cacheDir);
                for (const f of files) {
                  await FileSystem.deleteAsync(cacheDir + f, { idempotent: true });
                }
              }
              await calculateAllStorageSizes();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(TXT.successLabel, TXT.langName === 'English' ? 'Temporary cache cleared.' : 'Đã xóa toàn bộ bộ nhớ đệm tạm thời.');
            } catch (e) {
              Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Failed to clear cache.' : 'Lỗi dọn dẹp bộ nhớ đệm.');
            }
          }
        }
      ]
    );
  };

  const cleanAllDataAndSettings = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert(
      TXT.langName === 'English' ? 'RESET ALL DATA' : 'XÓA TOÀN BỘ DỮ LIỆU & RESET',
      TXT.langName === 'English' 
        ? 'WARNING: This will completely delete all original IPAs, signed apps, P12 certificates, and reset all settings to defaults. This action CANNOT be undone!' 
        : 'CẢNH BÁO: Hành động này sẽ xóa toàn bộ IPA gốc, IPA đã ký, các chứng chỉ P12 đã lưu và đưa mọi cài đặt về mặc định. Sếp chắc chắn muốn Reset chứ?',
      [
        { text: TXT.cancelBtn, style: 'cancel' },
        { text: TXT.langName === 'English' ? 'Reset Everything' : 'Xóa Sạch Hết', style: 'destructive', onPress: async () => {
            try {
              const docDir = FileSystem.documentDirectory;
              const cacheDir = FileSystem.cacheDirectory;
              
              if (cacheDir) {
                const files = await FileSystem.readDirectoryAsync(cacheDir);
                for (const f of files) {
                  await FileSystem.deleteAsync(cacheDir + f, { idempotent: true });
                }
              }
              
              if (docDir) {
                const files = await FileSystem.readDirectoryAsync(docDir);
                for (const f of files) {
                  await FileSystem.deleteAsync(docDir + f, { idempotent: true });
                }
              }
              
              await AsyncStorage.removeItem('@saved_certs');
              await AsyncStorage.removeItem('@active_cert_id');
              setSavedCerts([]);
              setActiveCertId(null);
              
              await calculateAllStorageSizes();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(TXT.successLabel, TXT.langName === 'English' ? 'All storage and certificate library reset successfully!' : 'Đã dọn dẹp sạch sẽ và khôi phục cài đặt gốc thành công!');
            } catch (e) {
              Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Failed to reset all data.' : 'Lỗi dọn dẹp toàn bộ dữ liệu.');
            }
          }
        }
      ]
    );
  };

  const selectActiveCert = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem('@active_cert_id', id);
    setActiveCertId(id);
  };

  const deleteCert = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(TXT.deleteCertTitle, TXT.deleteCertConfirm, [
      { text: TXT.cancelBtn, style: "cancel" },
      { text: TXT.langName === 'English' ? 'Delete' : 'Xóa', style: "destructive", onPress: async () => {
          const updated = savedCerts.filter(c => c.id !== id);
          setSavedCerts(updated);
          await AsyncStorage.setItem('@saved_certs', JSON.stringify(updated));
          
          if (activeCertId === id) {
            const nextActive = updated.length > 0 ? updated[0].id : null;
            if (nextActive) {
              await AsyncStorage.setItem('@active_cert_id', nextActive);
              setActiveCertId(nextActive);
            } else {
              await AsyncStorage.removeItem('@active_cert_id');
              setActiveCertId(null);
            }
          }
      }}
    ]);
  };

  const importCertFromZip = () => {
    setCertModalVisible(false);
    setTimeout(async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (result.canceled || !result.assets || result.assets.length === 0) {
          setCertModalVisible(true);
          return;
        }
        
        const file = result.assets[0];
        if (!file.name.toLowerCase().endsWith('.zip')) {
          Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Please select a .zip file containing the certificate.' : "Vui lòng chọn tệp .zip chứa chứng chỉ.");
          setCertModalVisible(true);
          return;
        }

        setIsUnzipping(true);
        setCertModalVisible(true);
        
        const b64Data = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(b64Data, { base64: true });

        let p12Data = null, provData = null, p12Name = '', provName = '';

        for (const [path, zipObj] of Object.entries(zip.files)) {
          if (!zipObj.dir) {
            if (path.toLowerCase().endsWith('.p12')) { 
              p12Data = await zipObj.async('base64'); 
              p12Name = path.split('/').pop() || 'cert.p12'; 
            }
            if (path.toLowerCase().endsWith('.mobileprovision')) { 
              provData = await zipObj.async('base64'); 
              provName = path.split('/').pop() || 'cert.mobileprovision'; 
            }
          }
        }

        if (!p12Data || !provData) {
          setIsUnzipping(false);
          Alert.alert(TXT.langName === 'English' ? 'ZIP Error' : 'Lỗi ZIP', TXT.langName === 'English' ? 'Invalid ZIP file. It must contain at least one .p12 file and one .mobileprovision file.' : 'Tệp ZIP không hợp lệ. Bên trong phải chứa ít nhất 1 file .p12 và 1 file .mobileprovision');
          return;
        }

        setTempZipData({ p12Data, provData, p12Name, provName, zipName: file.name.replace('.zip', '') });
        setCertPassword('');
        setIsUnzipping(false);
        setCertModalVisible(false);
        
        setTimeout(() => setPwdModalVisible(true), 500);

      } catch (error: any) {
        setIsUnzipping(false);
        setCertModalVisible(true);
        Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Cannot read ZIP file.' : "Không thể đọc file ZIP.");
      }
    }, 500);
  };

  const saveCertToStorage = async () => {
    if (!certPassword) return Alert.alert(TXT.langName === 'English' ? 'Missing' : 'Thiếu', TXT.langName === 'English' ? 'Please enter the P12 file password' : "Vui lòng nhập mật khẩu của file P12");
    
    setPwdModalVisible(false);
    try {
      const certDir = FileSystem.documentDirectory + 'Certs/';
      const dirInfo = await FileSystem.getInfoAsync(certDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(certDir, { intermediates: true });

      const id = Date.now().toString();
      const p12Uri = certDir + id + '_' + tempZipData.p12Name;
      const provUri = certDir + id + '_' + tempZipData.provName;

      await FileSystem.writeAsStringAsync(p12Uri, tempZipData.p12Data, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(provUri, tempZipData.provData, { encoding: FileSystem.EncodingType.Base64 });

      const parsed = parseMobileProvisionData(tempZipData.provData);

      const newCert: CertItem = { 
        id, 
        name: tempZipData.zipName, 
        p12Uri, 
        provUri, 
        password: certPassword,
        profileName: parsed?.profileName || tempZipData.zipName,
        teamName: parsed?.teamName || 'Không rõ',
        teamId: parsed?.teamId || 'Không rõ',
        uuid: parsed?.uuid || '',
        expirationDate: parsed?.expirationDate || 'Không rõ',
        isExpired: parsed?.isExpired || false,
        udid: parsed?.udid
      };
      
      const updatedCerts = [newCert, ...savedCerts]; 
      setSavedCerts(updatedCerts);
      await AsyncStorage.setItem('@saved_certs', JSON.stringify(updatedCerts));
      await AsyncStorage.setItem('@active_cert_id', id);
      setActiveCertId(id);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setCertModalVisible(true);
        Alert.alert(TXT.successLabel, TXT.langName === 'English' ? 'Certificate imported and activated!' : "Chứng chỉ đã được nạp và kích hoạt!");
      }, 500);
      
    } catch (error) {
      Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Cannot save certificate to device.' : "Không thể lưu chứng chỉ vào máy.");
    }
  };

  const changeTheme = async (themeKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem('@app_theme_style', themeKey);
    setCurrentThemeStyle(themeKey);
    await loadTheme();
    notifyThemeChange();
  };

  const changeLanguage = async (langKey: 'vi' | 'en') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem('@app_lang', langKey);
    setCurrentLang(langKey);
    await loadLanguage();
    notifyThemeChange();
  };

  const getActiveCertName = () => {
    if (!activeCertId || savedCerts.length === 0) return TXT.langName === 'English' ? 'No certificate selected' : 'Chưa chọn chứng chỉ';
    const active = savedCerts.find(c => c.id === activeCertId);
    return active ? (active.profileName || active.name) : (TXT.langName === 'English' ? 'No certificate selected' : 'Chưa chọn chứng chỉ');
  };

  const getThemeName = (style: string) => {
    const names: Record<string, string> = {
      obsidian: 'Obsidian Dark',
      gold: 'VIP Liquid Gold',
      neon: 'Cyber Neon',
      light: 'Classic Light',
      aurora: 'Aurora Teal',
      midnight: 'Midnight Blue',
    };
    return names[style] || 'Classic Light';
  };



  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: COLORS.background }]} 
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style={isLight ? 'dark' : 'light'} />
      
      {/* HEADER WITH BACK BUTTON */}
      <Animated.View style={[styles.header, { transform: [{ translateY: headerSlide }], opacity: headerOpacity }]}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          onPressIn={() => Animated.spring(backBtnScale, { toValue: 0.88, ...SPRINGS.tap }).start()}
          onPressOut={() => Animated.spring(backBtnScale, { toValue: 1, ...SPRINGS.bounce }).start()}
          activeOpacity={1}
        >
          <Animated.View style={[styles.backBtnInner, { transform: [{ scale: backBtnScale }] }]}>
            <ChevronLeft size={20} color={COLORS.text} />
          </Animated.View>
        </TouchableOpacity>
        <Text style={[styles.largeTitle, { color: COLORS.text, marginTop: 12 }]}>{TXT.settings}</Text>
        <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>{TXT.settingsSubtitle}</Text>
      </Animated.View>

      {/* SECTION 1: CHỨNG CHỈ */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{TXT.certificateSection}</Text>
      </View>
      
      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
        <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCertModalVisible(true); }}>
          <View style={styles.rowLabelContainer}>
            <FileKey color={COLORS.primary} size={18} strokeWidth={2.2} />
            <Text style={[styles.rowLabel, { color: COLORS.text }]}>{TXT.certLib}</Text>
          </View>
          <View style={styles.rowRightSide}>
            <Text style={[styles.rowValLabel, { color: COLORS.textMuted }]} numberOfLines={1}>
              {getActiveCertName()}
            </Text>
            <ChevronRight color={COLORS.textMuted} size={16} />
          </View>
        </TouchableOpacity>
      </View>

      {/* SECTION 2: GIAO DIỆN HỆ THỐNG */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{TXT.themeSection}</Text>
      </View>

      {/* HORIZONTAL MINI THEME PICKER (LUXURY INTERFACE) */}
      <View style={styles.themePickerContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScroll}>
          {Object.entries(THEME_STYLES).map(([key, val]) => {
            const isSelected = currentThemeStyle === key;
            return (
              <TouchableOpacity 
                key={key} 
                activeOpacity={0.8} 
                onPress={() => changeTheme(key)}
                style={[
                  styles.themePill, 
                  { 
                    backgroundColor: val.background, 
                    borderColor: isSelected ? COLORS.primary : (isLight ? '#E5E5EA' : 'rgba(255,255,255,0.06)') 
                  },
                  isSelected && styles.themePillSelected
                ]}
              >
                <View style={styles.themePillContent}>
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatch, { backgroundColor: val.primary }]} />
                    <View style={[styles.swatch, { backgroundColor: val.success || val.primaryLight }]} />
                  </View>
                  <Text style={[styles.themeLabel, { color: val.text }, isSelected && { fontWeight: '700' }]}>
                    {getThemeName(key)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          
          {/* AUTO THEME PILL */}
          {(() => {
            const isSelected = currentThemeStyle === 'auto';
            return (
              <TouchableOpacity 
                activeOpacity={0.8} 
                onPress={() => changeTheme('auto')}
                style={[
                  styles.themePill, 
                  { 
                    backgroundColor: isLight ? '#FFFFFF' : '#121215', 
                    borderColor: isSelected ? COLORS.primary : (isLight ? '#E5E5EA' : 'rgba(255,255,255,0.06)') 
                  },
                  isSelected && styles.themePillSelected
                ]}
              >
                <View style={styles.themePillContent}>
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatch, { backgroundColor: isLight ? '#007AFF' : '#FFE259' }]} />
                    <View style={[styles.swatch, { backgroundColor: '#8E8E93' }]} />
                  </View>
                  <Text style={[styles.themeLabel, { color: isLight ? '#000000' : '#FFFFFF' }, isSelected && { fontWeight: '700' }]}>
                    {TXT.autoTheme}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })()}
        </ScrollView>
      </View>



      {/* SECTION 3: TẦN SỐ QUÉT & HIỆU NĂNG */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>TẦN SỐ QUÉT & HIỆU NĂNG</Text>
      </View>

      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
        <TouchableOpacity
          style={[styles.rowItem, { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}
          activeOpacity={0.8}
          onPress={() => changeFpsMode('120fps')}
        >
          <View style={styles.rowLabelContainer}>
            <Zap color={fpsMode === '120fps' ? COLORS.primary : COLORS.textMuted} size={18} strokeWidth={2.2} />
            <View style={{ marginLeft: 4 }}>
              <Text style={[styles.rowLabel, { color: COLORS.text, fontWeight: fpsMode === '120fps' ? '700' : '500' }]}>
                ⚡ 120 FPS ProMotion
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                Lấy mẫu cuộn 1ms — Tối đa 120Hz mượt bứt phá
              </Text>
            </View>
          </View>
          {fpsMode === '120fps' && <CheckCircle2 color={COLORS.primary} size={18} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rowItem}
          activeOpacity={0.8}
          onPress={() => changeFpsMode('60fps')}
        >
          <View style={styles.rowLabelContainer}>
            <Zap color={fpsMode === '60fps' ? COLORS.primary : COLORS.textMuted} size={18} strokeWidth={2.2} />
            <View style={{ marginLeft: 4 }}>
              <Text style={[styles.rowLabel, { color: COLORS.text, fontWeight: fpsMode === '60fps' ? '700' : '500' }]}>
                🔋 60 FPS Standard
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                Lấy mẫu cuộn 16ms — Tiết kiệm thời lượng pin
              </Text>
            </View>
          </View>
          {fpsMode === '60fps' && <CheckCircle2 color={COLORS.primary} size={18} />}
        </TouchableOpacity>
      </View>

      {/* SECTION: QUẢN LÝ APP & DỮ LIỆU (FILZA TOOL) */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>CÔNG CỤ HỆ THỐNG & FILZA</Text>
      </View>

      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
        <TouchableOpacity
          style={styles.rowItem}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/app-manager');
          }}
        >
          <View style={styles.rowLabelContainer}>
            <Folder color={COLORS.primary} size={18} strokeWidth={2.2} />
            <View style={{ marginLeft: 4 }}>
              <Text style={[styles.rowLabel, { color: COLORS.text, fontWeight: '700' }]}>
                📁 Quản lý App & Dữ liệu (Filza Explorer)
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                Duyệt file Documents, Library, Mod save game & Dọn rác
              </Text>
            </View>
          </View>
          <ChevronRight color={COLORS.textMuted} size={18} />
        </TouchableOpacity>
      </View>

      {/* SECTION 4: THIẾT LẬP HỆ THỐNG */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{TXT.systemSettingsSection}</Text>
      </View>

      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
        {/* INLINE SEGMENTED LANGUAGE SELECTOR */}
        <View style={styles.rowItemNoPress}>
          <View style={styles.rowLabelContainer}>
            <Languages color={COLORS.primary} size={18} strokeWidth={2.2} />
            <Text style={[styles.rowLabel, { color: COLORS.text }]}>{TXT.language}</Text>
          </View>
          <View style={[styles.segmentedControl, { backgroundColor: isLight ? '#E5E5EA' : 'rgba(255,255,255,0.06)' }]}>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => changeLanguage('vi')}
              style={[
                styles.segmentBtn, 
                currentLang === 'vi' && [
                  styles.segmentBtnActive, 
                  { backgroundColor: COLORS.surfaceSolid }
                ]
              ]}
            >
              <Text style={[styles.segmentText, { color: currentLang === 'vi' ? COLORS.text : COLORS.textMuted }]}>
                Tiếng Việt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => changeLanguage('en')}
              style={[
                styles.segmentBtn, 
                currentLang === 'en' && [
                  styles.segmentBtnActive, 
                  { backgroundColor: COLORS.surfaceSolid }
                ]
              ]}
            >
              <Text style={[styles.segmentText, { color: currentLang === 'en' ? COLORS.text : COLORS.textMuted }]}>
                English
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: COLORS.border }]} />

        <View style={styles.rowItemNoPress}>
          <View style={styles.rowLabelContainer}>
            <Bell color={COLORS.primary} size={18} strokeWidth={2.2} />
            <View style={{ gap: 2 }}>
              <Text style={[styles.rowLabel, { color: COLORS.text }]}>
                {TXT.langName === 'English' ? 'Background Mode & Alert' : 'Chạy ngầm và thông báo'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 11, maxWidth: '80%' }}>
                {TXT.langName === 'English' ? 'Download and sign apps in the background' : 'Tải và ký app dưới nền, gửi thông báo khi hoàn tất'}
              </Text>
            </View>
          </View>
          <AnimatedSwitch value={isBackgroundMode} onValueChange={toggleBackgroundMode} styles={styles} />
        </View>

      </View>

      {/* SECTION: STORAGE MANAGEMENT DASHBOARD */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{TXT.storageManager}</Text>
      </View>
      
      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border, padding: 16 }]}>
        <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
          {TXT.langName === 'English' ? 'App Storage Share' : 'Phân bổ bộ nhớ ứng dụng'}
        </Text>
        
        {/* Horizontal segment progress bar */}
        {(() => {
          const getMbValue = (sizeStr: string) => parseFloat(sizeStr.replace(' MB', '')) || 0;
          const uVal = getMbValue(storageSizes.unsigned);
          const sVal = getMbValue(storageSizes.signed);
          const tVal = getMbValue(storageSizes.temp);
          const totalVal = getMbValue(storageSizes.all);
          
          const uPct = totalVal > 0 ? (uVal / totalVal) * 100 : 0;
          const sPct = totalVal > 0 ? (sVal / totalVal) * 100 : 0;
          const tPct = totalVal > 0 ? (tVal / totalVal) * 100 : 0;
          const oPct = totalVal > 0 ? Math.max(0, 100 - uPct - sPct - tPct) : 0;
          
          return (
            <View>
              <StorageProgressBar uPct={uPct} sPct={sPct} tPct={tPct} oPct={oPct} isLight={isLight} />
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF' }} />
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{TXT.langName === 'English' ? 'Original IPA' : 'IPA Gốc'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{TXT.langName === 'English' ? 'Signed Apps' : 'App Đã Ký'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF9500' }} />
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{TXT.langName === 'English' ? 'Cache' : 'Bộ nhớ tạm'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#AF52DE' }} />
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{TXT.langName === 'English' ? 'Certs & Config' : 'Chứng chỉ & Khác'}</Text>
                </View>
              </View>
            </View>
          );
        })()}

        <View style={{ gap: 12 }}>
          {/* Unsigned apps */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{TXT.unsignedApps}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{storageSizes.unsigned}</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }} 
              onPress={cleanUnsignedApps}
            >
              <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '700' }}>{TXT.cleanBtn}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ height: 0.5, backgroundColor: COLORS.border }} />

          {/* Signed apps */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{TXT.signedApps}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{storageSizes.signed}</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }} 
              onPress={cleanSignedApps}
            >
              <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '700' }}>{TXT.cleanBtn}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 0.5, backgroundColor: COLORS.border }} />

          {/* Cache/Temp */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{TXT.tempFiles}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{storageSizes.temp}</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }} 
              onPress={cleanTempFiles}
            >
              <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '700' }}>{TXT.cleanBtn}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 0.5, backgroundColor: COLORS.border }} />

          {/* Reset all data */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{TXT.allData}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{storageSizes.all}</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: COLORS.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }} 
              onPress={cleanAllDataAndSettings}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* SECTION 4: THÔNG TIN */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{TXT.infoSection}</Text>
      </View>

      <View style={[styles.cardGroup, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
        <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInfoModalVisible(true); }}>
          <View style={styles.rowLabelContainer}>
            <Info color={COLORS.primary} size={18} strokeWidth={2.2} />
            <Text style={[styles.rowLabel, { color: COLORS.text }]}>{TXT.verSpecs}</Text>
          </View>
          <View style={styles.rowRightSide}>
            <Text style={[styles.rowValLabel, { color: COLORS.textMuted }]}>v1.2.0 (C++ Core)</Text>
            <ChevronRight color={COLORS.textMuted} size={16} />
          </View>
        </TouchableOpacity>
      </View>

      {/* PREMIUM CERTIFICATE LIBRARY MODAL */}
      <Modal visible={certModalVisible} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalBg}>
          <GlassView intensity={isLight ? 40 : 20} tint={isLight ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
          <View style={[styles.modalBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
            <View style={styles.modalHeaderIndicator} />
            
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => !isUnzipping && setCertModalVisible(false)}>
              <X color={COLORS.text} size={20} />
            </TouchableOpacity>
            
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>{TXT.certLib}</Text>
            <Text style={[styles.modalSub, { color: COLORS.textMuted }]}>
              {TXT.langName === 'English' ? 'Load .zip containing .p12 & .mobileprovision to sign Offline' : 'Nạp tệp .zip chứa chứng chỉ .p12 và .mobileprovision để ký Offline'}
            </Text>

            <TouchableOpacity style={[styles.addCertBtn, { borderColor: COLORS.primary }]} onPress={importCertFromZip} disabled={isUnzipping}>
              {isUnzipping ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <PlusCircle color={COLORS.primary} size={20} />
                  <Text style={[styles.addCertText, { color: COLORS.primary }]}>{TXT.importNewCert}</Text>
                </>
              )}
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={{ paddingBottom: 40 }}>
              {savedCerts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <FileKey color={TXT.langName === 'English' ? COLORS.textMuted : COLORS.textMuted} size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>{TXT.noCertsLoaded}</Text>
                </View>
              ) : (
                savedCerts.map((cert) => {
                  const isActive = activeCertId === cert.id;
                  return (
                    <TouchableOpacity 
                      key={cert.id} 
                      activeOpacity={0.9}
                      style={[
                        styles.certCard, 
                        { backgroundColor: COLORS.surfaceCard, borderColor: isActive ? COLORS.primary : COLORS.border }
                      ]} 
                      onPress={() => selectActiveCert(cert.id)}
                    >
                      <View style={styles.certCardBody}>
                        <View style={[styles.activeStatusDot, { backgroundColor: isActive ? COLORS.primary : 'transparent' }]} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.certNameText, { color: COLORS.text }]}>
                            {cert.profileName || cert.name}
                          </Text>
                          <Text style={[styles.certDetailText, { color: COLORS.textMuted }]} numberOfLines={1}>
                            {TXT.enterpriseLabel} {cert.teamName}
                          </Text>
                          <Text style={[styles.certDetailText, cert.isExpired ? { color: COLORS.danger } : { color: COLORS.textMuted }]}>
                            {TXT.expirationLabel} {cert.expirationDate} {cert.isExpired ? TXT.expiredLabel : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCert(cert.id)}>
                        <Trash2 color={COLORS.danger} size={18} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* P12 PASSWORD INPUT MODAL */}
      <Modal visible={pwdModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBgCentered}>
          <GlassView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
            <View style={[styles.pwdBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
              <ShieldCheck color={COLORS.primary} size={42} style={{ marginBottom: 12 }} />
              <Text style={[styles.pwdTitle, { color: COLORS.text }]}>{TXT.p12PasswordTitle}</Text>
              <Text style={[styles.pwdSub, { color: COLORS.textMuted }]}>
                {TXT.p12PasswordSub} {tempZipData?.zipName}
              </Text>
              <TextInput 
                style={[styles.pwdInput, { backgroundColor: isLight ? '#F4F4F6' : 'rgba(255,255,255,0.04)', color: COLORS.text, borderColor: COLORS.border }]} 
                placeholder={TXT.p12PasswordPlaceholder} 
                placeholderTextColor={COLORS.textMuted} 
                secureTextEntry 
                value={certPassword} 
                onChangeText={setCertPassword} 
                autoFocus 
              />
              <View style={styles.pwdBtnRow}>
                <TouchableOpacity 
                  style={[styles.pwdBtnCancel, { backgroundColor: isLight ? '#E5E5EA' : 'rgba(255,255,255,0.06)' }]} 
                  onPress={() => { setPwdModalVisible(false); setTimeout(() => setCertModalVisible(true), 500); }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: '600' }}>{TXT.cancelBtn}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pwdBtnSave, { backgroundColor: COLORS.primary }]} onPress={saveCertToStorage}>
                  <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>{TXT.completeBtn}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* TECH SPECS MODAL */}
      <Modal visible={infoModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBgCentered}>
          <GlassView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.infoBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
            <Award color={COLORS.primary} size={42} style={{ marginBottom: 12 }} />
            <Text style={[styles.modalTitle, { color: COLORS.text, marginBottom: 4 }]}>VSign</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 20 }}>{TXT.langName === 'English' ? 'v1.2.0 Offline C++ Edition' : 'Phiên bản v1.2.0 Offline C++'}</Text>

            <View style={{ width: '100%', gap: 14 }}>
              <View style={styles.infoRow}>
                <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{TXT.coreCppEngine}</Text>
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>zsign v0.7 Stable</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>OpenSSL:</Text>
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>v3.x.x Universal</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{TXT.environmentLabel}</Text>
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>iOS Sandbox Native</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.infoCloseBtn, { backgroundColor: COLORS.primary }]}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>{TXT.closeLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>



    </ScrollView>
  );
}

const getStyles = (theme: typeof COLORS, isLight: boolean) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 150 },
  header: { marginBottom: 30 },
  backBtn: { 
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceSolid,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  backBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  largeTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, marginTop: 4 },
  
  sectionHeader: { marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  
  cardGroup: { borderRadius: SIZES.radiusCard, borderWidth: 0.8, overflow: 'hidden' },
  rowItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 16 },
  rowItemNoPress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 },
  rowLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRightSide: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowValLabel: { fontSize: 14, maxWidth: '80%' },
  rowDivider: { height: 0.8, marginLeft: 46 },
  
  themePickerContainer: { marginVertical: 4 },
  themeScroll: { gap: 10, paddingHorizontal: 2 },
  themePill: { borderRadius: SIZES.radiusCard, borderWidth: 1.5, padding: 12, width: 140, height: 75, justifyContent: 'center' },
  themePillSelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
      },
      android: {
        elevation: 3,
      }
    })
  },
  themePillContent: { gap: 6 },
  swatchRow: { flexDirection: 'row', gap: 4 },
  swatch: { width: 14, height: 6, borderRadius: 3 },
  themeLabel: { fontSize: 13, fontWeight: '600' },

  segmentedControl: { flexDirection: 'row', borderRadius: 9, padding: 2, width: 160 },
  segmentBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 7, height: 30 },
  segmentBtnActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 1.5,
      },
      android: {
        elevation: 2,
      }
    })
  },
  segmentText: { fontSize: 13, fontWeight: '600' },

  modalBg: { flex: 1, justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: SIZES.radiusSquircle, borderTopRightRadius: SIZES.radiusSquircle, padding: 24, paddingBottom: 40, borderWidth: 1, height: '78%', alignItems: 'center' },
  modalHeaderIndicator: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(128,128,128,0.25)', marginBottom: 20 },
  closeModalBtn: { position: 'absolute', top: 20, right: 20, zIndex: 10, padding: 6, backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  modalSub: { fontSize: 13, marginTop: 4, marginBottom: 24, textAlign: 'center', paddingHorizontal: 16 },
  addCertBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,122,255,0.06)', padding: 14, borderRadius: SIZES.radiusButton, borderWidth: 1, borderStyle: 'dashed', marginBottom: 20, width: '100%', gap: 8 },
  addCertText: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, width: '100%' },
  emptyText: { textAlign: 'center', fontSize: 14, opacity: 0.8 },
  certCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: SIZES.radiusCard, borderWidth: 1, marginBottom: 12, width: '100%' },
  certCardBody: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  activeStatusDot: { width: 8, height: 8, borderRadius: 4 },
  certNameText: { fontSize: 15, fontWeight: '700', marginBottom: 2, letterSpacing: -0.2 },
  certDetailText: { fontSize: 11, marginTop: 1 },
  deleteBtn: { padding: 8, opacity: 0.7 },

  modalBgCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  keyboardView: { width: '100%', alignItems: 'center' },
  pwdBox: { width: '100%', padding: 24, borderRadius: SIZES.radiusSquircle, alignItems: 'center', borderWidth: 1 },
  pwdTitle: { fontSize: 18, fontWeight: '800' },
  pwdSub: { fontSize: 13, marginBottom: 20, textAlign: 'center', paddingHorizontal: 12, lineHeight: 18 },
  pwdInput: { width: '100%', height: 48, borderRadius: SIZES.radiusButton, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, textAlign: 'center', fontWeight: '600' },
  pwdBtnRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  pwdBtnCancel: { flex: 1, height: 48, borderRadius: SIZES.radiusButton, justifyContent: 'center', alignItems: 'center' },
  pwdBtnSave: { flex: 1, height: 48, borderRadius: SIZES.radiusButton, justifyContent: 'center', alignItems: 'center' },

  infoBox: { width: '100%', padding: 24, borderRadius: SIZES.radiusSquircle, alignItems: 'center', borderWidth: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(128,128,128,0.1)' },
  infoCloseBtn: { width: '100%', height: 48, borderRadius: SIZES.radiusButton, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  switchWrapper: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  switchDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  }
});
