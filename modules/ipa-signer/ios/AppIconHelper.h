#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

NSDictionary<NSString *, NSDictionary *> *installedAppInfo(void);
UIImage * _Nullable iconForBundleID(NSString *bundleID);
NSDictionary * _Nullable appInfoForBundleID(NSString *bundleID);
BOOL openApplicationForBundleID(NSString *bundleID);

NS_ASSUME_NONNULL_END
