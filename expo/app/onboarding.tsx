import AsyncStorage from '@react-native-async-storage/async-storage';
import { Marquee } from '@animatereactnative/marquee';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Dimensions, Image, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const _spacing = Platform.OS === 'web' ? 12 : 8;
const _bgColor = '#010c21';
const _initialDelay = 200;
const _duration = 500;

const ONBOARDING_KEY = 'has_seen_onboarding_v1';

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked_arr: T[][] = [];
  let index = 0;
  while (index < array.length) {
    chunked_arr.push(array.slice(index, size + index));
    index += size;
  }
  return chunked_arr;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  // On web (especially with SSR), Dimensions.get('window') can be 0 at module load time.
  // Computing size from the hook ensures it updates after hydration/resizes.
  const safeWidth = window.width || Dimensions.get('window').width || 360;
  const itemSize = Math.max(
    Platform.OS === 'web' ? 96 : 140,
    Platform.OS === 'web' ? safeWidth * 0.24 : safeWidth * 0.45
  );
  const marqueeTopPadding = Platform.OS === 'web' ? 56 : Math.max(insets.top, 28);

  const images = useMemo(
    () => chunkArray(enterScreenImages, Math.max(1, Math.floor(enterScreenImages.length / 3))),
    []
  );

  const goToLogin = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // ignore - if storage fails we still allow continuing to login
    }
    router.replace('/login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: _bgColor, overflow: 'hidden' }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <View
          style={{
            flex: 1,
            gap: _spacing,
            paddingTop: marqueeTopPadding,
            transform: [
              {
                rotate: '-4deg',
              },
            ],
          }}
        >
          {images.map((column, columnIndex) => (
            <Marquee
              speed={Platform.OS === 'web' ? 1 : 0.2}
              spacing={_spacing}
              key={`marquee-${columnIndex}`}
              reverse={columnIndex % 2 !== 0}
            >
              <View style={{ flexDirection: 'row', gap: _spacing }}>
                {column.map((image, index) => (
                  <Animated.Image
                    key={`image-for-column-${columnIndex}-${index}`}
                    source={image}
                    entering={
                      columnIndex % 2 === 0
                        ? FadeInRight.duration(_duration).delay(
                            _initialDelay * (columnIndex + 1) + Math.random() * 100
                          )
                        : FadeInLeft.duration(_duration).delay(
                            _initialDelay * (columnIndex + 1) + Math.random() * 100
                          )
                    }
                    style={{
                      width: itemSize,
                      aspectRatio: 1,
                      borderRadius: _spacing,
                    }}
                  />
                ))}
              </View>
            </Marquee>
          ))}
        </View>

        <LinearGradient
          colors={[`${_bgColor}00`, _bgColor, _bgColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          locations={[0, 0.7, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '24%',
          }}
          pointerEvents="none"
        />

        <LinearGradient
          colors={[_bgColor, _bgColor, `${_bgColor}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          locations={[0, Platform.OS === 'web' ? 0.1 : 0.3, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: Platform.OS === 'web' ? '25%' : '15%',
          }}
          pointerEvents="none"
        />
      </View>

      <View
        style={{
          marginTop: -18,
          paddingTop: 0,
          paddingBottom: Math.max(insets.bottom, _spacing) + _spacing,
          alignItems: 'center',
          paddingHorizontal: _spacing,
          gap: 4,
        }}
      >
        <Animated.View
          entering={FadeInDown.springify().delay(_initialDelay + 80)}
          style={{ marginTop: 0, marginBottom: 10, opacity: 0.98 }}
        >
          <Image
            source={require('../assets/images/moon_logo_white.png')}
            resizeMode="contain"
            style={{
              width: Platform.OS === 'web' ? 320 : 280,
              height: Platform.OS === 'web' ? 105 : 95,
              maxWidth: '94%',
            }}
            accessibilityLabel="לוגו MOON"
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.springify().delay(_initialDelay + 100)}
          style={{ alignItems: 'center', marginTop: -6, gap: 2 }}
        >
          <Text
            style={{
              color: colors.white,
              fontSize: Platform.OS === 'web' ? 30 : 28,
              textAlign: 'center',
            }}
          >
            ברוכים הבאים
          </Text>
          <Text style={{ color: colors.white, fontSize: 28, textAlign: 'center' }}>
            סידורי הושבה ואישורי הגעה
          </Text>
        </Animated.View>

        <AnimatedPressable
          entering={FadeInDown.springify().delay(_initialDelay + 300)}
          onPress={goToLogin}
          style={{ marginTop: _spacing * 1.5 }}
        >
          <View
            style={{
              height: 56,
              borderRadius: 9999,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.14)',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.75)',
              paddingHorizontal: _spacing * 5,
              minWidth: 240,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
            }}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.00)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
              pointerEvents="none"
            />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 16, letterSpacing: 0.2 }}>
              המשך להתחברות
            </Text>
          </View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export const enterScreenImages: ImageSourcePropType[] = [
  require('../assets/images/enterScreen/enter_01.jpeg'),
  require('../assets/images/enterScreen/enter_02.jpeg'),
  require('../assets/images/enterScreen/enter_03.jpeg'),
  require('../assets/images/enterScreen/enter_04.jpeg'),
  require('../assets/images/enterScreen/enter_05.jpeg'),
  require('../assets/images/enterScreen/enter_06.jpeg'),
  require('../assets/images/enterScreen/enter_07.jpeg'),
  require('../assets/images/enterScreen/enter_08.jpeg'),
  require('../assets/images/enterScreen/enter_09.jpeg'),
  require('../assets/images/enterScreen/enter_10.jpeg'),
  require('../assets/images/enterScreen/enter_11.jpeg'),
  require('../assets/images/enterScreen/enter_12.jpeg'),
  require('../assets/images/enterScreen/enter_13.jpeg'),
  require('../assets/images/enterScreen/enter_14.jpeg'),
  require('../assets/images/enterScreen/enter_15.jpeg'),
  require('../assets/images/enterScreen/enter_16.jpeg'),
  require('../assets/images/enterScreen/enter_17.jpeg'),
];

