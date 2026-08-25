import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  TextInput,
  FlatList,
  Image,
  Animated,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import JSZip from 'jszip';
import {
  Folder,
  FolderTree,
  Trash2,
  Play,
  RefreshCw,
  Search,
  ChevronRight,
  HardDrive,
  ShieldCheck,
  Zap,
  Sparkles,
  FileArchive,
  Gamepad2,
  Layers,
  Cpu,
  CheckCircle2,
  Smartphone,
  Sliders,
  Filter,
  Plus,
  ArrowRight,
  Terminal,
  RotateCcw,
  Check,
  X,
  FileText,
  Info,
} from 'lucide-react-native';
import {
  getInstalledAppContainers,
  cleanContainerCache,
  openInstalledApp,
  listContainerFiles,
  readContainerFile,
  writeContainerFile,
  getContainerStorageBreakdown,
  AppContainerInfo,
  ContainerStorageBreakdown,
} from '../../modules/ipa-signer';
import { COLORS, useThemeUpdate } from '../../constants/theme';
import { TabTransition } from '../../components/ui/TabTransition';

const { width } = Dimensions.get('window');

type ActiveTabSection = 'browser' | 'patches' | 'cleaner' | 'system';
type FilterCategory = 'all' | 'user' | 'games' | 'system';

