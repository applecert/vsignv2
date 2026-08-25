#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

NSDictionary<NSString *, NSDictionary *> *installedAppInfo(void);
UIImage *iconForBundleID(NSString *bundleID);
NSDictionary *appInfoForBundleID(NSString *bundleID);
BOOL openApplicationForBundleID(NSString *bundleID);

NS_ASSUME_NONNULL_END
