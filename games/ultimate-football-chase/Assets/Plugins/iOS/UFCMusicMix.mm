// Original, minimal iOS audio mixing hook. Real-device validation remains required.
#import <AVFoundation/AVFoundation.h>
extern "C" void UFC_UseAmbientAudioSession(void) {
    NSError *error = nil;
    [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryAmbient error:&error];
    if (error != nil) NSLog(@"UFC ambient audio category failed: %@", error.localizedDescription);
}