interface PatchProject {
  id: string;
  name: string;
  targetBundleId: string;
  targetAppName: string;
  description: string;
  createdAt: number;
  filesCount: number;
  dataBase64?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function AppManagerTabScreen() {
  const router = useRouter();
  useThemeUpdate();
  const isLight = COLORS.background === '#F4F4F6';

  const [activeSection, setActiveSection] = useState<ActiveTabSection>('browser');

  // Apps State
  const [apps, setApps] = useState<AppContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [directInput, setDirectInput] = useState('');

  // Storage Cleaner Breakdown State
  const [storageBreakdowns, setStorageBreakdowns] = useState<Record<string, ContainerStorageBreakdown>>({});
  const [isScanningStorage, setIsScanningStorage] = useState(false);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [totalFreedMB, setTotalFreedMB] = useState<number>(0);
  const [isCleaningAll, setIsCleaningAll] = useState(false);

  // Backup & Mod Engine State
  const [backingUpId, setBackingUpId] = useState<string | null>(null);
  const [isInjectingMod, setIsInjectingMod] = useState(false);
  const [patches, setPatches] = useState<PatchProject[]>([]);
  const [newPatchModal, setNewPatchModal] = useState(false);
  const [selectedTargetApp, setSelectedTargetApp] = useState<AppContainerInfo | null>(null);
  const [patchName, setPatchName] = useState('');
  const [patchDesc, setPatchDesc] = useState('');

  // System & Terminal Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: Math.random().toString(), timestamp: time, text, type }, ...prev.slice(0, 100)]);
  }, []);

  const loadPatches = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@vsign_patch_projects');
      if (stored) {
        setPatches(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const savePatches = async (newPatches: PatchProject[]) => {
    setPatches(newPatches);
    await AsyncStorage.setItem('@vsign_patch_projects', JSON.stringify(newPatches));
  };

  const loadApps = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      addLog('Đang phân giải danh sách ứng dụng và container trên thiết bị...', 'info');
      const list = await getInstalledAppContainers();
      setApps(list);
      addLog(`Phát hiện thành công ${list.length} ứng dụng và container dữ liệu.`, 'success');
    } catch (err: any) {
      console.error('Error fetching apps:', err);
      addLog('Lỗi phân giải container: ' + err?.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addLog]);

  useEffect(() => {
    loadApps();
    loadPatches();
    addLog('Lõi Native Sandbox Traversal đã sẵn sàng (Bypass OK).', 'success');
  }, [loadApps, loadPatches, addLog]);

  // Scan storage breakdown in background
  const scanAllStorage = async () => {
    if (apps.length === 0) return;
    setIsScanningStorage(true);
    addLog('Bắt đầu phân tích dung lượng chi tiết toàn bộ app...', 'info');
    const breakdownMap: Record<string, ContainerStorageBreakdown> = {};
    for (const app of apps.slice(0, 40)) {
      if (app.containerPath) {
        const breakdown = await getContainerStorageBreakdown(app.containerPath);
        breakdownMap[app.bundleId] = breakdown;
      }
    }
    setStorageBreakdowns(breakdownMap);
    setIsScanningStorage(false);
    addLog('Đã phân tích xong dung lượng bộ nhớ.', 'success');
  };

  const filteredApps = apps.filter((app) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      const matchName = app.name.toLowerCase().includes(q);
      const matchBundle = app.bundleId.toLowerCase().includes(q);
      if (!matchName && !matchBundle) return false;
    }

    if (category === 'all') return true;
    const lowerId = app.bundleId.toLowerCase();
    const lowerName = app.name.toLowerCase();

    if (category === 'system') {
      return lowerId.startsWith('com.apple.') || lowerId.includes('system');
    }
    if (category === 'games') {
      return (
        lowerId.includes('game') ||
        lowerId.includes('play') ||
        lowerName.includes('game') ||
        lowerId.includes('vng') ||
        lowerId.includes('garena') ||
        lowerId.includes('roblox') ||
        lowerId.includes('genshin')
      );
    }
    if (category === 'user') {
      return !lowerId.startsWith('com.apple.');
    }
    return true;
  });

  const handleOpenBrowser = (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addLog(`Mở File Browser cho app: ${app.name} (${app.bundleId})`, 'info');
    router.push({
      pathname: '/file-browser',
      params: {
        containerPath: app.containerPath,
        appName: app.name,
        bundleId: app.bundleId,
      },
    });
  };

  const handleOpenDirectPath = () => {
    if (!directInput.trim()) return;
    const clean = directInput.trim();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const fullPath = clean.startsWith('/') ? clean : `/var/mobile/Containers/Data/Application/${clean}`;
    addLog(`Mở trực tiếp đường dẫn container: ${fullPath}`, 'info');
    router.push({
      pathname: '/file-browser',
      params: {
        containerPath: fullPath,
        appName: 'Container Trực Tiếp',
        bundleId: clean,
      },
    });
  };

  const handleCleanCache = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Dọn dẹp rác',
      `Dọn sạch cache và file tạm của "${app.name}" để giải phóng dung lượng bộ nhớ?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Dọn ngay',
          style: 'destructive',
          onPress: async () => {
            setCleaningId(app.bundleId);
            try {
              const freedBytes = await cleanContainerCache(app.containerPath);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const mb = freedBytes / (1024 * 1024);
              setTotalFreedMB((prev) => parseFloat((prev + mb).toFixed(2)));
              addLog(`Đã dọn dẹp ${mb.toFixed(2)} MB cache cho ${app.name}`, 'success');
              Alert.alert('Thành công', `Đã dọn dẹp ${mb.toFixed(2)} MB bộ nhớ đệm cho "${app.name}".`);
            } catch (err: any) {
              addLog(`Lỗi dọn rác ${app.name}: ${err?.message}`, 'error');
              Alert.alert('Lỗi', 'Không thể dọn dẹp: ' + err?.message);
            } finally {
              setCleaningId(null);
            }
          },
        },
      ]
    );
  };

  const handleCleanAllApps = async () => {
    if (apps.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      '⚡ SIÊU DỌN DẸP 1 CHẠM',
      `Hệ thống sẽ quét và xóa sạch toàn bộ Caches, WebKit, Snapshots và file tạm của tất cả ${apps.length} ứng dụng để lấy lại dung lượng tối đa. Bạn có muốn tiếp tục?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Dọn sạch ngay',
          style: 'destructive',
          onPress: async () => {
            setIsCleaningAll(true);
            addLog('Bắt đầu quy trình Siêu Dọn Dẹp toàn bộ hệ thống...', 'warn');
            let totalFreed = 0;
            try {
              for (const app of apps) {
                if (app.containerPath) {
                  const bytes = await cleanContainerCache(app.containerPath);
                  totalFreed += bytes;
                }
              }
              const mb = totalFreed / (1024 * 1024);
              setTotalFreedMB((prev) => parseFloat((prev + mb).toFixed(2)));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              addLog(`Siêu Dọn Dẹp hoàn tất. Đã giải phóng tổng cộng ${mb.toFixed(2)} MB!`, 'success');
              Alert.alert('Hoàn tất 🎉', `Đã giải phóng thành công ${mb.toFixed(2)} MB trên toàn bộ thiết bị!`);
            } catch (err: any) {
              addLog(`Lỗi trong quá trình dọn dẹp: ${err?.message}`, 'error');
              Alert.alert('Lỗi', 'Quá trình dọn dẹp bị gián đoạn: ' + err?.message);
            } finally {
              setIsCleaningAll(false);
            }
          },
        },
      ]
    );
  };

  const handleLaunchApp = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addLog(`Đang khởi chạy app: ${app.bundleId}...`, 'info');
    const ok = await openInstalledApp(app.bundleId);
    if (!ok) {
      addLog(`Không thể mở trực tiếp ${app.bundleId}`, 'warn');
      Alert.alert('Thông báo', `Không thể mở trực tiếp ${app.name} từ hệ thống.`);
    } else {
      addLog(`Đã mở ${app.name} thành công.`, 'success');
    }
  };

  const handleBackupContainer = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBackingUpId(app.bundleId);
    addLog(`Bắt đầu đóng gói sao lưu Documents của ${app.name}...`, 'info');

    try {
      const docsPath = app.containerPath.endsWith('/') ? `${app.containerPath}Documents` : `${app.containerPath}/Documents`;
      const files = await listContainerFiles(docsPath);

      if (files.length === 0) {
        Alert.alert('Thông báo', `Thư mục Documents của ${app.name} đang trống.`);
        setBackingUpId(null);
        return;
      }

      const zip = new JSZip();
      for (const f of files) {
        if (!f.isDirectory) {
          try {
            const res = await readContainerFile(f.path);
            if (res.isBinary) {
              zip.file(f.name, res.content, { base64: true });
            } else {
              zip.file(f.name, res.content);
            }
          } catch {}
        }
      }

      const zipBase64 = await zip.generateAsync({ type: 'base64' });
      const targetZipPath = `${FileSystem.cacheDirectory}Backup_${app.name.replace(/\s+/g, '_')}_${Date.now()}.zip`;
      await FileSystem.writeAsStringAsync(targetZipPath, zipBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addLog(`Sao lưu thành công: ${targetZipPath}`, 'success');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetZipPath);
      } else {
        Alert.alert('Thành công', `Đã tạo file backup tại ${targetZipPath}`);
      }
    } catch (err: any) {
      addLog(`Lỗi sao lưu ${app.name}: ${err?.message}`, 'error');
      Alert.alert('Lỗi Sao lưu', 'Không thể sao lưu container: ' + err?.message);
    } finally {
      setBackingUpId(null);
    }
  };

  const handleInjectModFile = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const docRes = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
      });

      if (docRes.canceled || !docRes.assets || docRes.assets.length === 0) return;
      const file = docRes.assets[0];

      setIsInjectingMod(true);
      addLog(`Bắt đầu tiêm mod/save game "${file.name}" vào ${app.name}...`, 'warn');
      const docsPath = app.containerPath.endsWith('/') ? `${app.containerPath}Documents/` : `${app.containerPath}/Documents/`;

      if (file.name.toLowerCase().endsWith('.zip')) {
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(b64, { base64: true });

        let count = 0;
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir) {
            const fileDataB64 = await zipEntry.async('base64');
            const targetPath = docsPath + relativePath;
            await writeContainerFile(targetPath, fileDataB64, true);
            count++;
          }
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addLog(`Đã tiêm ${count} files vào container của ${app.name}.`, 'success');
        Alert.alert('Tiêm Mod Thành Công 🎉', `Đã tiêm thành công ${count} file save game/mod vào container của "${app.name}". Hãy mở game để tận hưởng!`);
      } else {
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const targetPath = docsPath + file.name;
        await writeContainerFile(targetPath, b64, true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addLog(`Đã ghi file "${file.name}" vào Documents của ${app.name}.`, 'success');
        Alert.alert('Tiêm File Thành Công 🎉', `Đã ghi file "${file.name}" vào thư mục Documents của "${app.name}".`);
      }
    } catch (err: any) {
      addLog(`Lỗi tiêm mod: ${err?.message}`, 'error');
      Alert.alert('Lỗi Tiêm Mod', err?.message || 'Không thể tiêm file vào container.');
    } finally {
      setIsInjectingMod(false);
    }
  };

  const handleCreatePatchProject = async () => {
    if (!selectedTargetApp || !patchName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng chọn app mục tiêu và nhập tên bản mod.');
      return;
    }
    try {
      const docRes = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
      });

      let b64Data = '';
      if (!docRes.canceled && docRes.assets && docRes.assets.length > 0) {
        b64Data = await FileSystem.readAsStringAsync(docRes.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      }

      const newProject: PatchProject = {
        id: Date.now().toString(),
        name: patchName.trim(),
        targetBundleId: selectedTargetApp.bundleId,
        targetAppName: selectedTargetApp.name,
        description: patchDesc.trim() || 'Bản mod tùy biến',
        createdAt: Date.now(),
        filesCount: b64Data ? 1 : 0,
        dataBase64: b64Data,
      };

      const updated = [newProject, ...patches];
      await savePatches(updated);
      setNewPatchModal(false);
      setPatchName('');
      setPatchDesc('');
      setSelectedTargetApp(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addLog(`Đã tạo bản Patch Mod mới: "${newProject.name}" cho ${newProject.targetAppName}`, 'success');
      Alert.alert('Thành công', 'Đã lưu bản mod vào kho quản lý.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tạo bản mod.');
    }
  };

  const handleApplyPatch = async (patch: PatchProject) => {
    const targetApp = apps.find((a) => a.bundleId === patch.targetBundleId);
    if (!targetApp) {
      Alert.alert('Thông báo', `Không tìm thấy app "${patch.targetAppName}" (${patch.targetBundleId}) trên máy.`);
      return;
    }
    if (!patch.dataBase64) {
      Alert.alert('Thông báo', 'Bản mod này chưa có dữ liệu nén.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Tiêm bản Mod',
      `Bạn có muốn áp dụng bản mod "${patch.name}" đè vào game "${targetApp.name}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Áp dụng ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              addLog(`Đang giải nén và tiêm bản mod "${patch.name}" vào ${targetApp.name}...`, 'warn');
              const docsPath = targetApp.containerPath.endsWith('/') ? `${targetApp.containerPath}Documents/` : `${targetApp.containerPath}/Documents/`;
              const zip = await JSZip.loadAsync(patch.dataBase64!, { base64: true });

              let count = 0;
              for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                if (!zipEntry.dir) {
                  const fileDataB64 = await zipEntry.async('base64');
                  const targetPath = docsPath + relativePath;
                  await writeContainerFile(targetPath, fileDataB64, true);
                  count++;
                }
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              addLog(`Tiêm bản mod "${patch.name}" thành công (${count} files).`, 'success');
              Alert.alert('Hoàn tất 🎉', `Đã tiêm thành công bản mod "${patch.name}" vào ${targetApp.name}!`);
            } catch (err: any) {
              addLog(`Lỗi áp dụng patch: ${err?.message}`, 'error');
              Alert.alert('Lỗi', 'Không thể tiêm bản mod: ' + err?.message);
            }
          },
        },
      ]
    );
  };

  const handleDeletePatch = async (patchId: string) => {
    const updated = patches.filter((p) => p.id !== patchId);
    await savePatches(updated);
  };

  // Render App Card
  const renderAppCard = ({ item }: { item: AppContainerInfo }) => {
    const isCleaning = cleaningId === item.bundleId;
    const isBackingUp = backingUpId === item.bundleId;
    const breakdown = storageBreakdowns[item.bundleId];

    return (
      <View
        style={[
          styles.appCard,
          {
            backgroundColor: isLight ? '#FFFFFF' : '#0B1120',
            borderColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
      >
        <TouchableOpacity
          style={styles.cardHeaderArea}
          activeOpacity={0.7}
          onPress={() => handleOpenBrowser(item)}
        >
          <View style={styles.appIconWrapper}>
            {item.icon ? (
              <Image source={{ uri: item.icon }} style={styles.appIcon} />
            ) : (
              <View style={[styles.appIconFallback, { backgroundColor: isLight ? '#EEF2F6' : '#1A2234' }]}>
                <Folder size={26} color={isLight ? '#0052FF' : '#00F0FF'} />
              </View>
            )}
          </View>

          <View style={styles.appInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.appName, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.version ? (
                <View style={[styles.versionPill, { backgroundColor: isLight ? '#EEF2F6' : 'rgba(255,255,255,0.06)' }]}>
                  <Text style={[styles.appVersion, { color: isLight ? '#64748B' : '#94A3B8' }]}>
                    v{item.version}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={[styles.appBundle, { color: isLight ? '#0052FF' : '#00F0FF' }]} numberOfLines={1}>
              {item.bundleId}
            </Text>

            <View style={styles.statusRow}>
              <View style={styles.miniDot} />
              <Text style={[styles.statusLabel, { color: isLight ? '#10B981' : '#34D399' }]}>
                {breakdown ? `Dung lượng: ${formatBytes(breakdown.total)}` : (item.containerPath ? 'Container Active' : 'Bundle Application')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.launchBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)' }]}
            onPress={() => handleLaunchApp(item)}
          >
            <Play size={15} color={isLight ? '#0052FF' : '#00F0FF'} fill={isLight ? '#0052FF' : '#00F0FF'} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Action Row */}
        <View style={[styles.cardActionRow, { borderTopColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)' }]}>
          <TouchableOpacity
            style={[styles.miniActionBtn, { backgroundColor: isLight ? 'rgba(0,82,255,0.06)' : 'rgba(0,240,255,0.08)' }]}
            onPress={() => handleOpenBrowser(item)}
          >
            <FolderTree size={14} color={isLight ? '#0052FF' : '#00F0FF'} />
            <Text style={[styles.miniActionText, { color: isLight ? '#0052FF' : '#00F0FF' }]}>Duyệt File</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniActionBtn, { backgroundColor: isLight ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.1)' }]}
            onPress={() => handleInjectModFile(item)}
          >
            <Sparkles size={14} color="#F59E0B" />
            <Text style={[styles.miniActionText, { color: '#F59E0B' }]}>Tiêm Mod</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniActionBtn, { backgroundColor: isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.1)' }]}
            onPress={() => handleBackupContainer(item)}
            disabled={isBackingUp}
          >
            {isBackingUp ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <>
                <FileArchive size={14} color="#10B981" />
                <Text style={[styles.miniActionText, { color: '#10B981' }]}>Backup</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniActionBtn, { backgroundColor: isLight ? 'rgba(244,63,94,0.06)' : 'rgba(244,63,94,0.1)' }]}
            onPress={() => handleCleanCache(item)}
            disabled={isCleaning}
          >
            {isCleaning ? (
              <ActivityIndicator size="small" color="#F43F5E" />
            ) : (
              <>
                <Trash2 size={14} color="#F43F5E" />
                <Text style={[styles.miniActionText, { color: '#F43F5E' }]}>Dọn Rác</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <TabTransition tabPath="/mmo">
      <View style={[styles.container, { backgroundColor: isLight ? '#F8FAFC' : '#030712' }]}>
        {/* Top Header */}
        <LinearGradient
          colors={isLight ? ['#FFFFFF', '#F1F5F9'] : ['#0B1120', '#030712']}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                3105 System Hub
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.activeDot} />
                <Text style={[styles.headerSubtitle, { color: isLight ? '#0052FF' : '#00F0FF' }]}>
                  Bypass Sandbox Active • Multi-Container Ready
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
              onPress={() => loadApps(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw size={18} color={isLight ? '#0052FF' : '#00F0FF'} />
            </TouchableOpacity>
          </View>

          {/* 4-SECTION SEGMENTED BAR */}
          <View style={[styles.segmentedContainer, { backgroundColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.06)' }]}>
            <TouchableOpacity
              style={[styles.segmentBtn, activeSection === 'browser' && styles.segmentBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveSection('browser');
              }}
            >
              <FolderTree size={14} color={activeSection === 'browser' ? '#000' : isLight ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.segmentText, activeSection === 'browser' && styles.segmentTextActive]}>
                Duyệt App
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, activeSection === 'patches' && styles.segmentBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveSection('patches');
              }}
            >
              <Gamepad2 size={14} color={activeSection === 'patches' ? '#000' : isLight ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.segmentText, activeSection === 'patches' && styles.segmentTextActive]}>
                Mod & Patch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, activeSection === 'cleaner' && styles.segmentBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveSection('cleaner');
                if (Object.keys(storageBreakdowns).length === 0) scanAllStorage();
              }}
            >
              <Zap size={14} color={activeSection === 'cleaner' ? '#000' : isLight ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.segmentText, activeSection === 'cleaner' && styles.segmentTextActive]}>
                Dọn Rác
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, activeSection === 'system' && styles.segmentBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveSection('system');
              }}
            >
              <Cpu size={14} color={activeSection === 'system' ? '#000' : isLight ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.segmentText, activeSection === 'system' && styles.segmentTextActive]}>
                Hệ Thống
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* SECTION 1: APP BROWSER */}
        {activeSection === 'browser' && (
          <View style={{ flex: 1 }}>
            {/* Search & Direct Jump Bar */}
            <View style={styles.searchSection}>
              <View
                style={[
                  styles.searchBox,
                  {
                    backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                    borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                  },
                ]}
              >
                <Search size={16} color={isLight ? '#64748B' : 'rgba(240,242,248,0.4)'} />
                <TextInput
                  style={[styles.searchInput, { color: isLight ? '#0F172A' : '#F0F2F8' }]}
                  placeholder="Tìm kiếm ứng dụng, tên file, Bundle ID..."
                  placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.35)'}
                  value={searchText}
                  onChangeText={setSearchText}
                />
              </View>

              {/* Direct Path Input */}
              <View style={styles.directInputRow}>
                <TextInput
                  style={[
                    styles.directInput,
                    {
                      color: isLight ? '#0F172A' : '#00F0FF',
                      backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)',
                      borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                    },
                  ]}
                  placeholder="Nhập UUID Container hoặc Bundle ID để mở ngay..."
                  placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.35)'}
                  value={directInput}
                  onChangeText={setDirectInput}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.directGoBtn} onPress={handleOpenDirectPath}>
                  <ArrowRight size={16} color="#000" />
                </TouchableOpacity>
              </View>

              {/* Category Filter Pills */}
              <View style={styles.categoryRow}>
                <TouchableOpacity
                  style={[
                    styles.categoryPill,
                    category === 'all' && styles.categoryPillActive,
                    { backgroundColor: category === 'all' ? '#00F0FF' : isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory('all');
                  }}
                >
                  <Text style={[styles.categoryText, { color: category === 'all' ? '#000' : isLight ? '#475569' : '#94A3B8' }]}>
                    Tất cả ({apps.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.categoryPill,
                    category === 'user' && styles.categoryPillActive,
                    { backgroundColor: category === 'user' ? '#00F0FF' : isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory('user');
                  }}
                >
                  <Text style={[styles.categoryText, { color: category === 'user' ? '#000' : isLight ? '#475569' : '#94A3B8' }]}>
                    Người dùng
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.categoryPill,
                    category === 'games' && styles.categoryPillActive,
                    { backgroundColor: category === 'games' ? '#00F0FF' : isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory('games');
                  }}
                >
                  <Text style={[styles.categoryText, { color: category === 'games' ? '#000' : isLight ? '#475569' : '#94A3B8' }]}>
                    Game & Mod
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.categoryPill,
                    category === 'system' && styles.categoryPillActive,
                    { backgroundColor: category === 'system' ? '#00F0FF' : isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCategory('system');
                  }}
                >
                  <Text style={[styles.categoryText, { color: category === 'system' ? '#000' : isLight ? '#475569' : '#94A3B8' }]}>
                    Hệ thống
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={isLight ? '#0052FF' : '#00F0FF'} />
                <Text style={[styles.loadingText, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
                  Đang phân giải ứng dụng và container...
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredApps}
                keyExtractor={(item) => item.bundleId + item.containerPath}
                renderItem={renderAppCard}
                contentContainerStyle={styles.listContent}
                refreshing={refreshing}
                onRefresh={() => loadApps(true)}
              />
            )}
          </View>
        )}

        {/* SECTION 2: PATCH PROJECTS & MOD ENGINE */}
        {activeSection === 'patches' && (
          <ScrollView contentContainerStyle={styles.sectionScroll}>
            <View style={styles.patchHero}>
              <View style={styles.patchHeroContent}>
                <Text style={[styles.heroTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Quản Lý Bản Mod & Save Game
                </Text>
                <Text style={[styles.heroSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.55)' }]}>
                  Tiêm đè save game, mod hack, config trực tiếp vào container không cần JB.
                </Text>
              </View>

              <TouchableOpacity style={styles.newPatchBtn} onPress={() => setNewPatchModal(true)}>
                <Plus size={16} color="#000" />
                <Text style={styles.newPatchText}>Tạo Bản Mod</Text>
              </TouchableOpacity>
            </View>

            {patches.length === 0 ? (
              <View style={styles.emptyCard}>
                <Gamepad2 size={40} color={isLight ? '#CBD5E1' : 'rgba(255,255,255,0.15)'} />
                <Text style={[styles.emptyCardTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  Chưa có bản Mod nào
                </Text>
                <Text style={[styles.emptyCardSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>
                  Chạm nút "Tạo Bản Mod" ở trên để nhập file save game (.zip) và gán cho game mục tiêu.
                </Text>
              </View>
            ) : (
              patches.map((p) => (
                <View
                  key={p.id}
                  style={[
                    styles.patchCard,
                    {
                      backgroundColor: isLight ? '#FFFFFF' : '#0B1120',
                      borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                    },
                  ]}
                >
                  <View style={styles.patchCardTop}>
                    <View style={styles.patchIconCircle}>
                      <Gamepad2 size={20} color="#00F0FF" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.patchName, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>{p.name}</Text>
                      <Text style={[styles.patchTarget, { color: isLight ? '#0052FF' : '#00F0FF' }]}>
                        Mục tiêu: {p.targetAppName} ({p.targetBundleId})
                      </Text>
                      <Text style={[styles.patchDesc, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
                        {p.description}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.patchActions}>
                    <TouchableOpacity
                      style={[styles.patchApplyBtn, { backgroundColor: '#00F0FF' }]}
                      onPress={() => handleApplyPatch(p)}
                    >
                      <Sparkles size={14} color="#000" />
                      <Text style={styles.patchApplyText}>Áp Dụng Mod</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.patchDeleteBtn, { backgroundColor: isLight ? '#FEE2E2' : 'rgba(244,63,94,0.1)' }]}
                      onPress={() => handleDeletePatch(p.id)}
                    >
                      <Trash2 size={14} color="#F43F5E" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* SECTION 3: DEEP STORAGE CLEANER */}
        {activeSection === 'cleaner' && (
          <ScrollView contentContainerStyle={styles.sectionScroll}>
            {/* Storage Hero */}
            <LinearGradient
              colors={['rgba(0, 240, 255, 0.12)', 'rgba(0, 82, 255, 0.04)']}
              style={styles.cleanerHero}
            >
              <View style={styles.cleanerHeroTop}>
                <View>
                  <Text style={[styles.cleanerHeroTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                    Siêu Dọn Rác Toàn Diện
                  </Text>
                  <Text style={[styles.cleanerHeroSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.6)' }]}>
                    Đã dọn dẹp giải phóng: {totalFreedMB > 0 ? `${totalFreedMB} MB` : '0 MB'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.cleanAllBigBtn, { backgroundColor: isCleaningAll ? '#475569' : '#00F0FF' }]}
                  onPress={handleCleanAllApps}
                  disabled={isCleaningAll || apps.length === 0}
                >
                  {isCleaningAll ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Zap size={16} color="#000" />
                      <Text style={styles.cleanAllBigText}>DỌN TOÀN BỘ</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.scanStorageBtn} onPress={scanAllStorage} disabled={isScanningStorage}>
                {isScanningStorage ? (
                  <ActivityIndicator size="small" color="#00F0FF" />
                ) : (
                  <Text style={styles.scanStorageText}>⚡ Quét lại chi tiết dung lượng từng App</Text>
                )}
              </TouchableOpacity>
            </LinearGradient>

            {/* App by App Breakdown */}
            <Text style={[styles.subSectionTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
              Chi tiết dung lượng theo ứng dụng ({apps.length})
            </Text>

            {apps.map((app) => {
              const breakdown = storageBreakdowns[app.bundleId];
              const isCleaning = cleaningId === app.bundleId;

              return (
                <View
                  key={app.bundleId}
                  style={[
                    styles.cleanerCard,
                    {
                      backgroundColor: isLight ? '#FFFFFF' : '#0B1120',
                      borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                    },
                  ]}
                >
                  <View style={styles.cleanerCardTop}>
                    <View style={styles.appIconWrapper}>
                      {app.icon ? (
                        <Image source={{ uri: app.icon }} style={styles.appIconSmall} />
                      ) : (
                        <View style={[styles.appIconFallbackSmall, { backgroundColor: isLight ? '#EEF2F6' : '#1A2234' }]}>
                          <Folder size={18} color="#00F0FF" />
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.cleanerAppName, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
                        {app.name}
                      </Text>
                      <Text style={[styles.cleanerAppBundle, { color: isLight ? '#64748B' : '#94A3B8' }]} numberOfLines={1}>
                        {app.bundleId}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.cleanSingleBtn, { backgroundColor: isLight ? 'rgba(244,63,94,0.08)' : 'rgba(244,63,94,0.12)' }]}
                      onPress={() => handleCleanCache(app)}
                      disabled={isCleaning}
                    >
                      {isCleaning ? (
                        <ActivityIndicator size="small" color="#F43F5E" />
                      ) : (
                        <Text style={styles.cleanSingleText}>Dọn rác</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {breakdown && (
                    <View style={[styles.breakdownGrid, { borderTopColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)' }]}>
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownLabel}>Caches</Text>
                        <Text style={[styles.breakdownValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                          {formatBytes(breakdown.caches)}
                        </Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownLabel}>WebKit</Text>
                        <Text style={[styles.breakdownValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                          {formatBytes(breakdown.webkit)}
                        </Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownLabel}>Tạm (tmp)</Text>
                        <Text style={[styles.breakdownValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                          {formatBytes(breakdown.tmp)}
                        </Text>
                      </View>
                      <View style={styles.breakdownItem}>
                        <Text style={styles.breakdownLabel}>Tài liệu</Text>
                        <Text style={[styles.breakdownValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                          {formatBytes(breakdown.documents)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* SECTION 4: SYSTEM DIAGNOSTICS & TERMINAL LOGS */}
        {activeSection === 'system' && (
          <ScrollView contentContainerStyle={styles.sectionScroll}>
            {/* System Info Matrix */}
            <View
              style={[
                styles.systemCard,
                {
                  backgroundColor: isLight ? '#FFFFFF' : '#0B1120',
                  borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <Text style={[styles.systemCardTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                Thông Tin Phần Cứng & Hệ Điều Hành
              </Text>

              <View style={styles.systemRow}>
                <Text style={[styles.systemLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Nền tảng</Text>
                <Text style={[styles.systemVal, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Apple iOS (Darwin)</Text>
              </View>

              <View style={styles.systemRow}>
                <Text style={[styles.systemLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Trạng thái Sandbox</Text>
                <View style={styles.readyTag}>
                  <Check size={12} color="#10B981" />
                  <Text style={styles.readyTagText}>Bypass Active (0ms Direct Traversal)</Text>
                </View>
              </View>

              <View style={styles.systemRow}>
                <Text style={[styles.systemLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Lõi Container</Text>
                <Text style={[styles.systemVal, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>MobileContainerManager + LaunchServices</Text>
              </View>

              <View style={styles.systemRow}>
                <Text style={[styles.systemLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>Đường dẫn gốc</Text>
                <Text style={[styles.systemValMonospace, { color: isLight ? '#0052FF' : '#00F0FF' }]}>
                  /var/mobile/Containers/Data/Application
                </Text>
              </View>
            </View>

            {/* Terminal Live Logs */}
            <View
              style={[
                styles.terminalCard,
                {
                  backgroundColor: isLight ? '#0F172A' : '#040711',
                  borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <View style={styles.terminalHeader}>
                <Terminal size={16} color="#00F0FF" />
                <Text style={styles.terminalTitle}>Console Logs Thời Gian Thực</Text>
                <TouchableOpacity onPress={() => setLogs([])}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Xóa Log</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.terminalBody} nestedScrollEnabled>
                {logs.map((l) => (
                  <View key={l.id} style={styles.logRow}>
                    <Text style={styles.logTime}>[{l.timestamp}]</Text>
                    <Text
                      style={[
                        styles.logText,
                        {
                          color:
                            l.type === 'success'
                              ? '#34D399'
                              : l.type === 'warn'
                              ? '#FBBF24'
                              : l.type === 'error'
                              ? '#F87171'
                              : '#38BDF8',
                        },
                      ]}
                    >
                      {l.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        )}

        {/* Modal Create Patch Project */}
        {newPatchModal && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: isLight ? '#FFFFFF' : '#0B1120' }]}>
              <Text style={[styles.modalTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                Tạo Bản Mod & Save Game
              </Text>

              <Text style={[styles.inputLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
                1. Chọn Game / App Mục Tiêu
              </Text>
              <ScrollView style={styles.appPickerScroll} horizontal showsHorizontalScrollIndicator={false}>
                {apps.slice(0, 15).map((a) => {
                  const isSelected = selectedTargetApp?.bundleId === a.bundleId;
                  return (
                    <TouchableOpacity
                      key={a.bundleId}
                      style={[
                        styles.appPickerItem,
                        isSelected && styles.appPickerItemSelected,
                        { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)' },
                      ]}
                      onPress={() => setSelectedTargetApp(a)}
                    >
                      {a.icon ? (
                        <Image source={{ uri: a.icon }} style={styles.pickerIcon} />
                      ) : (
                        <View style={styles.pickerFallbackIcon}>
                          <Folder size={16} color="#00F0FF" />
                        </View>
                      )}
                      <Text style={[styles.pickerAppName, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.inputLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
                2. Tên Bản Mod / Save Game
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    color: isLight ? '#0F172A' : '#F0F2F8',
                    backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)',
                  },
                ]}
                placeholder="Ví dụ: Save Game Full Tiền, Mod Menu VIP..."
                placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.35)'}
                value={patchName}
                onChangeText={setPatchName}
              />

              <Text style={[styles.inputLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
                3. Mô Tả Chi Tiết
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    color: isLight ? '#0F172A' : '#F0F2F8',
                    backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)',
                  },
                ]}
                placeholder="Ghi chú về tính năng của bản mod..."
                placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.35)'}
                value={patchDesc}
                onChangeText={setPatchDesc}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
                  onPress={() => setNewPatchModal(false)}
                >
                  <Text style={{ color: isLight ? '#64748B' : 'rgba(240,242,248,0.7)', fontWeight: '600' }}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleCreatePatchProject}>
                  <Text style={styles.modalConfirmText}>Chọn File Zip & Lưu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </TabTransition>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  segmentBtnActive: {
    backgroundColor: '#00F0FF',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
  },
  directInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  directInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  directGoBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#00F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  categoryPillActive: {
    backgroundColor: '#00F0FF',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 110,
  },
  sectionScroll: {
    padding: 16,
    paddingBottom: 110,
  },
  appCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardHeaderArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  appIconWrapper: {
    marginRight: 14,
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
  },
  appIconFallback: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  appName: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  versionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  appVersion: {
    fontSize: 10,
    fontWeight: '700',
  },
  appBundle: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  launchBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  cardActionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    padding: 8,
    gap: 6,
  },
  miniActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  miniActionText: {
    fontSize: 11,
    fontWeight: '800',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    marginTop: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  patchHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  patchHeroContent: {
    flex: 1,
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  heroSub: {
    fontSize: 12,
    marginTop: 2,
  },
  newPatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00F0FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  newPatchText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginTop: 20,
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyCardSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
  patchCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  patchCardTop: {
    flexDirection: 'row',
  },
  patchIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  patchName: {
    fontSize: 15,
    fontWeight: '800',
  },
  patchTarget: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  patchDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  patchActions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  patchApplyBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  patchApplyText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 13,
  },
  patchDeleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleanerHero: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 240, 255, 0.2)',
  },
  cleanerHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cleanerHeroTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  cleanerHeroSub: {
    fontSize: 12,
    marginTop: 4,
  },
  cleanAllBigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cleanAllBigText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
  },
  scanStorageBtn: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  scanStorageText: {
    color: '#00F0FF',
    fontSize: 12,
    fontWeight: '700',
  },
  subSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  cleanerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cleanerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  appIconFallbackSmall: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleanerAppName: {
    fontSize: 14,
    fontWeight: '800',
  },
  cleanerAppBundle: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  cleanSingleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cleanSingleText: {
    color: '#F43F5E',
    fontSize: 12,
    fontWeight: '800',
  },
  breakdownGrid: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 10,
    color: 'rgba(240,242,248,0.4)',
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  systemCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  systemCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  systemLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  systemVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  systemValMonospace: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    maxWidth: 200,
    textAlign: 'right',
  },
  readyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyTagText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  terminalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  terminalTitle: {
    color: '#00F0FF',
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
    marginLeft: 8,
  },
  terminalBody: {
    height: 220,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 10,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 6,
  },
  logTime: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  appPickerScroll: {
    marginBottom: 12,
  },
  appPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 6,
  },
  appPickerItemSelected: {
    borderColor: '#00F0FF',
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
  },
  pickerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  pickerFallbackIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerAppName: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 100,
  },
  modalInput: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmBtn: {
    flex: 1.8,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#00F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 13,
  },
});
