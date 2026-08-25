import Foundation
import UIKit

// MARK: - C Bridge Declarations
@_silgen_name("bad_query")
func bad_query(_ path: UnsafePointer<Int8>, _ create: Bool, _ group_identifier: UnsafePointer<Int8>?, _ is_group: Bool) -> Int64

@_silgen_name("bad_query_list")
func bad_query_list(_ path: UnsafePointer<Int8>, _ max_inode: Int64) -> UnsafeMutablePointer<Int8>?

@_silgen_name("bad_query_release")
func bad_query_release(_ handle: Int64)

@_silgen_name("MCMActivateContainerPath")
func MCMActivateContainerPath(_ cls: UInt64, _ identifier: NSString, _ group: Bool, _ error: AutoreleasingUnsafeMutablePointer<NSString?>?) -> NSString?

@_silgen_name("installedAppInfo")
func installedAppInfo() -> NSDictionary

@_silgen_name("iconForBundleID")
func iconForBundleID(_ bundleID: NSString) -> UIImage?

@_silgen_name("appInfoForBundleID")
func appInfoForBundleID(_ bundleID: NSString) -> NSDictionary

@_silgen_name("openApplicationForBundleID")
func openApplicationForBundleID(_ bundleID: NSString) -> Bool

// MARK: - Container Bridge Manager
public class ContainerBridge {
    static let appDataRoot = "/var/mobile/Containers/Data/Application"

    public static func grantContainerAccess(_ path: String) -> Int64 {
        let clean = path.hasSuffix("/") ? String(path.dropLast()) : path
        var pathC = clean.utf8CString.map { Int8($0) }
        return bad_query(&pathC, true, nil, false)
    }

    public static func enumerateRootContainers() -> [String] {
        let clean = appDataRoot
        if let names = try? FileManager.default.contentsOfDirectory(atPath: clean), !names.isEmpty {
            return names.map { (clean as NSString).appendingPathComponent($0) }
        }

        let handle = grantContainerAccess(clean)
        if handle >= 0 {
            defer { bad_query_release(handle) }
            if let names = try? FileManager.default.contentsOfDirectory(atPath: clean), !names.isEmpty {
                return names.map { (clean as NSString).appendingPathComponent($0) }
            }
        }

        var pathC = clean.utf8CString.map { Int8($0) }
        guard let result = bad_query_list(&pathC, 20_000_000) else {
            return []
        }
        defer { free(result) }
        let list = String(cString: result).components(separatedBy: "\n").filter { !$0.isEmpty }
        return list
    }

    public static func readMetadata(at containerPath: String) -> (bundleID: String, name: String)? {
        let metaPath = (containerPath as NSString).appendingPathComponent(".com.apple.mobile_container_manager.metadata.plist")
        let handle = grantContainerAccess(containerPath)
        defer { if handle >= 0 { bad_query_release(handle) } }

        var data: Data?
        if let fd = fopen(metaPath, "r") {
            var buffer = [UInt8](repeating: 0, count: 65536)
            var bytes: [UInt8] = []
            while true {
                let n = fread(&buffer, 1, buffer.count, fd)
                if n <= 0 { break }
                bytes.append(contentsOf: buffer[0..<n])
            }
            fclose(fd)
            if !bytes.isEmpty { data = Data(bytes) }
        }
        if data == nil { data = try? Data(contentsOf: URL(fileURLWithPath: metaPath)) }

        guard let validData = data,
              let plist = try? PropertyListSerialization.propertyList(from: validData, options: [], format: nil) as? [String: Any] else {
            return nil
        }

        let bundleID = plist["MCMMetadataIdentifier"] as? String ?? ""
        var name = ""
        if let info = plist["MCMMetadataInfo"] as? [String: Any] {
            name = (info["CFBundleDisplayName"] as? String) ?? (info["CFBundleName"] as? String) ?? ""
        }
        return (bundleID, name)
    }

