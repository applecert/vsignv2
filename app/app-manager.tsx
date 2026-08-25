import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Folder,
  Trash2,
  Play,
  RefreshCw,
  Search,
  ChevronRight,
  ArrowLeft,
  HardDrive,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  getInstalledAppContainers,
  cleanContainerCache,
  openInstalledApp,
  AppContainerInfo,
} from '../modules/ipa-signer';
import { useThemeUpdate, COLORS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function AppManagerScreen() {
  const router = useRouter();
  useThemeUpdate();
  const isLight = COLORS.background === '#F4F4F6';

  const [apps, setApps] = useState<AppContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [cleaningId, setCleaningId] = useState<string | null>(null);

  const loadApps = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const list = await getInstalledAppContainers();
      setApps(list);
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể nạp danh sách container ứng dụng: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const filteredApps = apps.filter((app) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return app.name.toLowerCase().includes(q) || app.bundleId.toLowerCase().includes(q);
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
      `Bạn có muốn xóa cache và file tạm của "${app.name}" để giải phóng dung lượng không? (Dữ liệu tài khoản và save game vẫn an toàn)`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Dọn dẹp ngay',
          style: 'destructive',
          onPress: async () => {
            setCleaningId(app.bundleId);
            try {
              const freedBytes = await cleanContainerCache(app.containerPath);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              const mb = (freedBytes / (1024 * 1024)).toFixed(2);
              Alert.alert('Thành công', `Đã dọn dẹp ${mb} MB bộ nhớ đệm cho "${app.name}".`);
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

  const handleLaunchApp = async (app: AppContainerInfo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ok = await openInstalledApp(app.bundleId);
    if (!ok) {
      Alert.alert('Thông báo', `Không thể mở trực tiếp ${app.name} từ hệ thống.`);
    }
  };

  const renderItem = ({ item }: { item: AppContainerInfo }) => {
    const isCleaning = cleaningId === item.bundleId;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleOpenBrowser(item)}
        style={[
          styles.appCard,
          {
            backgroundColor: isLight ? '#FFFFFF' : 'rgba(18, 24, 38, 0.75)',
            borderColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
          },
        ]}
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
          <Text style={[styles.appName, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.appBundle, { color: isLight ? '#64748B' : 'rgba(240, 242, 248, 0.5)' }]} numberOfLines={1}>
            {item.bundleId}
          </Text>
          {item.version ? (
            <Text style={[styles.appVersion, { color: isLight ? '#94A3B8' : 'rgba(240, 242, 248, 0.35)' }]}>
              v{item.version}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)' }]}
            onPress={() => handleLaunchApp(item)}
          >
            <Play size={14} color={isLight ? '#0052FF' : '#00F0FF'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isLight ? '#FEF2F2' : 'rgba(244,63,94,0.12)' }]}
            onPress={() => handleCleanCache(item)}
            disabled={isCleaning}
          >
            {isCleaning ? (
              <ActivityIndicator size="small" color="#F43F5E" />
            ) : (
              <Trash2 size={14} color="#F43F5E" />
            )}
          </TouchableOpacity>

          <ChevronRight size={18} color={isLight ? '#CBD5E1' : 'rgba(255,255,255,0.2)'} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isLight ? '#F8FAFC' : '#040711' }]}>
      {/* Header */}
      <LinearGradient
        colors={isLight ? ['#FFFFFF', '#F1F5F9'] : ['#0B1120', '#040711']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={isLight ? '#0F172A' : '#F0F2F8'} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
              Quản lý App & Dữ liệu
            </Text>
            <Text style={[styles.headerSubtitle, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
              Duyệt file, Mod game & Dọn rác
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
            onPress={() => loadApps(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={18} color={isLight ? '#0052FF' : '#00F0FF'} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)',
              borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          <Search size={18} color={isLight ? '#64748B' : 'rgba(240,242,248,0.4)'} />
          <TextInput
            style={[styles.searchInput, { color: isLight ? '#0F172A' : '#F0F2F8' }]}
            placeholder="Tìm kiếm app theo tên hoặc Bundle ID..."
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

        {/* Stats banner */}
        <View style={styles.statsBanner}>
          <View style={styles.statItem}>
            <HardDrive size={14} color={isLight ? '#0052FF' : '#00F0FF'} />
            <Text style={[styles.statText, { color: isLight ? '#475569' : 'rgba(240,242,248,0.7)' }]}>
              {apps.length} ứng dụng đã kết nối
            </Text>
          </View>
          <View style={styles.statItem}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={[styles.statText, { color: isLight ? '#475569' : 'rgba(240,242,248,0.7)' }]}>
              Sandbox Bypass OK
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={isLight ? '#0052FF' : '#00F0FF'} />
          <Text style={[styles.loadingText, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
            Đang phân giải container ứng dụng...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredApps}
          keyExtractor={(item) => item.bundleId + item.containerPath}
          renderItem={renderItem}
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
                Nhấn nút làm mới ở góc phải để thử lại.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  statsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  appIconWrapper: {
    marginRight: 14,
  },
  appIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  appIconFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  appBundle: {
    fontSize: 12,
  },
  appVersion: {
    fontSize: 11,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
