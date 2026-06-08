const { withAppDelegate } = require('@expo/config-plugins');
const { withMainApplication } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const RTL_TAG = 'expo-force-rtl';

function addRTLToAppDelegateSwift(contents) {
  // Match the didFinishLaunchingWithOptions parameter line; insert after next line (") -> Bool {") so offset 2.
  return mergeContents({
    tag: RTL_TAG,
    src: contents,
    newSrc: [
      '    // Force RTL layout regardless of device language',
      '    RCTI18nUtil.sharedInstance().allowRTL(true)',
      '    RCTI18nUtil.sharedInstance().forceRTL(true)',
    ].join('\n'),
    anchor: /didFinishLaunchingWithOptions launchOptions:/,
    offset: 2,
    comment: '//',
  });
}

function addRTLToAppDelegateObjC(contents) {
  const withImport = mergeContents({
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
  return mergeContents({
    tag: RTL_TAG,
    src: contents,
    newSrc: [
      '  // Force RTL layout regardless of device language',
      '  [[RCTI18nUtil sharedInstance] allowRTL:YES];',
      '  [[RCTI18nUtil sharedInstance] forceRTL:YES];',
    ].join('\n'),
    anchor: /didFinishLaunchingWithOptions/,
    offset: 2,
    comment: '//',
  });
}

function addRTLToMainApplication(contents) {
  const withImport = mergeContents({
    tag: RTL_TAG + '-import-android',
    src: contents,
    newSrc: 'import com.facebook.react.modules.i18nmanager.I18nUtil;',
    anchor: /import com\.facebook\.react/,
    offset: 0,
    comment: '//',
  });
  let result = withImport.didMerge ? withImport : { contents, didMerge: false };
  const withRTL = mergeContents({
    tag: RTL_TAG,
    src: result.contents,
    newSrc: [
      '      // Force RTL layout regardless of device language',
      '      I18nUtil.getInstance().allowRTL(this, true);',
      '      I18nUtil.getInstance().forceRTL(this, true);',
    ].join('\n'),
    anchor: /super\.onCreate\(\)/,
    offset: 1,
    comment: '//',
  });
  return withRTL;
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
