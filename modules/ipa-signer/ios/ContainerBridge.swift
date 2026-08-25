import Foundation
import UIKit

// MARK: - App Data Models
public struct ResolvedAppRecord: Codable {
    public let bundleId: String
    public let name: String
    public let containerPath: String
    public let version: String
    public let iconBase64: String
}

// MARK: - Container Bridge Manager
public class ContainerBridge {
    static let appDataRoot = "/var/mobile/Containers/Data/Application"
    static let systemDataRoot = "/var/mobile/Containers/Data/System"
    private static let cacheKey = "VSign_ResolvedApps_3105_v3"

    static let researchAppIdentifiers = [
        "com.apple.mobilesafari", "com.apple.mobilenotes", "com.apple.Maps",
        "com.apple.facetime", "com.apple.iBooks", "com.apple.podcasts",
        "com.apple.PosterBoard", "com.apple.mobilemail", "com.apple.weather",
        "com.apple.camera", "com.apple.Health", "com.apple.Fitness",
        "com.apple.tips", "com.apple.Passbook", "com.apple.reminders",
        "com.apple.stocks", "com.apple.news", "com.apple.Home", "com.apple.tv",
        "com.apple.shortcuts", "com.apple.freeform", "com.apple.calculator",
        "com.apple.MobileSMS", "com.apple.InCallService", "com.apple.Preferences",
        "com.apple.springboard", "com.apple.Photos", "com.apple.AppStore",
        "com.apple.Music", "com.apple.Bridge", "com.apple.Clock",
        "com.apple.VoiceMemos", "com.apple.Translate", "com.apple.measure",
        "com.apple.compass", "com.apple.Magnifier", "com.apple.DocumentsApp",
        "com.facebook.Facebook", "com.facebook.Messenger", "com.zhiliaoapp.musically",
        "com.ss.iphone.ugc.Ame", "com.google.ios.youtube", "ph.telegra.Telegraph",
        "com.vng.zalo", "com.burbn.instagram", "com.google.Chrome",
        "com.spotify.client", "com.atebits.Tweetie2", "com.shopee.vn",
        "com.lazada.vietnam", "com.grabtaxi.passenger", "com.tencent.xin",
        "com.hammerandchisel.discord", "com.netflix.Netflix", "com.capcut.videoeditor",
        "com.adobe.lumiere", "com.microsoft.Office.Word", "com.microsoft.Office.Excel",
        "com.toyopagroup.picaboo", "com.skype.skype", "com.openai.chat",
        "com.antigravity.ios", "com.applecert.AppChinhChu", "com.garena.game.kgvn",
        "com.dts.freefireth", "com.tencent.ig", "com.roblox.roblox", "com.mojang.minecraftpe",
        "com.miHoYo.GenshinImpact", "com.vng.pubgmobile"
    ]

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

