import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Image, DeviceEventEmitter, InteractionManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import JSZip from 'jszip';
import * as Notifications from 'expo-notifications'; 

import { requireNativeModule } from 'expo-modules-core';
const IpaSigner = (() => {
  if (Platform.OS === 'web') return null;
  try {
    return requireNativeModule('IpaSigner');
  } catch (e) {
    return null;
  }
})();

import { FileArchive, Share, Trash2, FolderOpen, Layers, Wrench, X, FileKey, CheckCircle2, Rocket, PlusCircle, ShieldCheck, MoreVertical, Sliders, ChevronDown, ImagePlus, ArrowLeft, Folder } from 'lucide-react-native';
import { COLORS, useThemeUpdate, TXT } from '../../constants/theme';
import { TabTransition } from '../../components/ui/TabTransition';
import { startStaticServer } from '../../utils/staticServer';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';

const INSTALLER_WORKER_URL = "https://ipaviet-installer.clonene121212.workers.dev";

interface LocalFile { name: string; uri: string; size: string; timestamp: number; }
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

export default function SignScreen() {
  useThemeUpdate();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ipa' | 'installed'>('ipa');
  const [menuVisible, setMenuVisible] = useState(false);
  const [savedCerts, setSavedCerts] = useState<CertItem[]>([]);
  const [selectedCert, setSelectedCert] = useState<CertItem | null>(null);
  const [signModalVisible, setSignModalVisible] = useState(false);
  const [selectedIpa, setSelectedIpa] = useState<LocalFile | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [tempZipData, setTempZipData] = useState<any>(null);
  const [certPassword, setCertPassword] = useState('');
  const [isUnzipping, setIsUnzipping] = useState(false);

  // Advanced Signing Options States
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customAppName, setCustomAppName] = useState('');
  const [customBundleId, setCustomBundleId] = useState('');
  const [customIconUri, setCustomIconUri] = useState<string | null>(null);
  const [customIconName, setCustomIconName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [isLoadingIpaInfo, setIsLoadingIpaInfo] = useState(false);
  const [originalIpaInfo, setOriginalIpaInfo] = useState<{ bundleId: string; appName: string } | null>(null);
  const [signingProgress, setSigningProgress] = useState('');
  const [cloneQuantity, setCloneQuantity] = useState('1');

  const handleSelectIpa = async (item: LocalFile) => {
    setSelectedIpa(item);
    setSignModalVisible(true);
    
    // Reset Advanced Options states
    setShowAdvanced(false);
    setCustomAppName('');
    setCustomBundleId('');
    setCustomIconUri(null);
    setCustomIconName('');
    setIsCloning(false);
    setOriginalIpaInfo(null);
    setIsLoadingIpaInfo(true);
    
    try {
      const { getIpaInfo } = require('../../modules/ipa-signer');
      const info = await getIpaInfo(item.uri);
      if (info && info.bundleId && info.appName) {
        setOriginalIpaInfo(info);
        setCustomAppName(info.appName);
        setCustomBundleId(info.bundleId);
      }
    } catch (e) {
      console.warn("Lỗi đọc thông tin IPA:", e);
      const nameWithoutExt = item.name.replace(/\.ipa$/i, '');
      setCustomAppName(nameWithoutExt);
      setCustomBundleId('com.ipaviet.app');
    } finally {
      setIsLoadingIpaInfo(false);
    }
  };

  const pickCustomIcon = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          TXT.langName === 'English' ? 'Permission Denied' : 'Quyền bị từ chối', 
          TXT.langName === 'English' ? 'We need permission to access your photo library.' : 'Ứng dụng cần quyền truy cập thư viện ảnh để chọn Logo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCustomIconUri(asset.uri);
        let fileName = asset.fileName || '';
        if (!fileName) {
          const parts = asset.uri.split('/');
          fileName = parts[parts.length - 1];
        }
        if (!fileName.endsWith('.png')) {
          fileName = 'custom_icon.png';
        }
        setCustomIconName(fileName);
      }
    } catch (e) {
      Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? 'Failed to select icon.' : 'Không thể chọn ảnh làm logo.');
    }
  };

  const handleToggleCloning = (val: boolean) => {
    setIsCloning(val);
    if (val) {
      if (customBundleId && !customBundleId.endsWith('.clone')) {
        setCustomBundleId(prev => prev + '.clone');
      }
    } else {
      setCloneQuantity('1');
      if (customBundleId && customBundleId.endsWith('.clone')) {
        setCustomBundleId(prev => prev.slice(0, -6));
      }
    }
  };

  const lastScrollY = useRef(0);
  const isTabBarHidden = useRef(false);

  const handleScroll = (event: any) => {
    const value = event.nativeEvent.contentOffset.y;
    if (value < 0) return;
    const diff = value - lastScrollY.current;
    
    if (diff > 35 && value > 100) {
      if (!isTabBarHidden.current) {
        isTabBarHidden.current = true;
        DeviceEventEmitter.emit('hideTabBar');
      }
    } else if (diff < -35 || value < 20) {
      if (isTabBarHidden.current) {
        isTabBarHidden.current = false;
        DeviceEventEmitter.emit('showTabBar');
      }
    }
    lastScrollY.current = value;
  };

  // 1. ÉP APPLE HIỆN THƯ MỤC: Tạo một file hiển thị rõ ràng
  const forceIOSFolderCreation = async () => {
    try {
      const dummyFile = FileSystem.documentDirectory + 'HuongDan_IPA.txt';
      await FileSystem.writeAsStringAsync(dummyFile, 'Thư mục này dùng để lưu trữ file IPA của bạn.');
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { 
    isTabBarHidden.current = false;
    DeviceEventEmitter.emit('showTabBar');
    forceIOSFolderCreation();
    
    // Defer heavy file system reading until after the tab transition animation completes
    const task = InteractionManager.runAfterInteractions(() => {
      loadDownloadedFiles(); 
      loadSavedCerts();
    });

    if (IpaSigner) {
      IpaSigner.endBackgroundTask().catch(() => {});
    }
    if (params && params.importCert === 'true') {
      router.setParams({ importCert: '' });
      setTimeout(() => {
        importCertFromZip();
      }, 300);
    }
    return () => task.cancel();
  }, [activeTab, params?.importCert]));

  const loadDownloadedFiles = async () => {
    setLoading(true);
    try {
      const dir = FileSystem.documentDirectory;
      if (!dir) return;
      const files = await FileSystem.readDirectoryAsync(dir);
      
      const ipaFiles = files.filter(f => f.endsWith('.ipa') && !f.startsWith('signed_')); 
      const signedFiles = files.filter(f => f.startsWith('signed_') && f.endsWith('.ipa')); 

      const fileData = await Promise.all(
        (activeTab === 'ipa' ? ipaFiles : signedFiles).map(async (filename) => {
          const fileUri = dir + filename;
          const info = await FileSystem.getInfoAsync(fileUri);
          return { name: filename, uri: fileUri, size: info.exists ? (info.size / 1024 / 1024).toFixed(1) + ' MB' : '0 MB', timestamp: info.exists ? info.modificationTime : 0 };
        })
      );
      fileData.sort((a, b) => b.timestamp - a.timestamp);
      setLocalFiles(fileData as LocalFile[]);
    } catch (error) {}
    setLoading(false);
  };

  useEffect(() => { loadDownloadedFiles(); }, [activeTab]);

  const handleShare = async (uri: string) => { try { const canShare = await Sharing.isAvailableAsync(); if (canShare) await Sharing.shareAsync(uri); } catch (error) {} };
  
  const handleDelete = (uri: string, name: string) => {
    Alert.alert(TXT.deleteFile, `${TXT.deleteFileConfirm} ${name}?`, [ { text: TXT.cancelBtn || "Hủy", style: "cancel" }, { text: TXT.langName === 'English' ? "Delete" : "Xóa", style: "destructive", onPress: async () => { await FileSystem.deleteAsync(uri); loadDownloadedFiles(); } } ]);
  };

  // Import IPA
  const importIpaFile = () => {
    setMenuVisible(false);
    setTimeout(async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        
        const file = result.assets[0];
        if (!file.name.toLowerCase().endsWith('.ipa')) {
          return Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? "Please select a file with .ipa extension" : "Vui lòng chọn file có đuôi .ipa");
        }

        setLoading(true);
        const newUri = FileSystem.documentDirectory + file.name.replace(/\s+/g, '_'); 
        await FileSystem.copyAsync({ from: file.uri, to: newUri });
        
        Alert.alert(TXT.successLabel, TXT.langName === 'English' ? "IPA file added to storage!" : "Đã thêm file IPA vào kho!");
        loadDownloadedFiles();
      } catch (error: any) {
        Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? "Cannot retrieve file, please try again." : "Không thể lấy file, vui lòng thử lại.");
      } finally {
        setLoading(false);
      }
    }, 500); 
  };

  // Load saved certs and select active cert
  const loadSavedCerts = async () => {
    try {
      const certsJson = await AsyncStorage.getItem('@saved_certs');
      if (certsJson) {
        const certs = JSON.parse(certsJson) as CertItem[];
        setSavedCerts(certs);
        
        const activeId = await AsyncStorage.getItem('@active_cert_id');
        if (activeId) {
          const active = certs.find(c => c.id === activeId);
          if (active) {
            setSelectedCert(active);
            return;
          }
        }
        if (certs.length > 0) {
          setSelectedCert(certs[0]);
        }
      }
    } catch (error) {}
  };

  const importCertFromZip = () => {
    setSignModalVisible(false);
    setTimeout(async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (result.canceled || !result.assets || result.assets.length === 0) {
          setSignModalVisible(true);
          return;
        }
        
        const file = result.assets[0];
        if (!file.name.toLowerCase().endsWith('.zip')) {
          Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? "Please select a .zip file containing the certificate." : "Vui lòng chọn tệp .zip chứa chứng chỉ.");
          setSignModalVisible(true);
          return;
        }

        setIsUnzipping(true);
        setSignModalVisible(true);
        
        const b64Data = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(b64Data, { base64: true });

        let p12Data = null, provData = null, p12Name = '', provName = '';

        for (const [path, zipObj] of Object.entries(zip.files)) {
          if (!zipObj.dir) {
            if (path.toLowerCase().endsWith('.p12')) { p12Data = await zipObj.async('base64'); p12Name = path.split('/').pop() || 'cert.p12'; }
            if (path.toLowerCase().endsWith('.mobileprovision')) { provData = await zipObj.async('base64'); provName = path.split('/').pop() || 'cert.mobileprovision'; }
          }
        }

        if (!p12Data || !provData) {
          setIsUnzipping(false);
          Alert.alert(TXT.langName === 'English' ? 'ZIP Error' : 'Lỗi ZIP', TXT.langName === 'English' ? 'Invalid ZIP file. It must contain at least one .p12 and one .mobileprovision file.' : 'Tệp ZIP không hợp lệ. Bên trong phải chứa ít nhất 1 file .p12 và 1 file .mobileprovision');
          return;
        }

        setTempZipData({ p12Data, provData, p12Name, provName, zipName: file.name.replace('.zip', '') });
        setCertPassword('');
        setIsUnzipping(false);
        setSignModalVisible(false);
        
        setTimeout(() => setPwdModalVisible(true), 500);

      } catch (error: any) {
        setIsUnzipping(false);
        setSignModalVisible(true);
        Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? "Cannot read ZIP file." : "Không thể đọc file ZIP.");
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
      
      // Đồng thời đặt làm active certificate
      await AsyncStorage.setItem('@active_cert_id', id);
      setSelectedCert(newCert); 
      
      setTimeout(() => {
        setSignModalVisible(true);
        Alert.alert(TXT.successLabel, TXT.langName === 'English' ? "Certificate loaded!" : "Chứng chỉ đã được nạp!");
      }, 500);
      
    } catch (error) {
      Alert.alert(TXT.errorLabel, TXT.langName === 'English' ? "Cannot save certificate to device." : "Không thể lưu chứng chỉ vào máy.");
    }
  };

  const deleteCert = async (id: string) => {
    Alert.alert(TXT.deleteCertTitle, TXT.deleteCertConfirm, [
      { text: TXT.cancelBtn, style: "cancel" },
      { text: TXT.langName === 'English' ? 'Delete' : 'Xóa', style: "destructive", onPress: async () => {
          const updated = savedCerts.filter(c => c.id !== id);
          setSavedCerts(updated);
          await AsyncStorage.setItem('@saved_certs', JSON.stringify(updated));
          if (selectedCert?.id === id) {
            const nextActive = updated.length > 0 ? updated[0] : null;
            setSelectedCert(nextActive);
            if (nextActive) {
              await AsyncStorage.setItem('@active_cert_id', nextActive.id);
            } else {
              await AsyncStorage.removeItem('@active_cert_id');
            }
          }
      }}
    ]);
  };

  const signNextClone = async (index: number, total: number) => {
    const bgMode = await AsyncStorage.getItem('@background_mode') === 'true';
    if (index > total) {
      if (bgMode) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: TXT.langName === 'English' ? "Cloning Completed" : "Hoàn tất nhân bản",
              body: TXT.langName === 'English' 
                ? `All ${total} clones signed successfully!` 
                : `Đã ký và chuẩn bị xong tất cả ${total} bản sao!`,
              sound: true,
            },
            trigger: null,
          });
        } catch (e) {}
      }
      if (bgMode && IpaSigner) {
        try { await IpaSigner.endBackgroundTask(); } catch (e) {}
      }
      Alert.alert(
        TXT.langName === 'English' ? "Completed" : "Hoàn tất", 
        TXT.langName === 'English' ? `All ${total} clones signed successfully!` : `Đã ký và chuẩn bị xong tất cả ${total} bản sao!`
      );
      setIsSigning(false);
      setSignModalVisible(false);
      loadDownloadedFiles();
      return;
    }
    
    setSigningProgress(TXT.langName === 'English' ? `Signing clone ${index}/${total}...` : `Đang ký bản sao ${index}/${total}...`);
    
    try {
      const originalBundle = originalIpaInfo?.bundleId || 'com.ipaviet.app';
      const cleanOriginalBundle = originalBundle.endsWith('.clone') ? originalBundle.slice(0, -6) : originalBundle;
      const cloneBundleId = `${cleanOriginalBundle}.clone${index}`;
      
      const originalName = originalIpaInfo?.appName || selectedIpa!.name.replace(/\.ipa$/i, '');
      const cleanOriginalName = originalName.replace(/\s+Clone\s+\d+$/i, '');
      const cloneAppName = `${cleanOriginalName} Clone ${index}`;
      
      const { signAppOffline } = require('../../modules/ipa-signer');
      const result = await signAppOffline(
        selectedIpa!.uri, 
        selectedCert!.p12Uri, 
        selectedCert!.provUri, 
        selectedCert!.password,
        cloneBundleId,
        cloneAppName,
        customIconUri || ''
      );
      
      const signedFileName = result.outputPath.split('/').pop();
      const signedFileDir = result.outputPath.substring(0, result.outputPath.lastIndexOf('/'));
      const serverUrl = await startStaticServer(signedFileDir);
      const localIpaUrl = `${serverUrl}/${signedFileName}`;
      
      const bundleId = result.bundleId || cloneBundleId;
      const iconUrl = customIconUri ? `https://ui-avatars.com/api/?name=${encodeURIComponent(cloneAppName)}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(cloneAppName)}&background=0A84FF&color=fff&size=512`;
      
      const plistUrl = `${INSTALLER_WORKER_URL}/?plist=true&ipa=${encodeURIComponent(localIpaUrl)}&name=${encodeURIComponent(cloneAppName)}&bundle=${encodeURIComponent(bundleId)}&icon=${encodeURIComponent(iconUrl)}&version=1.0`;
      const directInstallUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(plistUrl)}`;
      
      if (bgMode) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: TXT.langName === 'English' ? `Clone Ready (${index}/${total})` : `Bản sao đã sẵn sàng (${index}/${total})`,
              body: TXT.langName === 'English'
                ? `"${cloneAppName}" is signed. Open the app to trigger installation.`
                : `Bản sao "${cloneAppName}" đã ký xong. Vui lòng mở ứng dụng để cài đặt.`,
              sound: true,
            },
            trigger: null,
          });
        } catch (e) {
          console.warn("Failed to schedule notification", e);
        }
      }

      Alert.alert(
        TXT.langName === 'English' ? `Clone Ready (${index}/${total})` : `Bản sao đã sẵn sàng (${index}/${total})`, 
        TXT.langName === 'English' ? `"${cloneAppName}" is signed. Press Install and wait a moment for the next clone prompt.` : `Bản sao "${cloneAppName}" đã ký thành công. Bấm Cài đặt để bắt đầu tải trực tiếp trên thiết bị, hệ thống sẽ tự ký bản sao tiếp theo.`,
        [
          { 
            text: TXT.langName === 'English' ? "Stop Process" : "Dừng lại", 
            style: "cancel", 
            onPress: async () => {
              setIsSigning(false);
              setSignModalVisible(false);
              loadDownloadedFiles();
              if (bgMode && IpaSigner) {
                try { await IpaSigner.endBackgroundTask(); } catch (e) {}
              }
            }
          },
          { 
            text: TXT.langName === 'English' ? "Install Now" : "Cài đặt ngay", 
            onPress: async () => {
              try {
                if (IpaSigner) await IpaSigner.startBackgroundTask();
              } catch (e) {}
              
              Linking.openURL(directInstallUrl);
              
              setTimeout(() => {
                signNextClone(index + 1, total);
              }, 1500);
            }
          }
        ]
      );
      
    } catch (error: any) {
      if (bgMode) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: TXT.langName === 'English' ? `Clone ${index} Error` : `Lỗi bản sao ${index}`,
              body: error.message || "Có lỗi xảy ra.",
              sound: true,
            },
            trigger: null,
          });
        } catch (e) {}
      }
      Alert.alert(
        TXT.langName === 'English' ? `Clone ${index} Error` : `Lỗi bản sao ${index}`, 
        error.message || "Có lỗi xảy ra.",
        [
          { text: TXT.langName === 'English' ? "Stop" : "Dừng ký", style: "cancel", onPress: async () => { 
              setIsSigning(false); 
              loadDownloadedFiles(); 
              if (bgMode && IpaSigner) {
                try { await IpaSigner.endBackgroundTask(); } catch (e) {}
              }
            } 
          },
          { text: TXT.langName === 'English' ? "Skip & Continue" : "Bỏ qua & Tiếp tục", onPress: () => signNextClone(index + 1, total) }
        ]
      );
    }
  };

  const handleStartSign = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(TXT.langName === 'English' ? 'Not Available' : "Không khả dụng", TXT.langName === 'English' ? 'Offline signing and installation of IPA is only supported on physical iOS devices.' : "Tính năng ký và cài đặt IPA ngoại tuyến chỉ được hỗ trợ trên thiết bị iOS thực tế.");
      return;
    }
    if (!IpaSigner) {
      Alert.alert(TXT.langName === 'English' ? 'Expo Go Limitations' : "Hạn chế của Expo Go", TXT.langName === 'English' ? 'Signing and installing IPAs requires a development build because it uses a custom native module. You cannot run this on Expo Go.' : "Tính năng ký và cài đặt IPA yêu cầu bản build phát triển (Development Build) vì sử dụng mô-đun native tự viết. Sếp không thể chạy tính năng này trên Expo Go.");
      return;
    }
    if (!selectedCert || !selectedIpa) return Alert.alert(TXT.langName === 'English' ? 'Missing' : "Thiếu", TXT.selectIpaCert);
    
    const bgMode = await AsyncStorage.getItem('@background_mode') === 'true';
    if (bgMode && IpaSigner) {
      try {
        await IpaSigner.startBackgroundTask();
      } catch (e) {
        console.warn("Failed to start background task before manual signing", e);
      }
    }

    setIsSigning(true);
    
    const qty = isCloning ? parseInt(cloneQuantity, 10) || 1 : 1;
    
    if (qty > 1) {
      signNextClone(1, qty);
    } else {
      setSigningProgress(TXT.coreSigningText);
      try {
        const { signAppOffline } = require('../../modules/ipa-signer');
        const result = await signAppOffline(
          selectedIpa.uri, 
          selectedCert.p12Uri, 
          selectedCert.provUri, 
          selectedCert.password,
          customBundleId !== originalIpaInfo?.bundleId ? customBundleId : '',
          customAppName !== originalIpaInfo?.appName ? customAppName : '',
          customIconUri || ''
        );
        setIsSigning(false);
        setSignModalVisible(false);

        const appName = customAppName || selectedIpa.name.replace(/\.ipa$/i, '');
        const signedFileName = result.outputPath.split('/').pop();
        const signedFileDir = result.outputPath.substring(0, result.outputPath.lastIndexOf('/'));
        
        const serverUrl = await startStaticServer(signedFileDir);
        const localIpaUrl = `${serverUrl}/${signedFileName}`;
        
        const bundleId = result.bundleId || 'com.ipaviet.app';
        const iconUrl = customIconUri ? `https://ui-avatars.com/api/?name=${encodeURIComponent(appName)}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(appName)}&background=0A84FF&color=fff&size=512`;
        
        const plistUrl = `${INSTALLER_WORKER_URL}/?plist=true&ipa=${encodeURIComponent(localIpaUrl)}&name=${encodeURIComponent(appName)}&bundle=${encodeURIComponent(bundleId)}&icon=${encodeURIComponent(iconUrl)}&version=1.0`;
        const directInstallUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(plistUrl)}`;

        if (bgMode) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: TXT.langName === 'English' ? 'App Signed Successfully!' : 'Ký App Thành Công!',
                body: TXT.langName === 'English' 
                  ? `"${appName}" has been signed. Tap to install directly.` 
                  : `Ứng dụng "${appName}" đã được ký xong. Bấm vào đây để cài đặt trực tiếp.`,
                sound: true,
                data: { installUrl: directInstallUrl }
              },
              trigger: null,
            });
          } catch (e) {}
        }

        // TỰ ĐỘNG HIỆN POPUP CÀI ĐẶT CỦA HỆ THỐNG
        try {
          if (IpaSigner) await IpaSigner.startBackgroundTask();
        } catch (e) {
          console.warn("Failed to start background task", e);
        }
        Linking.openURL(directInstallUrl);

        Alert.alert(TXT.signSuccessTitle, TXT.signSuccessSub, [
            { text: TXT.laterBtn, style: "cancel", onPress: async () => { 
                loadDownloadedFiles(); 
                if (bgMode && IpaSigner) {
                  try { await IpaSigner.endBackgroundTask(); } catch (e) {}
                }
              } 
            }, 
            { text: TXT.installNowBtn, onPress: () => { Linking.openURL(directInstallUrl); loadDownloadedFiles(); }}
        ]);

        setTimeout(async () => {
          try {
            if (IpaSigner) await IpaSigner.endBackgroundTask();
          } catch (e) {}
        }, 60000);
      } catch (error: any) {
        setIsSigning(false);
        const appName = customAppName || selectedIpa.name.replace(/\.ipa$/i, '');
        if (bgMode) {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: TXT.langName === 'English' ? 'App Signing Failed' : 'Ký App Thất Bại',
                body: TXT.langName === 'English'
                  ? `Could not sign "${appName}": ${error.message}`
                  : `Không thể ký "${appName}": ${error.message}`,
                sound: true,
              },
              trigger: null,
            });
          } catch (e) {}
        }
        if (bgMode && IpaSigner) {
          try { await IpaSigner.endBackgroundTask(); } catch (e) {}
        }
        Alert.alert(TXT.langName === 'English' ? 'Signing Error' : "Lỗi Ký App", error.message || TXT.signFailure);
      }
    }
  };

  const renderItem = ({ item }: { item: LocalFile }) => (
    <View style={[styles.fileCard, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.iconBox, { backgroundColor: COLORS.surfaceAccent }]}><FileArchive color={COLORS.primary} size={28} /></View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: COLORS.text }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.fileSize, { color: COLORS.textMuted }]}>{item.size} • {TXT.langName === 'English' ? 'Saved' : 'Đã lưu'}</Text>
        </View>
      </View>
      <View style={[styles.actionGroup, { borderColor: COLORS.border }]}>
        {activeTab === 'ipa' && (
          <TouchableOpacity style={[styles.iconBtn, {backgroundColor: 'rgba(50, 215, 75, 0.15)', borderColor: 'rgba(50, 215, 75, 0.3)', borderWidth: 1}]} onPress={() => handleSelectIpa(item)}>
            <Wrench color="#32D74B" size={20} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.surface }]} onPress={() => handleShare(item.uri)}><Share color={COLORS.text} size={20} /></TouchableOpacity>
        <TouchableOpacity style={[styles.iconBtn, {backgroundColor: 'rgba(255, 69, 58, 0.15)'}]} onPress={() => handleDelete(item.uri, item.name)}><Trash2 color="#FF453A" size={20} /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <StatusBar style={COLORS.background === '#F4F4F6' ? 'dark' : 'light'} />
      <View style={[styles.header, { borderColor: COLORS.border }]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <TouchableOpacity style={{ padding: 4 }} onPress={() => router.replace('/')}>
              <ArrowLeft color={COLORS.text} size={24} />
            </TouchableOpacity>
            <Text style={[styles.largeTitle, { color: COLORS.text }]}>{TXT.signAppTitle} <Wrench color={COLORS.primary} size={26} strokeWidth={2.5} /></Text>
          </View>
          <TouchableOpacity style={{padding: 5}} onPress={() => setMenuVisible(true)}>
            <MoreVertical color={COLORS.text} size={28} />
          </TouchableOpacity>
        </View>

        {(() => {
          const isLight = COLORS.background === '#F4F4F6';
          return (
            <View style={[
              styles.tabContainer, 
              { 
                backgroundColor: isLight ? '#E5E5EA' : COLORS.surfaceSolid, 
                borderColor: COLORS.border 
              }
            ]}>
              <TouchableOpacity 
                style={[
                  styles.tab, 
                  activeTab === 'ipa' && [
                    styles.tabActive, 
                    { backgroundColor: isLight ? '#FFFFFF' : COLORS.surface }
                  ]
                ]} 
                onPress={() => setActiveTab('ipa')}
              >
                <Text style={[
                  styles.tabText, 
                  activeTab === 'ipa' && [
                    styles.tabTextActive, 
                    { color: isLight ? COLORS.primary : '#FFFFFF' }
                  ]
                ]}>
                  {TXT.originalIpaShort}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.tab, 
                  activeTab === 'installed' && [
                    styles.tabActive, 
                    { backgroundColor: isLight ? '#FFFFFF' : COLORS.surface }
                  ]
                ]} 
                onPress={() => setActiveTab('installed')}
              >
                <Text style={[
                  styles.tabText, 
                  activeTab === 'installed' && [
                    styles.tabTextActive, 
                    { color: isLight ? COLORS.primary : '#FFFFFF' }
                  ]
                ]}>
                  {TXT.signedIpaShort}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>

      {loading ? ( <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} /> ) : localFiles.length === 0 ? (
          <View style={styles.centerBox}><FolderOpen color={COLORS.textMuted} size={64} strokeWidth={1.5} /><Text style={[styles.emptyText, { color: COLORS.text }]}>{TXT.emptyStore}</Text></View>
      ) : (
          <FlatList 
            data={localFiles} 
            keyExtractor={(item) => item.uri} 
            renderItem={renderItem} 
            contentContainerStyle={styles.listContent} 
            showsVerticalScrollIndicator={false}
          /> 
      )}


      {/* MODAL MENU 3 CHẤM */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={importIpaFile}>
              <PlusCircle color={COLORS.primary} size={22} />
              <Text style={[styles.menuText, { color: COLORS.text }]}>{TXT.addIpa}</Text>
            </TouchableOpacity>
            <View style={{height: 1, backgroundColor: COLORS.border}} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/app-manager'); }}>
              <Folder color="#00F0FF" size={22} />
              <Text style={[styles.menuText, { color: COLORS.text }]}>Quản lý App & Filza</Text>
            </TouchableOpacity>
            <View style={{height: 1, backgroundColor: COLORS.border}} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/settings'); }}>
              <FileKey color="#FFD700" size={22} />
              <Text style={[styles.menuText, { color: COLORS.text }]}>{TXT.manageCert}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL KÝ APP & CHỨNG CHỈ */}
      <Modal visible={signModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
            <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: COLORS.surface }]} onPress={() => !isSigning && setSignModalVisible(false)}><X color="#888" size={24} /></TouchableOpacity>
            
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>{selectedIpa ? TXT.selectCert : TXT.certStore}</Text>
            {selectedIpa && <Text style={[styles.modalSub, { color: COLORS.primary }]} numberOfLines={1}>{TXT.langName === 'English' ? 'IPA File:' : 'File IPA:'} {selectedIpa.name}</Text>}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 20, paddingTop: 10}} style={{ width: '100%' }}>
              
              <TouchableOpacity 
                style={[
                  styles.addCertBtn, 
                  { 
                    backgroundColor: COLORS.background === '#F4F4F6' ? 'rgba(0,122,255,0.06)' : 'rgba(255,255,255,0.03)', 
                    borderColor: COLORS.primary 
                  }
                ]} 
                onPress={importCertFromZip} 
                disabled={isUnzipping}
              >
                 {isUnzipping ? <ActivityIndicator color={COLORS.primary} /> : <PlusCircle color={COLORS.primary} size={24} />}
                 <Text style={[styles.addCertText, { color: COLORS.primary }]}>{isUnzipping ? TXT.unzippingText : TXT.importZip}</Text>
              </TouchableOpacity>

              {savedCerts.length === 0 && <Text style={{color: COLORS.textMuted, textAlign: 'center', marginTop: 20}}>{TXT.noCertsSavedText}</Text>}
              
              {savedCerts.map((cert) => {
                const isSelected = selectedCert?.id === cert.id;
                return (
                  <TouchableOpacity key={cert.id} style={[styles.certCard, { backgroundColor: COLORS.surfaceCard, borderColor: isSelected ? COLORS.success : COLORS.border }]} onPress={() => setSelectedCert(cert)}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                       {isSelected ? <CheckCircle2 color={COLORS.success} size={24} style={{marginRight: 15}}/> : <FileKey color={COLORS.textMuted} size={24} style={{marginRight: 15}}/>}
                       <View style={{flex: 1}}>
                          <Text style={[styles.certName, { color: isSelected ? COLORS.success : COLORS.text }]}>{cert.profileName || cert.name}</Text>
                          <Text style={[styles.certSub, { color: COLORS.textMuted }]} numberOfLines={1}>{TXT.enterpriseLabel} {cert.teamName || (TXT.langName === 'English' ? 'Unknown' : 'Không rõ')} ({cert.teamId || 'N/A'})</Text>
                          <Text style={[styles.certSub, cert.isExpired ? {color: COLORS.danger} : {color: COLORS.textMuted}]} numberOfLines={1}>{TXT.expirationLabel} {cert.expirationDate || (TXT.langName === 'English' ? 'Unknown' : 'Không rõ')} {cert.isExpired ? (TXT.langName === 'English' ? '(Expired)' : '(Đã hết hạn)') : ''}</Text>
                       </View>
                    </View>
                    <TouchableOpacity style={{padding: 10}} onPress={() => deleteCert(cert.id)}><Trash2 color={COLORS.danger} size={18}/></TouchableOpacity>
                  </TouchableOpacity>
                )
              })}

              {selectedIpa && (
                <>
                  <TouchableOpacity 
                    style={[styles.advancedHeader, { borderColor: COLORS.border }]} 
                    activeOpacity={0.7} 
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAdvanced(!showAdvanced);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Sliders color={COLORS.primary} size={18} />
                      <Text style={[styles.advancedHeaderText, { color: COLORS.text }]}>
                        {TXT.langName === 'English' ? 'Advanced Options (Optional)' : 'Tùy chọn ký nâng cao (Không bắt buộc)'}
                      </Text>
                    </View>
                    <ChevronDown color={COLORS.textMuted} size={18} style={{ transform: [{ rotate: showAdvanced ? '180deg' : '0deg' }] }} />
                  </TouchableOpacity>

                  {showAdvanced && (
                    <View style={[styles.advancedContent, { borderColor: COLORS.border }]}>
                      {isLoadingIpaInfo ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                          <ActivityIndicator size="small" color={COLORS.primary} />
                          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                            {TXT.langName === 'English' ? 'Reading IPA info...' : 'Đang đọc thông tin tệp IPA...'}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ gap: 12, width: '100%', paddingHorizontal: 4 }}>
                          {/* Tên ứng dụng */}
                          <View style={styles.inputGroup}>
                            <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>
                              {TXT.langName === 'English' ? 'New App Name' : 'Tên ứng dụng mới'}
                            </Text>
                            <TextInput
                              style={[styles.textInput, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                              value={customAppName}
                              onChangeText={setCustomAppName}
                              placeholder={originalIpaInfo?.appName || "VSign App"}
                              placeholderTextColor="#666"
                            />
                          </View>

                          {/* Bundle ID */}
                          <View style={styles.inputGroup}>
                            <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>
                              {TXT.langName === 'English' ? 'New Bundle ID' : 'Bundle ID mới'}
                            </Text>
                            <TextInput
                              style={[styles.textInput, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                              value={customBundleId}
                              onChangeText={setCustomBundleId}
                              placeholder={originalIpaInfo?.bundleId || "com.company.app"}
                              placeholderTextColor="#666"
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                          </View>

                          {/* Logo/Icon Picker */}
                          <View style={styles.inputGroup}>
                            <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>
                              {TXT.langName === 'English' ? 'New App Logo' : 'Logo ứng dụng mới'}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                              {customIconUri ? (
                                <View style={[styles.iconPreviewBox, { borderColor: COLORS.primary }]}>
                                  <Image source={{ uri: customIconUri }} style={{ width: 44, height: 44, borderRadius: 10 }} />
                                  <TouchableOpacity 
                                    style={styles.removeIconBtn}
                                    onPress={() => {
                                      setCustomIconUri(null);
                                      setCustomIconName('');
                                    }}
                                  >
                                    <X color="#FFF" size={10} />
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                              <TouchableOpacity 
                                style={[styles.pickIconBtn, { backgroundColor: COLORS.surfaceCard, borderColor: COLORS.border, borderWidth: 1 }]}
                                onPress={pickCustomIcon}
                              >
                                <ImagePlus color={COLORS.primary} size={18} />
                                <Text style={[styles.pickIconText, { color: COLORS.text }]} numberOfLines={1}>
                                  {customIconUri ? customIconName : (TXT.langName === 'English' ? 'Choose PNG Image' : 'Chọn hình ảnh PNG')}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Nhân bản ứng dụng */}
                          <View style={[styles.rowItemNoPress, { paddingHorizontal: 0, paddingVertical: 8 }]}>
                            <View style={{ gap: 2 }}>
                              <Text style={[styles.rowLabel, { color: COLORS.text, fontSize: 14 }]}>
                                {TXT.langName === 'English' ? 'Clone Application' : 'Nhân bản ứng dụng'}
                              </Text>
                              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                                {TXT.langName === 'English' ? 'Install alongside the original app' : 'Cho phép cài đặt song song với app gốc'}
                              </Text>
                            </View>
                            <TouchableOpacity 
                              style={[styles.switchWrapper, { backgroundColor: isCloning ? COLORS.success : '#333' }]}
                              activeOpacity={0.8}
                              onPress={() => handleToggleCloning(!isCloning)}
                            >
                              <View style={[styles.switchDot, { transform: [{ translateX: isCloning ? 20 : 2 }] }]} />
                            </TouchableOpacity>
                          </View>

                          {isCloning && (
                            <View style={styles.inputGroup}>
                              <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>
                                {TXT.langName === 'English' ? 'Number of clones' : 'Số lượng bản sao cần ký'}
                              </Text>
                              <TextInput
                                style={[styles.textInput, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                                value={cloneQuantity}
                                onChangeText={(text) => {
                                  const num = text.replace(/[^0-9]/g, '');
                                  setCloneQuantity(num);
                                }}
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#666"
                              />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {selectedIpa && (
              <View style={{paddingTop: 15, borderTopWidth: 1, borderColor: COLORS.border, width: '100%'}}>
                <TouchableOpacity style={[styles.signBtn, { backgroundColor: COLORS.primary }, (!selectedCert || isSigning) && {opacity: 0.5}]} onPress={handleStartSign} disabled={!selectedCert || isSigning}>
                  {isSigning ? (
                    <View style={{flexDirection: 'row', alignItems: 'center'}}><ActivityIndicator color={COLORS.textDark} style={{marginRight: 10}} /><Text style={[styles.signBtnText, { color: COLORS.textDark }]}>{signingProgress || TXT.coreSigningText}</Text></View>
                  ) : (
                    <View style={{flexDirection: 'row', alignItems: 'center'}}><Rocket color={COLORS.textDark} size={20} style={{marginRight: 8}} /><Text style={[styles.signBtnText, { color: COLORS.textDark }]}>{TXT.tapToSignNow}</Text></View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL MẬT KHẨU */}
      <Modal visible={pwdModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBgCentered}>
          <View style={[styles.pwdBox, { backgroundColor: COLORS.surfaceSolid, borderColor: COLORS.border }]}>
             <ShieldCheck color="#FFD700" size={50} style={{marginBottom: 15}}/>
             <Text style={[styles.pwdTitle, { color: COLORS.text }]}>{TXT.securedCert}</Text>
             <Text style={[styles.pwdSub, { color: COLORS.textMuted }]}>{TXT.p12PasswordSub} {tempZipData?.zipName}</Text>
             <TextInput style={[styles.pwdInput, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]} placeholder={TXT.pwdPlaceholder} placeholderTextColor="#555" secureTextEntry value={certPassword} onChangeText={setCertPassword} autoFocus />
             <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
               <TouchableOpacity style={styles.pwdBtnCancel} onPress={() => { setPwdModalVisible(false); setTimeout(() => setSignModalVisible(true), 500); }}><Text style={{color: '#FFF', fontWeight: 'bold'}}>{TXT.cancel}</Text></TouchableOpacity>
               <TouchableOpacity style={[styles.pwdBtnSave, { backgroundColor: COLORS.primary }]} onPress={saveCertToStorage}><Text style={{color: COLORS.textDark, fontWeight: '900'}}>{TXT.saveStore}</Text></TouchableOpacity>
             </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 0.5 },
  largeTitle: { fontSize: 34, fontWeight: '700' },
  tabContainer: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  tabText: { color: '#8E8E93', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 20, fontWeight: '600', marginTop: 15 },
  emptySubText: { color: '#8E8E93', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  listContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 120 }, 
  fileCard: { flexDirection: 'column', padding: 15, borderRadius: 20, marginBottom: 15, borderWidth: 1 },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fileInfo: { flex: 1, marginLeft: 15 },
  fileName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  fileSize: { fontSize: 13 },
  actionGroup: { flexDirection: 'row', gap: 10, marginTop: 15, justifyContent: 'flex-end', paddingTop: 15, borderTopWidth: 0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25, paddingBottom: 40, borderWidth: 1, height: '80%', alignItems: 'center' },
  closeModalBtn: { position: 'absolute', top: 20, right: 20, zIndex: 10, padding: 5, borderRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  modalSub: { fontSize: 14, fontWeight: '600', marginBottom: 20, paddingRight: 30 },
  addCertBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,132,255,0.1)', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(10,132,255,0.3)', borderStyle: 'dashed', marginBottom: 20, width: '100%' },
  addCertText: { fontSize: 15, fontWeight: 'bold', marginLeft: 10 },
  certCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, borderWidth: 1, marginBottom: 12, width: '100%', justifyContent: 'space-between' },
  certCardActive: { borderColor: '#32D74B' },
  certName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  certSub: { fontSize: 12 },
  signBtn: { height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', width: '100%' },
  signBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  modalBgCentered: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pwdBox: { width: '100%', padding: 30, borderRadius: 24, alignItems: 'center', borderWidth: 1 },
  pwdTitle: { fontSize: 18, fontWeight: '900', marginBottom: 5 },
  pwdSub: { fontSize: 13, marginBottom: 20, textAlign: 'center' },
  pwdInput: { width: '100%', height: 55, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, borderWidth: 1, textAlign: 'center', fontWeight: 'bold' },
  pwdBtnCancel: { flex: 1, backgroundColor: '#333', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  pwdBtnSave: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  menuBox: { position: 'absolute', top: 100, right: 20, borderRadius: 16, width: 220, borderWidth: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 5}, shadowOpacity: 0.5, shadowRadius: 10, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 15 },
  menuText: { fontSize: 16, fontWeight: '600' },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 14,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    marginTop: 15,
  },
  advancedHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  advancedContent: {
    width: '100%',
    paddingVertical: 15,
    borderBottomWidth: 0.8,
    alignItems: 'center',
  },
  inputGroup: {
    width: '100%',
    gap: 6,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    width: '100%',
    height: 46,
    borderRadius: 12,
    borderWidth: 0.8,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  pickIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 0.8,
    paddingHorizontal: 14,
  },
  pickIconText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  iconPreviewBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
  },
  removeIconBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF453A',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
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
  },
  rowItemNoPress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  }
});
