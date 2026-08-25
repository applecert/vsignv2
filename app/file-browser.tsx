import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  Folder,
  FileText,
  FileCode,
  FileImage,
  File,
  Trash2,
  Share2,
  Edit3,
  Plus,
  RefreshCw,
  Save,
  X,
  ChevronRight,
} from 'lucide-react-native';
import {
  listContainerFiles,
  readContainerFile,
  writeContainerFile,
  deleteContainerItem,
  ContainerFileItem,
} from '../modules/ipa-signer';
import { useThemeUpdate, COLORS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(name: string, isDirectory: boolean, isLight: boolean) {
  if (isDirectory) {
    return <Folder size={24} color={isLight ? '#0052FF' : '#00F0FF'} />;
  }
  const lower = name.toLowerCase();
  if (lower.endsWith('.plist') || lower.endsWith('.json') || lower.endsWith('.xml')) {
    return <FileCode size={22} color="#F59E0B" />;
  }
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return <FileImage size={22} color="#10B981" />;
  }
  if (lower.endsWith('.txt') || lower.endsWith('.strings') || lower.endsWith('.log') || lower.endsWith('.cfg')) {
    return <FileText size={22} color="#8B5CF6" />;
  }
  return <File size={22} color={isLight ? '#64748B' : '#94A3B8'} />;
}