    public static func getInstalledApps() -> [[String: Any]] {
        let containerDirs = enumerateRootContainers()
        var results: [[String: Any]] = []

        for dir in containerDirs {
            let uuid = (dir as NSString).lastPathComponent
            guard UUID(uuidString: uuid) != nil else { continue }

            var bundleID = uuid
            var appName = "Container " + String(uuid.prefix(6))
            var version = ""
            var iconBase64 = ""

            if let meta = readMetadata(at: dir) {
                let cleanID = meta.bundleID.trimmingCharacters(in: .whitespacesAndNewlines)
                if !cleanID.isEmpty {
                    bundleID = cleanID
                    let rawInfo = appInfoForBundleID(cleanID as NSString) as? [String: Any] ?? [:]
                    appName = meta.name.isEmpty ? (rawInfo["name"] as? String ?? cleanID) : meta.name
                    version = rawInfo["version"] as? String ?? ""
                }
            }

            if let img = iconForBundleID(bundleID as NSString),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            results.append([
                "bundleId": bundleID,
                "name": appName,
                "containerPath": dir,
                "version": version,
                "icon": iconBase64
            ])
        }

        results.sort {
            let n1 = $0["name"] as? String ?? ""
            let n2 = $1["name"] as? String ?? ""
            return n1.localizedCaseInsensitiveCompare(n2) == .orderedAscending
        }
        return results
    }

    public static func listDirectory(at path: String) -> [[String: Any]] {
        let handle = grantContainerAccess(path)
        defer { if handle >= 0 { bad_query_release(handle) } }

        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: path) else {
            return []
        }

        return names.compactMap { name -> [String: Any]? in
            let fullPath = (path as NSString).appendingPathComponent(name)
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: fullPath, isDirectory: &isDir) else { return nil }

            let attrs = (try? fm.attributesOfItem(atPath: fullPath)) ?? [:]
            let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            let modDate = attrs[.modificationDate] as? Date

            return [
                "name": name,
                "path": fullPath,
                "isDirectory": isDir.boolValue,
                "size": size,
                "modified": modDate?.timeIntervalSince1970 ?? 0
            ]
        }.sorted {
            let d1 = $0["isDirectory"] as? Bool ?? false
            let d2 = $1["isDirectory"] as? Bool ?? false
            if d1 != d2 { return d1 }
            let n1 = $0["name"] as? String ?? ""
            let n2 = $1["name"] as? String ?? ""
            return n1.localizedCaseInsensitiveCompare(n2) == .orderedAscending
        }
    }

    public static func readFile(at path: String) -> (content: String, isBinary: Bool)? {
        let handle = grantContainerAccess(path)
        defer { if handle >= 0 { bad_query_release(handle) } }

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
            return nil
        }

        if let text = String(data: data, encoding: .utf8) {
            return (text, false)
        } else {
            return (data.base64EncodedString(), true)
        }
    }

    public static func writeFile(at path: String, content: String, isBase64: Bool) -> Bool {
        let dir = (path as NSString).deletingLastPathComponent
        let handle = grantContainerAccess(dir)
        defer { if handle >= 0 { bad_query_release(handle) } }

        let data: Data?
        if isBase64 {
            data = Data(base64Encoded: content)
        } else {
            data = content.data(using: .utf8)
        }

        guard let validData = data else { return false }
        do {
            try validData.write(to: URL(fileURLWithPath: path), options: .atomic)
            return true
        } catch {
            return false
        }
    }

    public static func deleteItem(at path: String) -> Bool {
        let handle = grantContainerAccess(path)
        defer { if handle >= 0 { bad_query_release(handle) } }

        do {
            try FileManager.default.removeItem(atPath: path)
            return true
        } catch {
            return false
        }
    }

    public static func cleanAppCache(containerPath: String) -> Int64 {
        let handle = grantContainerAccess(containerPath)
        defer { if handle >= 0 { bad_query_release(handle) } }

        let fm = FileManager.default
        let cacheDirs = [
            (containerPath as NSString).appendingPathComponent("Library/Caches"),
            (containerPath as NSString).appendingPathComponent("Library/WebKit"),
            (containerPath as NSString).appendingPathComponent("Library/SplashBoard"),
            (containerPath as NSString).appendingPathComponent("tmp")
        ]

        var freedBytes: Int64 = 0
        for dir in cacheDirs {
            if let entries = try? fm.contentsOfDirectory(atPath: dir) {
                for entry in entries {
                    let entryPath = (dir as NSString).appendingPathComponent(entry)
                    let size = (try? fm.attributesOfItem(atPath: entryPath)[.size] as? NSNumber)?.int64Value ?? 0
                    if (try? fm.removeItem(atPath: entryPath)) != nil {
                        freedBytes += size
                    }
                }
            }
        }
        return freedBytes
    }
}
