import React from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareFlatList, KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type KeyboardAwareScrollProps = React.ComponentProps<typeof KeyboardAwareScrollView> & {
  /** When set, reserve space above the floating tab bar (more reliable than paddingBottom on Android). */
  floatingTabBarPadding?: number;
};
type KeyboardAwareFlatListProps = React.ComponentProps<typeof KeyboardAwareFlatList> & {
  floatingTabBarPadding?: number;
};

const DEFAULT_EXTRA_SCROLL_HEIGHT = Platform.OS === 'ios' ? 32 : 96;

function splitBottomPadding(contentContainerStyle: unknown, floatingTabBarPadding?: number) {
  const flat = StyleSheet.flatten(contentContainerStyle as any) || {};
  const stylePad = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;
  const spacerHeight = Math.max(stylePad, typeof floatingTabBarPadding === 'number' ? floatingTabBarPadding : 0);

  // On Android, KeyboardAwareScrollView often ignores contentContainerStyle.paddingBottom
  // for scroll extent — a trailing spacer View is reliable.
  if (Platform.OS === 'android' && spacerHeight > 0) {
    return {
      contentContainerStyle: [contentContainerStyle, { paddingBottom: 0 }],
      spacerHeight,
    };
  }

  if (typeof floatingTabBarPadding === 'number' && floatingTabBarPadding > stylePad) {
    return {
      contentContainerStyle: [contentContainerStyle, { paddingBottom: floatingTabBarPadding }],
      spacerHeight: 0,
    };
  }

  return { contentContainerStyle, spacerHeight: 0 };
}

export const AppKeyboardAwareScrollView = React.forwardRef<any, KeyboardAwareScrollProps>(
  function AppKeyboardAwareScrollView(
    {
      keyboardShouldPersistTaps = 'handled',
      keyboardDismissMode = 'on-drag',
      floatingTabBarPadding,
      contentContainerStyle,
      children,
      ...props
    },
    ref
  ) {
    const split = splitBottomPadding(contentContainerStyle, floatingTabBarPadding);

    if (Platform.OS === 'web') {
      return (
        <ScrollView
          ref={ref as any}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          contentContainerStyle={contentContainerStyle as any}
          {...(props as any)}
        >
          {children}
        </ScrollView>
      );
    }

    return (
      <KeyboardAwareScrollView
        ref={ref}
        enableOnAndroid
        extraScrollHeight={DEFAULT_EXTRA_SCROLL_HEIGHT}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        contentContainerStyle={split.contentContainerStyle as any}
        {...props}
      >
        {children}
        {split.spacerHeight > 0 ? (
          <View style={{ height: split.spacerHeight }} collapsable={false} />
        ) : null}
      </KeyboardAwareScrollView>
    );
  }
);

export const AppKeyboardAwareFlatList = React.forwardRef<any, KeyboardAwareFlatListProps>(
  function AppKeyboardAwareFlatList(
    {
      keyboardShouldPersistTaps = 'handled',
      keyboardDismissMode = 'on-drag',
      floatingTabBarPadding,
      contentContainerStyle,
      ListFooterComponent,
      ...props
    },
    ref
  ) {
    const split = splitBottomPadding(contentContainerStyle, floatingTabBarPadding);
    const footer =
      split.spacerHeight > 0 ? (
        <>
          {typeof ListFooterComponent === 'function' ? <ListFooterComponent /> : ListFooterComponent}
          <View style={{ height: split.spacerHeight }} collapsable={false} />
        </>
      ) : (
        ListFooterComponent
      );

    if (Platform.OS === 'web') {
      return (
        <FlatList
          ref={ref as any}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          contentContainerStyle={contentContainerStyle as any}
          ListFooterComponent={ListFooterComponent}
          {...(props as any)}
        />
      );
    }

    return (
      <KeyboardAwareFlatList
        ref={ref}
        enableOnAndroid
        extraScrollHeight={DEFAULT_EXTRA_SCROLL_HEIGHT}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        contentContainerStyle={split.contentContainerStyle as any}
        ListFooterComponent={footer}
        {...props}
      />
    );
  }
);
