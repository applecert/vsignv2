import Foundation
import UIKit

// MARK: - Container Bridge Manager
public class ContainerBridge {
    static let appDataRoot = "/var/mobile/Containers/Data/Application"
    private static let cacheKey = "VSign_ResolvedAppsCache_v2"

    public static func grantContainerAccess(_ path: String) -> Int64 {
        let clean = path.hasSuffix("/") ? String(path.dropLast()) : path
        return bad_query(clean, true, nil, false)
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

        guard let result = bad_query_list(clean, 20_000_000) else {
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

        if let validData = data,
           let plist = try? PropertyListSerialization.propertyList(from: validData, options: [], format: nil) as? [String: Any] {
            let bundleID = plist["MCMMetadataIdentifier"] as? String ?? ""
            var name = ""
            if let info = plist["MCMMetadataInfo"] as? [String: Any] {
                name = (info["CFBundleDisplayName"] as? String) ?? (info["CFBundleName"] as? String) ?? ""
            }
            if !bundleID.isEmpty {
                return (bundleID, name)
            }
        }

        // Fallback 1: inspect Library/Preferences/*.plist for the bundle identifier
        let prefsDir = (containerPath as NSString).appendingPathComponent("Library/Preferences")
        if let prefFiles = try? FileManager.default.contentsOfDirectory(atPath: prefsDir) {
            for file in prefFiles where file.hasSuffix(".plist") && !file.hasPrefix(".") && !file.hasPrefix("com.apple.") {
                let candidateID = String(file.dropLast(".plist".count))
                if candidateID.contains(".") && candidateID.count > 4 {
                    return (candidateID, "")
                }
            }
            for file in prefFiles where file.hasSuffix(".plist") && !file.hasPrefix(".") {
                let candidateID = String(file.dropLast(".plist".count))
                if candidateID.contains(".") && candidateID.count > 4 {
                    return (candidateID, "")
                }
            }
        }

        // Fallback 2: inspect Library/Saved Application State/*.savedState
        let stateDir = (containerPath as NSString).appendingPathComponent("Library/Saved Application State")
        if let stateFiles = try? FileManager.default.contentsOfDirectory(atPath: stateDir) {
            for file in stateFiles where file.hasSuffix(".savedState") {
                let candidateID = String(file.dropLast(".savedState".count))
                if candidateID.contains(".") {
                    return (candidateID, "")
                }
            }
        }

        return nil
    }

    public static func getInstalledApps() -> [[String: Any]] {
        var appMap: [String: [String: Any]] = [:]

        // 1. PRIMARY: Query LaunchServices & MobileInstallation
        let rawInfo = installedAppInfo() as? [String: [String: Any]] ?? [:]
        for (bundleID, info) in rawInfo {
            var containerPath = info["container"] as? String ?? ""
            if containerPath.isEmpty {
                var lookupError: NSString?
                if let resolved = MCMActivateContainerPath(2, bundleID as NSString, false, &lookupError) as String?,
                   !resolved.isEmpty {
                    containerPath = resolved
                }
            }

            var iconBase64 = ""
            if let img = iconForBundleID(bundleID as NSString),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            let appName = info["name"] as? String ?? bundleID
            let version = info["version"] as? String ?? ""

            appMap[bundleID] = [
                "bundleId": bundleID,
                "name": appName,
                "containerPath": containerPath,
                "version": version,
                "icon": iconBase64
            ]
        }

        // 2. SECONDARY: MCM Class-2 Enumeration (MobileContainerManager)
        var enumError: NSString?
        let mcmIdentifiers = (MCMEnumerateIdentifiersForClass(2, 1024, &enumError) as? [String]) ?? []
        for bundleID in mcmIdentifiers {
            if appMap[bundleID] != nil && !(appMap[bundleID]?["containerPath"] as? String ?? "").isEmpty {
                continue
            }
            var lookupError: NSString?
            guard let containerPath = MCMActivateContainerPath(2, bundleID as NSString, false, &lookupError) as String?,
                  !containerPath.isEmpty else {
                continue
            }

            let singleInfo = appInfoForBundleID(bundleID as NSString) as? [String: Any] ?? [:]
            let appName = (singleInfo["name"] as? String) ?? bundleID
            let version = (singleInfo["version"] as? String) ?? ""

            var iconBase64 = ""
            if let img = iconForBundleID(bundleID as NSString),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            appMap[bundleID] = [
                "bundleId": bundleID,
                "name": appName,
                "containerPath": containerPath,
                "version": version,
                "icon": iconBase64
            ]
        }

        // 3. TERTIARY: Physical Inode Root Enumeration & Metadata inspection
        let containerDirs = enumerateRootContainers()
        for dir in containerDirs {
            let uuid = (dir as NSString).lastPathComponent
            guard UUID(uuidString: uuid) != nil else { continue }

            // Check if any known app already maps to this container directory
            let alreadyMapped = appMap.values.contains { ($0["containerPath"] as? String ?? "") == dir }
            if alreadyMapped { continue }

            var bundleID = ""
            var appName = ""
            if let meta = readMetadata(at: dir) {
                bundleID = meta.bundleID.trimmingCharacters(in: .whitespacesAndNewlines)
                appName = meta.name
            }

            if bundleID.isEmpty {
                bundleID = "com.apple.container." + String(uuid.prefix(8))
                appName = "App " + String(uuid.prefix(6))
            } else if appName.isEmpty {
                let singleInfo = appInfoForBundleID(bundleID as NSString) as? [String: Any] ?? [:]
                appName = (singleInfo["name"] as? String) ?? bundleID
            }

            var iconBase64 = ""
            if let img = iconForBundleID(bundleID as NSString),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            let singleInfo = appInfoForBundleID(bundleID as NSString) as? [String: Any] ?? [:]
            let version = singleInfo["version"] as? String ?? ""

            appMap[bundleID] = [
                "bundleId": bundleID,
                "name": appName,
                "containerPath": dir,
                "version": version,
                "icon": iconBase64
            ]
        }

        // Filter out entries without a usable container path if user wants to browse
        let finalResults = Array(appMap.values).sorted {
            let n1 = $0["name"] as? String ?? ""
            let n2 = $1["name"] as? String ?? ""
            return n1.localizedCaseInsensitiveCompare(n2) == .orderedAscending
        }

        return finalResults
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