export default function FileBrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ containerPath: string; appName: string; bundleId: string }>();
  useThemeUpdate();
  const isLight = COLORS.background === '#F4F4F6';

  const containerPath = params.containerPath || '';
  const appName = params.appName || 'Container';

  const [currentPath, setCurrentPath] = useState(containerPath);
  const [history, setHistory] = useState<string[]>([containerPath]);
  const [items, setItems] = useState<ContainerFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Editor Modal State
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingFile, setEditingFile] = useState<ContainerFileItem | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isBinaryFile, setIsBinaryFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // New item modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const loadDirectory = useCallback(async (path: string, isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const list = await listContainerFiles(path);
      setItems(list);
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể đọc thư mục: ' + err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (currentPath) {
      loadDirectory(currentPath);
    }
  }, [currentPath, loadDirectory]);

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (history.length > 1) {
      const nextHistory = [...history];
      nextHistory.pop();
      const prevPath = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setCurrentPath(prevPath);
    } else {
      router.back();
    }
  };

  const handleOpenItem = (item: ContainerFileItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.isDirectory) {
      setHistory((prev) => [...prev, item.path]);
      setCurrentPath(item.path);
    } else {
      handleOpenFile(item);
    }
  };

  const handleOpenFile = async (item: ContainerFileItem) => {
    try {
      const res = await readContainerFile(item.path);
      setEditingFile(item);
      setFileContent(res.content);
      setIsBinaryFile(res.isBinary);
      setEditorVisible(true);
    } catch (err: any) {
      Alert.alert('Lỗi đọc file', err?.message || 'Không thể mở file này.');
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setIsSaving(true);
    try {
      const ok = await writeContainerFile(editingFile.path, fileContent, isBinaryFile);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Thành công', 'Đã lưu thay đổi vào file.');
        setEditorVisible(false);
        loadDirectory(currentPath);
      } else {
        Alert.alert('Lỗi', 'Không thể lưu file.');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Ghi file thất bại.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = (item: ContainerFileItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Xóa vĩnh viễn',
      `Bạn có chắc chắn muốn xóa "${item.name}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              const ok = await deleteContainerItem(item.path);
              if (ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                loadDirectory(currentPath);
              } else {
                Alert.alert('Lỗi', 'Không thể xóa mục này.');
              }
            } catch (err: any) {
              Alert.alert('Lỗi', err?.message || 'Xóa thất bại.');
            }
          },
        },
      ]
    );
  };

  const handleShareFile = async (item: ContainerFileItem) => {
    try {
      const res = await readContainerFile(item.path);
      const tempPath = FileSystem.cacheDirectory + item.name;
      if (res.isBinary) {
        await FileSystem.writeAsStringAsync(tempPath, res.content, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        await FileSystem.writeAsStringAsync(tempPath, res.content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempPath);
      } else {
        Alert.alert('Thông báo', 'Chia sẻ file không khả dụng trên thiết bị này.');
      }
    } catch (err: any) {
      Alert.alert('Lỗi', 'Không thể chia sẻ file: ' + err?.message);
    }
  };

  const handleCreateNew = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên.');
      return;
    }
    const fullPath = (currentPath.endsWith('/') ? currentPath : currentPath + '/') + newItemName.trim();
    try {
      if (isCreatingFolder) {
        // Tạo thư mục
        const ok = await writeContainerFile(fullPath + '/.created', '', false);
        if (ok) {
          Alert.alert('Thành công', 'Đã tạo thư mục.');
        }
      } else {
        // Tạo file
        const ok = await writeContainerFile(fullPath, '', false);
        if (ok) {
          Alert.alert('Thành công', 'Đã tạo file mới.');
        }
      }
      setCreateModalVisible(false);
      setNewItemName('');
      loadDirectory(currentPath);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể tạo mới.');
    }
  };

  const currentRelativePath = currentPath.replace(containerPath, '') || '/';

  return (
    <View style={[styles.container, { backgroundColor: isLight ? '#F8FAFC' : '#040711' }]}>
      {/* Header */}
      <LinearGradient
        colors={isLight ? ['#FFFFFF', '#F1F5F9'] : ['#0B1120', '#040711']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={[styles.btnCircle, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
            onPress={handleGoBack}
          >
            <ArrowLeft size={20} color={isLight ? '#0F172A' : '#F0F2F8'} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
              {appName}
            </Text>
            <Text style={[styles.headerPath, { color: isLight ? '#0052FF' : '#00F0FF' }]} numberOfLines={1}>
              {currentRelativePath}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btnCircle, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
            onPress={() => setCreateModalVisible(true)}
          >
            <Plus size={20} color={isLight ? '#0052FF' : '#00F0FF'} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Directory Content List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={isLight ? '#0052FF' : '#00F0FF'} />
          <Text style={[styles.loadingText, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.5)' }]}>
            Đang duyệt tệp tin...
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <View
              style={[
                styles.fileCard,
                {
                  backgroundColor: isLight ? '#FFFFFF' : 'rgba(18, 24, 38, 0.75)',
                  borderColor: isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)',
                },
              ]}
            >
              <TouchableOpacity
                style={styles.fileCardMain}
                activeOpacity={0.7}
                onPress={() => handleOpenItem(item)}
              >
                <View style={styles.iconBox}>{getFileIcon(item.name, item.isDirectory, isLight)}</View>
                <View style={styles.fileDetails}>
                  <Text style={[styles.fileName, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.fileMeta, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>
                    {item.isDirectory ? 'Thư mục' : formatBytes(item.size)}
                  </Text>
                </View>
                {item.isDirectory && (
                  <ChevronRight size={18} color={isLight ? '#CBD5E1' : 'rgba(255,255,255,0.2)'} />
                )}
              </TouchableOpacity>

              {/* Action buttons for files */}
              {!item.isDirectory && (
                <View style={styles.fileActions}>
                  <TouchableOpacity style={styles.miniBtn} onPress={() => handleOpenFile(item)}>
                    <Edit3 size={15} color={isLight ? '#0052FF' : '#00F0FF'} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.miniBtn} onPress={() => handleShareFile(item)}>
                    <Share2 size={15} color="#10B981" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.miniBtn} onPress={() => handleDeleteItem(item)}>
                    <Trash2 size={15} color="#F43F5E" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => loadDirectory(currentPath, true)}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Folder size={48} color={isLight ? '#CBD5E1' : 'rgba(255,255,255,0.15)'} />
              <Text style={[styles.emptyTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>
                Thư mục này đang trống
              </Text>
            </View>
          }
        />
      )}

      {/* Code / Text Editor Modal */}
      <Modal visible={editorVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.editorContainer, { backgroundColor: isLight ? '#FFFFFF' : '#0A0F1D' }]}>
          <View style={[styles.editorHeader, { borderBottomColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)' }]}>
            <TouchableOpacity onPress={() => setEditorVisible(false)} style={styles.closeBtn}>
              <X size={20} color={isLight ? '#0F172A' : '#F0F2F8'} />
            </TouchableOpacity>
            <View style={styles.editorTitleWrap}>
              <Text style={[styles.editorTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]} numberOfLines={1}>
                {editingFile?.name}
              </Text>
              <Text style={[styles.editorSub, { color: isLight ? '#64748B' : 'rgba(240,242,248,0.45)' }]}>
                {isBinaryFile ? 'File nhị phân (Base64)' : 'Văn bản / Plist'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSaveFile}
              disabled={isSaving}
              style={[styles.saveBtn, { backgroundColor: isLight ? '#0052FF' : '#00F0FF' }]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <View style={styles.saveBtnContent}>
                  <Save size={16} color={isLight ? '#FFF' : '#000'} />
                  <Text style={[styles.saveBtnText, { color: isLight ? '#FFF' : '#000' }]}>Lưu</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={[
                styles.editorInput,
                {
                  color: isLight ? '#0F172A' : '#38BDF8',
                  backgroundColor: isLight ? '#F8FAFC' : '#040711',
                },
              ]}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              value={fileContent}
              onChangeText={setFileContent}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* Create New Item Modal */}
      <Modal visible={createModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.createCard, { backgroundColor: isLight ? '#FFFFFF' : '#0F172A' }]}>
            <Text style={[styles.createTitle, { color: isLight ? '#0F172A' : '#F0F2F8' }]}>Tạo mục mới</Text>

            <View style={styles.createToggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isCreatingFolder && styles.toggleBtnActive]}
                onPress={() => setIsCreatingFolder(false)}
              >
                <Text style={[styles.toggleText, !isCreatingFolder && styles.toggleTextActive]}>File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isCreatingFolder && styles.toggleBtnActive]}
                onPress={() => setIsCreatingFolder(true)}
              >
                <Text style={[styles.toggleText, isCreatingFolder && styles.toggleTextActive]}>Thư mục</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.createInput,
                {
                  color: isLight ? '#0F172A' : '#F0F2F8',
                  backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.06)',
                },
              ]}
              placeholder={isCreatingFolder ? 'Ví dụ: MyFolder' : 'Ví dụ: config.plist'}
              placeholderTextColor={isLight ? '#94A3B8' : 'rgba(240,242,248,0.4)'}
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
            />

            <View style={styles.createActions}>
              <TouchableOpacity
                style={[styles.createCancelBtn, { backgroundColor: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.08)' }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={{ color: isLight ? '#64748B' : 'rgba(240,242,248,0.7)', fontWeight: '600' }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createConfirmBtn} onPress={handleCreateNew}>
                <Text style={styles.createConfirmText}>Tạo ngay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  btnCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerPath: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  fileCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  fileCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconBox: {
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 6,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  editorContainer: {
    flex: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  editorTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  editorTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  editorSub: {
    fontSize: 11,
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saveBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  editorScroll: {
    flex: 1,
    padding: 12,
  },
  editorInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
    borderRadius: 12,
    minHeight: height * 0.7,
    textAlignVertical: 'top',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  createCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
  },
  createTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  createToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#00F0FF',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  toggleTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  createInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 16,
  },
  createActions: {
    flexDirection: 'row',
    gap: 10,
  },
  createCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createConfirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#00F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createConfirmText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
});
