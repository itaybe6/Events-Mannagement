import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Base header height (excluding safe-area top inset)
export const APP_HEADER_HEIGHT = 90;
export const APP_HEADER_HEIGHT_COMPACT = 50;

export const getAppHeaderTotalHeight = (topInset: number, baseHeight: number = APP_HEADER_HEIGHT) =>
  baseHeight + Math.max(0, topInset || 0);

type Props = {
  onPressNotifications?: () => void;
  onPressEdit?: () => void;
  onPressBack?: () => void;
  canGoBack?: boolean;
  variant?: 'default' | 'compact';
  layout?: 'centerLogo' | 'logoLeft';
  rightContent?: React.ReactNode;
  logoOffsetX?: number;
  logoStyle?: StyleProp<ImageStyle>;
};

export default function AppHeader(props: Props) {
  const {
    onPressNotifications,
    onPressEdit,
    onPressBack,
    canGoBack,
    variant = 'default',
    layout = 'centerLogo',
    rightContent,
    logoOffsetX = 0,
    logoStyle,
  } = props;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(0, insets.top || 0);
  const baseHeight = variant === 'compact' ? APP_HEADER_HEIGHT_COMPACT : APP_HEADER_HEIGHT;
  const totalHeight = getAppHeaderTotalHeight(topInset, baseHeight);

  const rightNode = rightContent ? (
    rightContent
  ) : onPressEdit ? (
    <TouchableOpacity
      style={[styles.iconButton, styles.rightBtn]}
      onPress={onPressEdit}
      accessibilityRole="button"
      accessibilityLabel="עריכת פרופיל"
      activeOpacity={0.85}
    >
      <Ionicons name="create-outline" size={24} color={colors.primary} />
    </TouchableOpacity>
  ) : onPressNotifications ? (
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
  );

  if (layout === 'logoLeft') {
    return (
      <View style={[styles.wrap, styles.wrapLogoLeft, { height: totalHeight, paddingTop: topInset }]}>
        <View style={styles.leftCluster}>
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
          ) : null}

          <Image
            source={require('../assets/images/logoMoon.png')}
            style={[
              styles.logoLeft,
              variant === 'compact' && styles.logoLeftCompact,
              canGoBack ? { marginLeft: 2 } : null,
            ]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.centerFill} />

        <View style={styles.sideRightAuto}>{rightNode}</View>
      </View>
    );
  }

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
          source={require('../assets/images/logoMoon.png')}
          style={[
            styles.logo,
            variant === 'compact' && styles.logoCompact,
            logoOffsetX ? { transform: [{ translateX: logoOffsetX }] } : null,
            logoStyle,
          ]}
          resizeMode="contain"
        />
      </View>

      <View style={rightContent ? styles.sideRightAuto : styles.sideRight}>{rightNode}</View>
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
  wrapLogoLeft: {
    // Override base wrap paddingHorizontal so the logo can hug the screen edge.
    paddingHorizontal: 0,
    paddingLeft: 0,
    paddingRight: 10,
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
  sideRightAuto: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerFill: {
    flex: 1,
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
    gap: 8,
    // Pull the cluster to the very edge (some RN headers still add subtle spacing)
    marginLeft: -12,
  },
  logo: {
    width: 320,
    height: 80,
  },
  logoCompact: {
    width: 335,
    height: 74,
  },
  logoLeft: {
    width: 210,
    height: 52,
  },
  logoLeftCompact: {
    width: 200,
    height: 48,
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

