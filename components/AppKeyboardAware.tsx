import React from 'react';
import { FlatList, Platform, ScrollView } from 'react-native';
import { KeyboardAwareFlatList, KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type KeyboardAwareScrollProps = React.ComponentProps<typeof KeyboardAwareScrollView>;
type KeyboardAwareFlatListProps = React.ComponentProps<typeof KeyboardAwareFlatList>;

const DEFAULT_EXTRA_SCROLL_HEIGHT = Platform.OS === 'ios' ? 32 : 96;

export const AppKeyboardAwareScrollView = React.forwardRef<any, KeyboardAwareScrollProps>(function AppKeyboardAwareScrollView(
  {
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'on-drag',
    ...props
  },
  ref
) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        ref={ref as any}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        {...(props as any)}
      />
    );
  }

  return (
    <KeyboardAwareScrollView
      ref={ref}
      enableOnAndroid
      extraScrollHeight={DEFAULT_EXTRA_SCROLL_HEIGHT}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      {...props}
    />
  );
});

export const AppKeyboardAwareFlatList = React.forwardRef<any, KeyboardAwareFlatListProps>(function AppKeyboardAwareFlatList(
  {
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = 'on-drag',
    ...props
  },
  ref
) {
  if (Platform.OS === 'web') {
    return (
      <FlatList
        ref={ref as any}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
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
      {...props}
    />
  );
});
