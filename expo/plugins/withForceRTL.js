const { withAppDelegate } = require('@expo/config-plugins');
const { withMainApplication } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const RTL_TAG = 'expo-force-rtl';

// Safe wrapper around mergeContents: if the anchor can't be matched (e.g. the
// native template changed between Expo SDK versions), we log a warning and skip
// the injection instead of throwing, which would crash the whole build/prebuild.
function safeMerge(label, options) {
  try {
    return mergeContents(options);
  } catch (e) {
    console.warn(
      `[withForceRTL] Skipped "${label}" injection: ${e?.message || e}`
    );
    return { contents: options.src, didMerge: false, didClear: false };
  }
}

function addRTLToAppDelegateSwift(contents) {
  // Insert right after the line that opens the function body ("... -> Bool {").
  return safeMerge('AppDelegate.swift', {
    tag: RTL_TAG,
    src: contents,
    newSrc: [
      '    // Keep Yoga LTR; Hebrew UI is mirrored manually in JS (lib/rtl.ts)',
      '    RCTI18nUtil.sharedInstance().allowRTL(false)',
      '    RCTI18nUtil.sharedInstance().forceRTL(false)',
    ].join('\n'),
    anchor: /didFinishLaunchingWithOptions launchOptions:/,
    offset: 2,
    comment: '//',
  });
}

function addRTLToAppDelegateObjC(contents) {
  const withImport = safeMerge('AppDelegate.m import', {
    tag: RTL_TAG + '-import',
    src: contents,
    newSrc: '#import <React/RCTI18nUtil.h>',
    anchor: /#import .*React/,
    offset: 0,
    comment: '//',
  });
  if (withImport.didMerge) {
    contents = withImport.contents;
  }
  return safeMerge('AppDelegate.m', {
    tag: RTL_TAG,
    src: contents,
    newSrc: [
      '  // Keep Yoga LTR; Hebrew UI is mirrored manually in JS (lib/rtl.ts)',
      '  [[RCTI18nUtil sharedInstance] allowRTL:NO];',
      '  [[RCTI18nUtil sharedInstance] forceRTL:NO];',
    ].join('\n'),
    anchor: /didFinishLaunchingWithOptions/,
    offset: 2,
    comment: '//',
  });
}

function addRTLToMainApplication(contents) {
  const withImport = safeMerge('MainApplication import', {
    tag: RTL_TAG + '-import-android',
    src: contents,
    newSrc: 'import com.facebook.react.modules.i18nmanager.I18nUtil',
    anchor: /import com\.facebook\.react/,
    offset: 0,
    comment: '//',
  });
  const result = withImport.didMerge ? withImport : { contents, didMerge: false };
  // Insert *after* super.onCreate() (offset 1) so the statements land inside the
  // onCreate() function body. offset -1 would place them in the class body and
  // produce "Expecting member declaration" Kotlin syntax errors.
  return safeMerge('MainApplication onCreate', {
    tag: RTL_TAG,
    src: result.contents,
    newSrc: [
      '    // Keep Yoga LTR; Hebrew UI is mirrored manually in JS (lib/rtl.ts)',
      '    I18nUtil.getInstance().allowRTL(this, false)',
      '    I18nUtil.getInstance().forceRTL(this, false)',
    ].join('\n'),
    anchor: /super\.onCreate\(\)/,
    offset: 1,
    comment: '//',
  });
}

const withForceRTL = (config) => {
  config = withAppDelegate(config, (config) => {
    const { contents, language } = config.modResults;
    let result;
    if (language === 'swift') {
      result = addRTLToAppDelegateSwift(contents);
    } else if (language === 'objc' || language === 'objcpp') {
      result = addRTLToAppDelegateObjC(contents);
    } else {
      return config;
    }
    if (result.didMerge) {
      config.modResults.contents = result.contents;
    }
    return config;
  });

  config = withMainApplication(config, (config) => {
    // This plugin only supports Kotlin MainApplication (Expo SDK 50+).
    if (config.modResults.language !== 'kt') {
      console.warn(
        '[withForceRTL] MainApplication is not Kotlin (.kt); skipping Android RTL injection.'
      );
      return config;
    }
    const contents = config.modResults.contents;
    const result = addRTLToMainApplication(contents);
    if (result.didMerge) {
      config.modResults.contents = result.contents;
    }
    return config;
  });

  return config;
};

module.exports = withForceRTL;
