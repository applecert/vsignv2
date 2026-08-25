import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

// Khởi tạo an toàn lõi Native (không bao giờ crash JS runtime khi chạy Expo Go hoặc môi trường chưa link)
const getIpaSigner = () => {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule('IpaSigner');
  } catch (e) {
    return null;
  }
};

export interface AppContainerInfo {
  bundleId: string;
  name: string;
  containerPath: string;
  version: string;
  icon: string; // Base64 Data URI
}

export interface ContainerFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface ContainerStorageBreakdown {
  caches: number;
  webkit: number;
  splashboard: number;
  tmp: number;
  documents: number;
  total: number;
}

// ==================== BACKGROUND TASK ====================
export async function startBackgroundTask(): Promise<boolean> {
  const native = getIpaSigner();
  if (native?.startBackgroundTask) {
    try {
      return await native.startBackgroundTask();
    } catch {}
  }
  return false;
}

export async function endBackgroundTask(): Promise<boolean> {
  const native = getIpaSigner();
  if (native?.endBackgroundTask) {
    try {
      return await native.endBackgroundTask();
    } catch {}
  }
  return false;
}

// ==================== IPA SIGNING ====================

// Mở cổng nhận các tham số ký IPA ngoại tuyến tùy biến
export async function signAppOffline(
  ipaPath: string, 
  p12Path: string, 
  provPath: string, 
  password: string,
  newBundleId?: string,
  newAppName?: string,
  newIconPath?: string
): Promise<{ outputPath: string; success: boolean; bundleId?: string }> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner chưa được kích hoạt. Hãy build ứng dụng (EAS Build / Xcode) để sử dụng.');
  }
  return await native.signAppOffline(
    ipaPath, 
    p12Path, 
    provPath, 
    password, 
    newBundleId || '', 
    newAppName || '', 
    newIconPath || ''
  );
}

// Hàm đọc siêu dữ liệu IPA (BundleID, AppName) trước khi ký
export async function getIpaInfo(
  ipaPath: string
): Promise<{ bundleId: string; appName: string }> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner không khả dụng trong Expo Go.');
  }
  return await native.getIpaInfo(ipaPath);
}

// ==================== 3105 APP DATA & FILE MANAGER ====================

// Lấy danh sách toàn bộ ứng dụng và container trên máy
export async function getInstalledAppContainers(): Promise<AppContainerInfo[]> {
  const native = getIpaSigner();
  if (!native) {
    console.warn('Lõi Native IpaSigner không khả dụng. Cần build file IPA / Xcode.');
    return [];
  }
  try {
    return await native.getInstalledAppContainers();
  } catch (error) {
    console.error('Error fetching installed app containers:', error);
    return [];
  }
}

// Liệt kê file và thư mục bên trong container
export async function listContainerFiles(path: string): Promise<ContainerFileItem[]> {
  const native = getIpaSigner();
  if (!native) {
    console.warn('Lõi Native IpaSigner không khả dụng.');
    return [];
  }
  try {
    return await native.listContainerFiles(path);
  } catch (error) {
    console.error('Error listing container files:', error);
    return [];
  }
}

// Đọc nội dung file
export async function readContainerFile(path: string): Promise<{ content: string; isBinary: boolean }> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner không khả dụng trong Expo Go.');
  }
  return await native.readContainerFile(path);
}

// Ghi nội dung file (hỗ trợ văn bản hoặc Base64)
export async function writeContainerFile(path: string, content: string, isBase64: boolean = false): Promise<boolean> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner không khả dụng trong Expo Go.');
  }
  return await native.writeContainerFile(path, content, isBase64);
}

// Xóa file hoặc thư mục
export async function deleteContainerItem(path: string): Promise<boolean> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner không khả dụng trong Expo Go.');
  }
  return await native.deleteContainerItem(path);
}

// Tạo thư mục mới
export async function createContainerDirectory(path: string): Promise<boolean> {
  const native = getIpaSigner();
  if (!native) {
    throw new Error('Lõi Native IpaSigner không khả dụng trong Expo Go.');
  }
  try {
    return await native.createContainerDirectory(path);
  } catch {
    return false;
  }
}

// Phân tích chi tiết dung lượng container (Caches, WebKit, SplashBoard, tmp, Docs)
export async function getContainerStorageBreakdown(containerPath: string): Promise<ContainerStorageBreakdown> {
  const native = getIpaSigner();
  if (!native) {
    return { caches: 0, webkit: 0, splashboard: 0, tmp: 0, documents: 0, total: 0 };
  }
  try {
    return await native.getContainerStorageBreakdown(containerPath);
  } catch {
    return { caches: 0, webkit: 0, splashboard: 0, tmp: 0, documents: 0, total: 0 };
  }
}

// Dọn dẹp cache rác của app
export async function cleanContainerCache(containerPath: string): Promise<number> {
  const native = getIpaSigner();
  if (!native) return 0;
  try {
    return await native.cleanContainerCache(containerPath);
  } catch (error) {
    console.error('Error cleaning container cache:', error);
    return 0;
  }
}

// Mở ứng dụng đã cài đặt
export async function openInstalledApp(bundleId: string): Promise<boolean> {
  const native = getIpaSigner();
  if (!native) return false;
  try {
    return await native.openInstalledApp(bundleId);
  } catch (error) {
    console.error('Error opening app:', error);
    return false;
  }
}