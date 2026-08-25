import ExpoModulesCore
import Foundation
import UIKit

// Khai báo liên kết trực tiếp với hàm C++ zsign_wrapper trong ZSignWrapper.mm
@_silgen_name("zsign_wrapper")
func zsign_wrapper(
  _ ipa: UnsafePointer<Int8>,
  _ p12: UnsafePointer<Int8>,
  _ prov: UnsafePointer<Int8>,
  _ pass: UnsafePointer<Int8>,
  _ out: UnsafePointer<Int8>,
  _ bundleId: UnsafePointer<Int8>,
  _ displayName: UnsafePointer<Int8>,
  _ iconPath: UnsafePointer<Int8>
) -> Int32

// Khai báo liên kết với hàm get_ipa_info_wrapper trong ZSignWrapper.mm
@_silgen_name("get_ipa_info_wrapper")
func get_ipa_info_wrapper(
  _ ipa: UnsafePointer<Int8>,
  _ tempDir: UnsafePointer<Int8>
) -> UnsafePointer<Int8>

// Hàm tiện ích: làm sạch đường dẫn file
private func cleanPath(_ rawPath: String) -> String {
  var path = rawPath
  if path.hasPrefix("file://") {
    path = String(path.dropFirst(7))
  }
  path = path.removingPercentEncoding ?? path
  return path
}

public class IpaSignerModule: Module {
  private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

