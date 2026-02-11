import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Container({ children, maxWidth = 1200, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
  },
});

