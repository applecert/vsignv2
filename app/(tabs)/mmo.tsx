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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
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
} from 'lucide-react-native';
import {
  getInstalledAppContainers,
  cleanContainerCache,
  openInstalledApp,
  listContainerFiles,
  readContainerFile,
  writeContainerFile,
  AppContainerInfo,
} from '../../modules/ipa-signer';
import { COLORS, useThemeUpdate, TXT } from '../../constants/theme';
import { TabTransition } from '../../components/ui/TabTransition';

const { width } = Dimensions.get('window');

type FilterCategory = 'all' | 'user' | 'games' | 'system';

export default function AppManagerTabScreen() {
  const router = useRouter();
  useThemeUpdate();
  const isLight = COLORS.background === '#F4F4F6';

  const [apps, setApps] = useState<AppContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [totalFreedMB, setTotalFreedMB] = useState<number>(0);
  const [isCleaningAll, setIsCleaningAll] = useState(false);

  // Backup & Mod state
  const [backingUpId, setBackingUpId] = useState<string | null>(null);
  const [isInjectingMod, setIsInjectingMod] = useState(false);

  const loadApps = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const list = await getInstalledAppContainers();
      setApps(list);
    } catch (err: any) {
      console.error('Error fetching apps:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const filteredApps = apps.filter((app) => {
    // 1. Text Search Filter
    if (searchText) {
      const q = searchText.toLowerCase();
      const matchName = app.name.toLowerCase().includes(q);
      const matchBundle = app.bundleId.toLowerCase().includes(q);
      if (!matchName && !matchBundle) return false;
    }

    // 2. Category Filter
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
    router.push({
      pathname: '/file-browser',
      params: {
        containerPath: app.containerPath,
        appName: app.name,
        bundleId: app.bundleId,
      },
    });
  };

  const handleCleanCache = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Dọn dẹp rác',
      `Dọn sạch cache và file tạm của "${app.name}" để giải phóng dung lượng bộ nhớ? (Dữ liệu đăng nhập và tài khoản vẫn an toàn)`,
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
              Alert.alert('Thành công', `Đã dọn dẹp ${mb.toFixed(2)} MB bộ nhớ đệm cho "${app.name}".`);
            } catch (err: any) {
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
      '⚡ Dọn dẹp 1 chạm toàn bộ App',
      `Hệ thống sẽ quét và dọn sạch bộ nhớ cache, WebKit và file tạm của tất cả ${apps.length} ứng dụng trên máy để lấy lại dung lượng tối đa. Bạn có muốn tiếp tục?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Dọn sạch tất cả',
          style: 'destructive',
          onPress: async () => {
            setIsCleaningAll(true);
            let totalFreed = 0;
            try {
              for (const app of apps) {
                const bytes = await cleanContainerCache(app.containerPath);
                totalFreed += bytes;
              }
              const mb = totalFreed / (1024 * 1024);
              setTotalFreedMB((prev) => parseFloat((prev + mb).toFixed(2)));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Hoàn tất 🎉', `Đã dọn dẹp giải phóng thành công ${mb.toFixed(2)} MB trên toàn bộ hệ thống!`);
            } catch (err: any) {
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
    const ok = await openInstalledApp(app.bundleId);
    if (!ok) {
      Alert.alert('Thông báo', `Không thể mở trực tiếp ${app.name} từ hệ thống.`);
    }
  };

  const handleBackupContainer = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBackingUpId(app.bundleId);

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
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetZipPath);
      } else {
        Alert.alert('Thành công', `Đã tạo file backup tại ${targetZipPath}`);
      }
    } catch (err: any) {
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
        Alert.alert('Tiêm Mod Thành Công 🎉', `Đã tiêm thành công ${count} file save game/mod vào container của "${app.name}". Hãy mở game để tận hưởng!`);
      } else {
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const targetPath = docsPath + file.name;
        await writeContainerFile(targetPath, b64, true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Tiêm File Thành Công 🎉', `Đã ghi file "${file.name}" vào thư mục Documents của "${app.name}".`);
      }
    } catch (err: any) {
      Alert.alert('Lỗi Tiêm Mod', err?.message || 'Không thể tiêm file vào container.');
    } finally {
      setIsInjectingMod(false);
    }
  };

  const renderAppCard = ({ item }: { item: AppContainerInfo }) => {
    const isCleaning = cleaningId === item.bundleId;
    const isBackingUp = backingUpId === item.bundleId;

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
                {item.containerPath ? 'Container Active' : 'Application Bundle'}
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
        {/* Header Bar */}
        <LinearGradient
          colors={isLight ? ['#FFFFFF', '#F1F5F9'] : ['#0B1120', '#030712']}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                Quản lý App & Dữ liệu
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.activeDot} />
                <Text style={[styles.headerSubtitle, { color: isLight ? '#0052FF' : '#00F0FF' }]}>
                  Bypass Sandbox • LaunchServices OK
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

          {/* Quick Stats Grid */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' }]}>
              <HardDrive size={16} color={isLight ? '#0052FF' : '#00F0FF'} />
              <Text style={[styles.statValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>{apps.length}</Text>
              <Text style={[styles.statLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>Ứng dụng</Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)' }]}>
              <Trash2 size={16} color="#F43F5E" />
              <Text style={[styles.statValue, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                {totalFreedMB > 0 ? `${totalFreedMB} MB` : '0 MB'}
              </Text>
              <Text style={[styles.statLabel, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>Đã dọn dẹp</Text>
            </View>

            <TouchableOpacity
              style={[styles.cleanAllBtn, { backgroundColor: isCleaningAll ? '#475569' : '#00F0FF' }]}
              onPress={handleCleanAllApps}
              disabled={isCleaningAll || apps.length === 0}
            >
              {isCleaningAll ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Zap size={16} color="#000" />
                  <Text style={styles.cleanAllText}>Dọn 1 Chạm</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
                borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
              },
            ]}
          >
            <Search size={18} color={isLight ? '#64748B' : 'rgba(240,242,248,0.4)'} />
            <TextInput
              style={[styles.searchInput, { color: isLight ? '#0F172A' : '#F0F2F8' }]}
              placeholder="Tìm kiếm ứng dụng hoặc Bundle ID..."
              placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.35)'}
              value={searchText}
              onChangeText={setSearchText}
            />
            {searchText ? (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Text style={{ color: isLight ? '#64748B' : 'rgba(240,242,248,0.4)', fontSize: 13 }}>Xóa</Text>
              </TouchableOpacity>
            ) : null}
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
        </LinearGradient>

        {/* Main List */}
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
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Folder size={48} color={isLight ? '#CBD5E1' : 'rgba(255,255,255,0.15)'} />
                <Text style={[styles.emptyTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                  {searchText ? 'Không tìm thấy ứng dụng phù hợp' : 'Chưa quét thấy container nào'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>
                  Nhấn nút làm mới ở góc phải để quét lại.
                </Text>
              </View>
            }
          />
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
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  cleanAllBtn: {
    flex: 1.2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
  },
  cleanAllText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 13,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
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
  appCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