  public func definition() -> ModuleDefinition {
    Name("IpaSigner")

    AsyncFunction("startBackgroundTask") { (promise: Promise) in
      DispatchQueue.main.async {
        if self.backgroundTaskId == .invalid {
          self.backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "IpaLocalServerBackground") {
            UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
            self.backgroundTaskId = .invalid
          }
          promise.resolve(self.backgroundTaskId != .invalid)
        } else {
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("endBackgroundTask") { (promise: Promise) in
      DispatchQueue.main.async {
        if self.backgroundTaskId != .invalid {
          UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
          self.backgroundTaskId = .invalid
        }
        promise.resolve(true)
      }
    }

    // Đọc thông tin IPA (Bundle ID và App Name)
    AsyncFunction("getIpaInfo") { (ipaPath: String, promise: Promise) in
      let cleanIpaPath = cleanPath(ipaPath)
      let fm = FileManager.default
      
      guard fm.fileExists(atPath: cleanIpaPath) else {
        promise.reject("FILE_NOT_FOUND", "Không tìm thấy file IPA: \(cleanIpaPath)")
        return
      }
      
      let tempDir = NSTemporaryDirectory()
      
      DispatchQueue.global(qos: .userInitiated).async {
        let infoPtr = get_ipa_info_wrapper(cleanIpaPath, tempDir)
        let infoStr = String(cString: infoPtr)
        
        DispatchQueue.main.async {
          if infoStr.isEmpty {
            promise.reject("READ_ERROR", "Không thể đọc thông tin file IPA.")
          } else {
            let parts = infoStr.components(separatedBy: "///")
            if parts.count >= 2 {
              promise.resolve([
                "bundleId": parts[0],
                "appName": parts[1]
              ])
            } else {
              promise.reject("READ_ERROR", "Thông tin file IPA không đúng định dạng.")
            }
          }
        }
      }
    }

    // Ký IPA ngoại tuyến với các tùy chọn tùy biến
    AsyncFunction("signAppOffline") { (
      ipaPath: String, 
      p12Path: String, 
      provPath: String, 
      password: String, 
      newBundleId: String, 
      newAppName: String, 
      newIconPath: String, 
      promise: Promise
    ) in
      
      let cleanIpaPath = cleanPath(ipaPath)
      let cleanP12Path = cleanPath(p12Path)
      let cleanProvPath = cleanPath(provPath)
      let cleanIconPath = newIconPath.isEmpty ? "" : cleanPath(newIconPath)
      
      let fm = FileManager.default
      
      guard fm.fileExists(atPath: cleanIpaPath) else {
        promise.reject("FILE_NOT_FOUND", "Không tìm thấy file IPA: \(cleanIpaPath)")
        return
      }
      
      guard fm.fileExists(atPath: cleanP12Path) else {
        promise.reject("FILE_NOT_FOUND", "Không tìm thấy file P12: \(cleanP12Path)")
        return
      }
      
      guard fm.fileExists(atPath: cleanProvPath) else {
        promise.reject("FILE_NOT_FOUND", "Không tìm thấy file MobileProvision: \(cleanProvPath)")
        return
      }
      
      if !cleanIconPath.isEmpty && !fm.fileExists(atPath: cleanIconPath) {
        promise.reject("FILE_NOT_FOUND", "Không tìm thấy file Logo mới: \(cleanIconPath)")
        return
      }
      
      let documentDirectory = fm.urls(for: .documentDirectory, in: .userDomainMask).first!
      let outputFilename = "signed_app_\(Int(Date().timeIntervalSince1970)).ipa"
      let outputFilePath = documentDirectory.appendingPathComponent(outputFilename).path
      
      // Khởi tạo tác vụ chạy ngầm của hệ điều hành iOS để tránh bị treo khi thoát ứng dụng
      var bgTaskId: UIBackgroundTaskIdentifier = .invalid
      bgTaskId = UIApplication.shared.beginBackgroundTask(withName: "IpaOfflineSigningTask") {
        UIApplication.shared.endBackgroundTask(bgTaskId)
        bgTaskId = .invalid
      }
      
      DispatchQueue.global(qos: .userInitiated).async {
        // Thực thi ký bằng C++ zsign với các tùy chọn nâng cao
        let result = zsign_wrapper(
          cleanIpaPath, 
          cleanP12Path, 
          cleanProvPath, 
          password, 
          outputFilePath, 
          newBundleId, 
          newAppName, 
          cleanIconPath
        )
        
        DispatchQueue.main.async {
          // Kết thúc tác vụ chạy ngầm khi đã xử lý xong
          if bgTaskId != .invalid {
            UIApplication.shared.endBackgroundTask(bgTaskId)
            bgTaskId = .invalid
          }
          
          if result != 0 {
            let errorMessage: String
            switch result {
            case -1:
              errorMessage = "Lỗi ký IPA (zsign -1): Có thể do file P12 sai mật khẩu, file IPA không hợp lệ, hoặc provisioning profile không khớp với certificate."
            case -2:
              errorMessage = "Lỗi kiểm tra chữ ký (zsign -2): File binary không được ký hoặc chữ ký không hợp lệ."
            default:
              errorMessage = "Lỗi không xác định khi ký IPA (mã lỗi zsign C++: \(result))"
            }
            promise.reject("SIGN_ERROR", errorMessage)
          } else {
            if fm.fileExists(atPath: outputFilePath) {
              let bundleIdPath = outputFilePath + ".bundleid.txt"
              var bundleId = "com.ipaviet.app"
              if fm.fileExists(atPath: bundleIdPath) {
                if let content = try? String(contentsOfFile: bundleIdPath, encoding: .utf8) {
                  bundleId = content.trimmingCharacters(in: .whitespacesAndNewlines)
                  try? fm.removeItem(atPath: bundleIdPath)
                }
              }
              promise.resolve([
                "success": true,
                "outputPath": outputFilePath,
                "bundleId": bundleId
              ])
            } else {
              promise.reject("SIGN_ERROR", "Ký thành công nhưng không tìm thấy file output: \(outputFilePath)")
            }
          }
        }
      }
    }

    // MARK: - App Data & Container Management (3105 Integration)

    AsyncFunction("getInstalledAppContainers") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let apps = ContainerBridge.getInstalledApps()
        DispatchQueue.main.async {
          promise.resolve(apps)
        }
      }
    }

    AsyncFunction("listContainerFiles") { (path: String, promise: Promise) in
      let clean = cleanPath(path)
      DispatchQueue.global(qos: .userInitiated).async {
        let files = ContainerBridge.listDirectory(at: clean)
        DispatchQueue.main.async {
          promise.resolve(files)
        }
      }
    }

    AsyncFunction("readContainerFile") { (path: String, promise: Promise) in
      let clean = cleanPath(path)
      DispatchQueue.global(qos: .userInitiated).async {
        if let result = ContainerBridge.readFile(at: clean) {
          DispatchQueue.main.async {
            promise.resolve([
              "content": result.content,
              "isBinary": result.isBinary
            ])
          }
        } else {
          DispatchQueue.main.async {
            promise.reject("READ_ERROR", "Không thể đọc file: \(clean)")
          }
        }
      }
    }

    AsyncFunction("writeContainerFile") { (path: String, content: String, isBase64: Bool, promise: Promise) in
      let clean = cleanPath(path)
      DispatchQueue.global(qos: .userInitiated).async {
        let success = ContainerBridge.writeFile(at: clean, content: content, isBase64: isBase64)
        DispatchQueue.main.async {
          if success {
            promise.resolve(true)
          } else {
            promise.reject("WRITE_ERROR", "Không thể ghi file: \(clean)")
          }
        }
      }
    }

    AsyncFunction("deleteContainerItem") { (path: String, promise: Promise) in
      let clean = cleanPath(path)
      DispatchQueue.global(qos: .userInitiated).async {
        let success = ContainerBridge.deleteItem(at: clean)
        DispatchQueue.main.async {
          promise.resolve(success)
        }
      }
    }

    AsyncFunction("cleanContainerCache") { (containerPath: String, promise: Promise) in
      let clean = cleanPath(containerPath)
      DispatchQueue.global(qos: .userInitiated).async {
        let freedBytes = ContainerBridge.cleanAppCache(containerPath: clean)
        DispatchQueue.main.async {
          promise.resolve(freedBytes)
        }
      }
    }

    AsyncFunction("getContainerStorageBreakdown") { (containerPath: String, promise: Promise) in
      let clean = cleanPath(containerPath)
      DispatchQueue.global(qos: .userInitiated).async {
        let breakdown = ContainerBridge.getContainerStorageBreakdown(containerPath: clean)
        DispatchQueue.main.async {
          promise.resolve(breakdown)
        }
      }
    }

    AsyncFunction("createContainerDirectory") { (path: String, promise: Promise) in
      let clean = cleanPath(path)
      DispatchQueue.global(qos: .userInitiated).async {
        let success = ContainerBridge.createDirectory(at: clean)
        DispatchQueue.main.async {
          promise.resolve(success)
        }
      }
    }

    AsyncFunction("openInstalledApp") { (bundleId: String, promise: Promise) in
      let result = openApplicationForBundleID(bundleId)
      promise.resolve(result)
    }
  }
}