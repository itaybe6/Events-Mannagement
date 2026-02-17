import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';

import AddUserScreenV2 from './add-user-v2';

export default function AddUserV2WebScreen() {
  const router = useRouter();
  return (
    <View style={styles.page}>
      <View style={styles.topNav}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <MaterialIcons name="event" size={18} color="#fff" />
          </View>
          <Text style={styles.brandText} numberOfLines={1}>
            EventManager
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה לרשימה"
          onPress={() => router.back()}
          style={({ hovered, pressed }: any) => [
            styles.backBtn,
            Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
            pressed ? styles.backBtnPressed : null,
          ]}
        >
          <MaterialIcons name="arrow-forward" size={18} color={colors.gray[600]} style={styles.backBtnIcon} />
          <Text style={styles.backBtnText}>חזרה לרשימה</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <View style={styles.card}>
          <View style={styles.cardTopLine} />
          <View style={styles.cardInner}>
            <AddUserScreenV2 variant="webPremiumEmbedded" />
          </View>
          <View style={styles.cardBottomFade} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(135deg, #f8f9fa 0%, #eef2f6 100%)',
          minHeight: '100vh',
          direction: 'rtl',
        } as any)
      : null),
  },
  topNav: {
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  } as any,
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: -0.2,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as any) : null),
  },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  } as any,
  backBtnHover: { backgroundColor: 'rgba(15, 23, 42, 0.04)' },
  backBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  backBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    writingDirection: 'rtl',
  },
  backBtnIcon: {
    transform: [{ rotate: '180deg' }], // RTL visual parity with HTML
  },

  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
    elevation: 8,
  },
  cardTopLine: {
    height: 4,
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(90deg, rgba(6,23,62,0.85), rgba(6,23,62,1), rgba(6,23,62,0.85))',
        } as any)
      : null),
  },
  cardInner: {
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  cardBottomFade: {
    height: 8,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        } as any)
      : null),
  },
});

