import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Base header height (excluding safe-area top inset)
export const APP_HEADER_HEIGHT = 90;

export const getAppHeaderTotalHeight = (topInset: number) => APP_HEADER_HEIGHT + Math.max(0, topInset || 0);

type Props = {
  onPressNotifications?: () => void;
  onPressBack?: () => void;
  canGoBack?: boolean;
};

export default function AppHeader(props: Props) {
  const { onPressNotifications, onPressBack, canGoBack } = props;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(0, insets.top || 0);
  const totalHeight = getAppHeaderTotalHeight(topInset);

  return (
    <View style={[styles.wrap, { height: totalHeight, paddingTop: topInset }]}>
      <View style={styles.sideLeft}>
        {canGoBack ? (
          <TouchableOpacity
            style={[styles.iconButton, styles.leftBtn]}
            onPress={onPressBack}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.iconButton, styles.leftBtn, { opacity: 0 }]} />
        )}
      </View>

      <View style={styles.center}>
        <Image
          source={require('../assets/images/logo-moon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.sideRight}>
        {onPressNotifications ? (
          <TouchableOpacity
            style={[styles.iconButton, styles.rightBtn]}
            onPress={onPressNotifications}
            accessibilityRole="button"
            accessibilityLabel="התראות"
            activeOpacity={0.85}
          >
            <Ionicons name="notifications" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.iconButton, styles.rightBtn, { opacity: 0 }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  sideLeft: {
    width: 56,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 320,
    height: 80,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  leftBtn: {
    marginLeft: 3,
  },
  rightBtn: {
    marginRight: 3,
  },
});