    // MARK: - Bundle Metadata Catalog
    private static func applicationBundleMetadataCatalog() -> [String: (displayName: String, version: String)] {
        var catalog: [String: (displayName: String, version: String)] = [:]
        let roots = [
            ("/var/containers/Bundle/Application", true),
            ("/Applications", false),
            ("/System/Applications", false)
        ]

        let fm = FileManager.default
        for (rootPath, nested) in roots {
            let handle = grantContainerAccess(rootPath)
            defer { if handle >= 0 { bad_query_release(handle) } }

            guard let entries = try? fm.contentsOfDirectory(atPath: rootPath) else { continue }
            var appBundlePaths: [String] = []

            if nested {
                for entry in entries.prefix(128) {
                    guard UUID(uuidString: entry) != nil else { continue }
                    let container = (rootPath as NSString).appendingPathComponent(entry)
                    let subhandle = grantContainerAccess(container)
                    defer { if subhandle >= 0 { bad_query_release(subhandle) } }

                    if let subEntries = try? fm.contentsOfDirectory(atPath: container) {
                        for sub in subEntries where sub.hasSuffix(".app") {
                            appBundlePaths.append((container as NSString).appendingPathComponent(sub))
                        }
                    }
                }
            } else {
                for entry in entries where entry.hasSuffix(".app") {
                    appBundlePaths.append((rootPath as NSString).appendingPathComponent(entry))
                }
            }

            for appPath in appBundlePaths {
                let infoPath = (appPath as NSString).appendingPathComponent("Info.plist")
                if let data = try? Data(contentsOf: URL(fileURLWithPath: infoPath)),
                   let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any] {
                    let bundleId = plist["CFBundleIdentifier"] as? String ?? ""
                    let name = (plist["CFBundleDisplayName"] as? String) ?? (plist["CFBundleName"] as? String) ?? ""
                    let version = (plist["CFBundleShortVersionString"] as? String) ?? (plist["CFBundleVersion"] as? String) ?? ""
                    if !bundleId.isEmpty {
                        catalog[bundleId] = (name.isEmpty ? bundleId : name, version)
                    }
                }
            }
        }
        return catalog
    }

    // MARK: - Container Metadata & Candidate Inspection
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

        // Fallback 1: inspect Library/Preferences/*.plist
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

        // Fallback 3: inspect Library/SplashBoard/Snapshots or WebKit
        let splashDir = (containerPath as NSString).appendingPathComponent("Library/SplashBoard/Snapshots")
        if let splashFiles = try? FileManager.default.contentsOfDirectory(atPath: splashDir) {
            for file in splashFiles where file.contains(".") && !file.hasPrefix(".") {
                if file.contains(" - ") {
                    let cand = file.components(separatedBy: " - ").first ?? file
                    if cand.contains(".") { return (cand, "") }
                }
                return (file, "")
            }
        }

        return nil
    }

    // MARK: - Full Multi-Stage App Enumeration & Caching
    public static func getInstalledApps() -> [[String: Any]] {
        // First load fast from cache if exists
        let cached = loadCachedApps()

        var appMap: [String: [String: Any]] = [:]
        for item in cached {
            if let bid = item["bundleId"] as? String {
                appMap[bid] = item
            }
        }

        // 1. Bundle Metadata Catalog from /var/containers/Bundle and /Applications
        let bundleMeta = applicationBundleMetadataCatalog()

        // 2. PRIMARY: Query LaunchServices & MobileInstallation
        let rawInfo = installedAppInfo() as? [String: [String: Any]] ?? [:]
        for (bundleID, info) in rawInfo {
            var containerPath = info["container"] as? String ?? ""
            if containerPath.isEmpty {
                var lookupError: NSString?
                if let resolved = MCMActivateContainerPath(2, bundleID, false, &lookupError) as String?,
                   !resolved.isEmpty {
                    containerPath = resolved
                }
            }

            var iconBase64 = appMap[bundleID]?["icon"] as? String ?? ""
            if iconBase64.isEmpty,
               let img = iconForBundleID(bundleID),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            let meta = bundleMeta[bundleID]
            let appName = (meta?.displayName.isEmpty == false ? meta?.displayName : nil) ?? (info["name"] as? String) ?? bundleID
            let version = (meta?.version.isEmpty == false ? meta?.version : nil) ?? (info["version"] as? String) ?? ""

            appMap[bundleID] = [
                "bundleId": bundleID,
                "name": appName,
                "containerPath": containerPath,
                "version": version,
                "icon": iconBase64
            ]
        }

        // 3. SECONDARY: MCM Class-2 Dynamic Identifiers
        var enumError: NSString?
        let mcmIdentifiers = MCMEnumerateIdentifiersForClass(2, 1024, &enumError)
        var allCandidates = Set(mcmIdentifiers)
        allCandidates.formUnion(researchAppIdentifiers)
        allCandidates.formUnion(bundleMeta.keys)

        for bundleID in allCandidates {
            if appMap[bundleID] != nil && !(appMap[bundleID]?["containerPath"] as? String ?? "").isEmpty {
                continue
            }
            var lookupError: NSString?
            guard let containerPath = MCMActivateContainerPath(2, bundleID, false, &lookupError) as String?,
                  !containerPath.isEmpty else {
                continue
            }

            let singleInfo = appInfoForBundleID(bundleID) as? [String: Any] ?? [:]
            let meta = bundleMeta[bundleID]
            let appName = (meta?.displayName.isEmpty == false ? meta?.displayName : nil) ?? (singleInfo["name"] as? String) ?? bundleID
            let version = (meta?.version.isEmpty == false ? meta?.version : nil) ?? (singleInfo["version"] as? String) ?? ""

            var iconBase64 = appMap[bundleID]?["icon"] as? String ?? ""
            if iconBase64.isEmpty,
               let img = iconForBundleID(bundleID),
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

        // 4. TERTIARY: Physical Inode Root Enumeration & Inferred metadata
        let containerDirs = enumerateRootContainers()
        for dir in containerDirs {
            let uuid = (dir as NSString).lastPathComponent
            guard UUID(uuidString: uuid) != nil else { continue }

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
                let singleInfo = appInfoForBundleID(bundleID) as? [String: Any] ?? [:]
                let meta = bundleMeta[bundleID]
                appName = (meta?.displayName.isEmpty == false ? meta?.displayName : nil) ?? (singleInfo["name"] as? String) ?? bundleID
            }

            var iconBase64 = ""
            if let img = iconForBundleID(bundleID),
               let pngData = img.pngData() {
                iconBase64 = "data:image/png;base64," + pngData.base64EncodedString()
            }

            let singleInfo = appInfoForBundleID(bundleID) as? [String: Any] ?? [:]
            let version = (singleInfo["version"] as? String) ?? bundleMeta[bundleID]?.version ?? ""

            appMap[bundleID] = [
                "bundleId": bundleID,
                "name": appName,
                "containerPath": dir,
                "version": version,
                "icon": iconBase64
            ]
        }

        let finalResults = Array(appMap.values).sorted {
            let n1 = $0["name"] as? String ?? ""
            let n2 = $1["name"] as? String ?? ""
            return n1.localizedCaseInsensitiveCompare(n2) == .orderedAscending
        }

        saveCachedApps(finalResults)
        return finalResults
    }

    private static func loadCachedApps() -> [[String: Any]] {
        guard let data = UserDefaults.standard.data(forKey: cacheKey),
              let records = try? JSONDecoder().decode([ResolvedAppRecord].self, from: data) else {
            return []
        }
        return records.map {
            [
                "bundleId": $0.bundleId,
                "name": $0.name,
                "containerPath": $0.containerPath,
                "version": $0.version,
                "icon": $0.iconBase64
            ]
        }
    }

    private static func saveCachedApps(_ apps: [[String: Any]]) {
        let records = apps.compactMap { dict -> ResolvedAppRecord? in
            guard let bundleId = dict["bundleId"] as? String,
                  let name = dict["name"] as? String,
                  let containerPath = dict["containerPath"] as? String else {
                return nil
            }
            return ResolvedAppRecord(
                bundleId: bundleId,
                name: name,
                containerPath: containerPath,
                version: dict["version"] as? String ?? "",
                iconBase64: dict["icon"] as? String ?? ""
            )
        }
        if let data = try? JSONEncoder().encode(records) {
            UserDefaults.standard.set(data, forKey: cacheKey)
        }
    }

    // MARK: - File Browser I/O
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

    public static func createDirectory(at path: String) -> Bool {
        let handle = grantContainerAccess((path as NSString).deletingLastPathComponent)
        defer { if handle >= 0 { bad_query_release(handle) } }

        do {
            try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true, attributes: nil)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Deep Storage Cleaner & Diagnostics
    public static func getContainerStorageBreakdown(containerPath: String) -> [String: Int64] {
        let handle = grantContainerAccess(containerPath)
        defer { if handle >= 0 { bad_query_release(handle) } }

        let fm = FileManager.default
        func dirSize(_ path: String) -> Int64 {
            guard let enumerator = fm.enumerator(atPath: path) else { return 0 }
            var total: Int64 = 0
            while let file = enumerator.nextObject() as? String {
                let full = (path as NSString).appendingPathComponent(file)
                if let attr = try? fm.attributesOfItem(atPath: full),
                   let size = (attr[.size] as? NSNumber)?.int64Value {
                    total += size
                }
            }
            return total
        }

        let caches = dirSize((containerPath as NSString).appendingPathComponent("Library/Caches"))
        let webkit = dirSize((containerPath as NSString).appendingPathComponent("Library/WebKit"))
        let splashboard = dirSize((containerPath as NSString).appendingPathComponent("Library/SplashBoard"))
        let tmp = dirSize((containerPath as NSString).appendingPathComponent("tmp"))
        let docs = dirSize((containerPath as NSString).appendingPathComponent("Documents"))

        return [
            "caches": caches,
            "webkit": webkit,
            "splashboard": splashboard,
            "tmp": tmp,
            "documents": docs,
            "total": caches + webkit + splashboard + tmp + docs
        ]
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
