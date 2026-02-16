import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DesktopTopBar from '@/components/desktop/DesktopTopBar';
import BrideGroomProfile from './brideGroomProfile.tsx';

export default function BrideGroomProfileWebScreen() {
  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgShapes}>
        <View style={styles.shapeTopRight} />
        <View style={styles.shapeBottomLeft} />
      </View>

      <DesktopTopBar title="פרופיל" subtitle="פרטי משתמש ואירוע" />

      <View style={styles.contentOuter}>
        <View style={styles.shell}>
          <BrideGroomProfile />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f6f7f8',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },

  bgShapes: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  shapeTopRight: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 720,
    height: 720,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(59,130,246,0.10)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -140,
    left: -160,
    width: 860,
    height: 860,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(139,92,246,0.07)' }),
  },

  contentOuter: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
  },
  shell: {
    flex: 1,
    minHeight: 0,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 0 0 1px rgba(11,48,65,0.02), 0 14px 40px rgba(11,48,65,0.08)',
        } as any)
      : null),
  },
});

