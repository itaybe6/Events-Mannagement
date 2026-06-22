import React from 'react';
import { Image } from 'expo-image';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import AdminProfileShortcutBadge from './AdminProfileShortcutBadge';
import AdminWebTopNav from './AdminWebTopNav';

const APP_LOGO = require('../../assets/images/logoMoon.png');

type Props = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  subtitleContent?: React.ReactNode;
  hideSubtitleDivider?: boolean;
  titleMeta?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  navTrailing?: React.ReactNode;
  showNav?: boolean;
  useDefaultActions?: boolean;
};

export default function AdminWebPageHeader({
  title,
  eyebrow,
  subtitle,
  subtitleContent,
  hideSubtitleDivider = false,
  titleMeta,
  leading,
  actions,
  navTrailing,
  showNav = true,
  useDefaultActions = true,
}: Props) {
  const leadingContent = leading ?? (
    <View style={styles.logoWrap}>
      <Image source={APP_LOGO} style={styles.logoImg} contentFit="contain" transition={0} />
    </View>
  );
  const actionsContent = actions ?? (useDefaultActions ? <AdminProfileShortcutBadge /> : null);
  const subtitleParts = String(subtitle ?? '')
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean);
  const useSubtitleChips = subtitleParts.length > 1;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={styles.leadingWrap}>{leadingContent}</View>

          <View style={styles.textWrap}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            {titleMeta ? <View style={styles.titleMetaWrap}>{titleMeta}</View> : null}
          </View>
        </View>

        {actionsContent ? <View style={styles.actions}>{actionsContent}</View> : null}
      </View>

      {subtitle || subtitleContent ? (
        <View style={styles.subtitleSection}>
          {!hideSubtitleDivider ? <View style={styles.subtitleDivider} /> : null}
          {subtitleContent ? (
            subtitleContent
          ) : useSubtitleChips ? (
            <View style={styles.subtitleMetaRow}>
              {subtitleParts.map((part) => (
                <View key={part} style={styles.subtitleMetaChip}>
                  <Text style={styles.subtitleMetaText}>{part}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
      ) : null}

      {showNav ? (
        <View style={styles.navSection}>
          <View style={styles.navSectionHeader}>
            <View style={styles.navSectionDivider} />
            <Text style={styles.navSectionLabel}>ניווט מהיר</Text>
          </View>

          <View style={styles.navRow}>
            <View style={styles.navWrap}>
              <AdminWebTopNav />
            </View>
            {navTrailing ? <View style={styles.navTrailing}>{navTrailing}</View> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 132,
    paddingHorizontal: 22,
    paddingVertical: 20,
    position: 'relative',
    overflow: 'visible',
    zIndex: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.045)',
    gap: 18,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 14px rgba(11,28,65,0.025)',
        } as any)
      : {
          shadowColor: '#0B1C41',
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'visible',
    zIndex: 21,
    gap: 18,
    minHeight: 50,
    flexWrap: 'wrap',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leadingWrap: {
    flexShrink: 0,
  },
  logoWrap: {
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1C41',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  logoImg: {
    width: '88%',
    height: '88%',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 4,
  },
  titleMetaWrap: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.secondary,
    textAlign: 'right',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
    flexWrap: 'wrap',
    position: 'relative',
    overflow: 'visible',
    zIndex: 22,
  },
  subtitleSection: {
    gap: 10,
  },
  subtitleDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  subtitleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 10,
  },
  subtitleMetaChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 12px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  subtitleMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
  },
  navSection: {
    gap: 16,
  },
  navSectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  navSectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  navSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    letterSpacing: 0.2,
    textAlign: 'right',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  navWrap: {
    minHeight: 42,
    justifyContent: 'center',
    flexShrink: 1,
  },
  navTrailing: {
    flexShrink: 0,
  },
});
