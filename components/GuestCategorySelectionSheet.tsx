import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Side = 'groom' | 'bride';
type SideFilter = 'all' | Side | 'other';
type Mode = 'existing' | 'new';

export type GuestCategory = {
  id: string;
  name: string;
  side: Side;
};

export function GuestCategorySelectionSheet({
  visible,
  categories,
  selectedCategoryId,
  onClose,
  onSelect,
  onCreateCategory,
  title = 'בחירת קטגוריה',
}: {
  visible: boolean;
  categories: GuestCategory[];
  selectedCategoryId?: string | null;
  onClose: () => void;
  onSelect: (category: GuestCategory) => void;
  onCreateCategory: (name: string, side: Side) => Promise<GuestCategory>;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useMemo(() => new Animated.Value(0), []);
  const isClosingRef = useRef(false);

  const [mode, setMode] = useState<Mode>('existing');
  const [filter, setFilter] = useState<SideFilter>('all');
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState<Side>('groom');
  const [creating, setCreating] = useState(false);

  const sheetPrimary = '#135bec';

  useEffect(() => {
    if (!visible) return;
    setMode('existing');
    setFilter('all');
    setPendingSelectedId(selectedCategoryId ?? null);
    setNewName('');
    setNewSide('groom');
    setCreating(false);
    isClosingRef.current = false;
    translateY.setValue(0);
  }, [visible, selectedCategoryId]);

  const filteredCategories = useMemo(() => {
    if (filter === 'all') return categories;
    if (filter === 'other') return [];
    return categories.filter(c => c.side === filter);
  }, [categories, filter]);

  const selectedCategory = useMemo(() => {
    const id = pendingSelectedId ?? selectedCategoryId ?? null;
    if (!id) return null;
    return categories.find(c => c.id === id) ?? null;
  }, [categories, pendingSelectedId, selectedCategoryId]);

  const bottomPadding = Math.max(16, insets.bottom + 10);

  const handleConfirm = async () => {
    if (mode === 'existing') {
      if (!selectedCategory) return;
      onSelect(selectedCategory);
      onClose();
      return;
    }

    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      const created = await onCreateCategory(name, newSide);
      onSelect(created);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const chips: Array<{ key: SideFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'all', label: 'הכל', icon: 'people' },
    { key: 'groom', label: 'חתן', icon: 'male' },
    { key: 'bride', label: 'כלה', icon: 'female' },
    { key: 'other', label: 'אחרים', icon: 'ellipsis-horizontal' },
  ];

  const { width } = Dimensions.get('window');
  const isCompact = width < 380;
  const gridGap = 12;
  // Sheet maxWidth is 420, and content has 20px horizontal padding on each side.
  const sheetWidth = Math.min(width, 420);
  const contentWidth = sheetWidth - 40;
  const cardSize = Math.floor((contentWidth - gridGap) / 2);
  const sheetHeight = Math.round(Dimensions.get('window').height * 0.92);

  const backdropOpacity = useMemo(() => {
    return translateY.interpolate({
      inputRange: [0, sheetHeight],
      outputRange: [1, 0.25],
      extrapolate: 'clamp',
    });
  }, [sheetHeight, translateY]);

  const requestClose = useMemo(() => {
    return () => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      Animated.timing(translateY, {
        toValue: sheetHeight + 30,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        isClosingRef.current = false;
        translateY.setValue(0);
        onClose();
      });
    };
  }, [onClose, sheetHeight, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (gesture.numberActiveTouches !== 1) return false;
          const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
          return isVertical && gesture.dy > 4;
        },
        onPanResponderMove: (_, gesture) => {
          // only allow dragging downward
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldClose = gesture.dy > 120 || gesture.vy > 1.1;
          if (shouldClose) {
            requestClose();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 18,
            bounciness: 4,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 18,
            bounciness: 4,
          }).start();
        },
      }),
    [requestClose, translateY]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Background */}
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={require('../assets/images/wedding.jpg')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            blurRadius={10}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.40)' }]} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.60)']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Tap outside */}
        <Pressable style={styles.backdropPressArea} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <Animated.View style={[styles.sheetFrame, { height: sheetHeight, transform: [{ translateY }] }]}>
            <BlurView intensity={28} tint="light" style={styles.sheetGlass}>
              {/* Drag handle */}
              <View style={styles.handleRow} {...panResponder.panHandlers}>
                <View style={styles.handleBar} />
              </View>

              <View style={styles.headerArea}>
                <Text style={styles.title}>{title}</Text>

                {/* Segmented */}
                <View style={styles.segmentWrap}>
                  <View
                    style={[
                      styles.segmentIndicator,
                      mode === 'existing' ? styles.segmentIndicatorRight : styles.segmentIndicatorLeft,
                    ]}
                  />
                  <Pressable style={styles.segmentBtn} onPress={() => setMode('existing')}>
                    <Text style={[styles.segmentText, mode === 'existing' && { color: sheetPrimary, fontWeight: '800' }]}>
                      קטגוריה קיימת
                    </Text>
                  </Pressable>
                  <Pressable style={styles.segmentBtn} onPress={() => setMode('new')}>
                    <Text style={[styles.segmentText, mode === 'new' && { color: sheetPrimary, fontWeight: '800' }]}>
                      קטגוריה חדשה
                    </Text>
                  </Pressable>
                </View>

                {/* Chips */}
                {mode === 'existing' && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                  >
                    {chips.map(chip => {
                      const active = filter === chip.key;
                      return (
                        <Pressable
                          key={chip.key}
                          onPress={() => setFilter(chip.key)}
                          style={[
                            styles.chip,
                            active
                              ? { backgroundColor: sheetPrimary, borderColor: sheetPrimary }
                              : { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.08)' },
                          ]}
                        >
                          <Ionicons
                            name={chip.icon}
                            size={16}
                            color={active ? '#fff' : 'rgba(15,23,42,0.65)'}
                            style={{ marginLeft: 8 }}
                          />
                          <Text style={[styles.chipText, active && { color: '#fff', fontWeight: '800' }]}>
                            {chip.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* Content */}
              <View style={styles.contentArea}>
                {mode === 'new' ? (
                  <View style={styles.createArea}>
                    <Text style={styles.createLabel}>שם הקטגוריה</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        placeholder="למשל: חברים חתן"
                        placeholderTextColor="rgba(15,23,42,0.45)"
                        style={styles.input}
                        returnKeyType="done"
                      />
                    </View>

                    <Text style={[styles.createLabel, { marginTop: 14 }]}>שייך לצד</Text>
                    <View style={styles.sideRow}>
                      <Pressable
                        onPress={() => setNewSide('groom')}
                        style={[
                          styles.sidePill,
                          newSide === 'groom' && { backgroundColor: sheetPrimary, borderColor: sheetPrimary },
                        ]}
                      >
                        <Ionicons name="male" size={18} color={newSide === 'groom' ? '#fff' : sheetPrimary} style={{ marginLeft: 8 }} />
                        <Text style={[styles.sidePillText, newSide === 'groom' && { color: '#fff', fontWeight: '800' }]}>חתן</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setNewSide('bride')}
                        style={[
                          styles.sidePill,
                          newSide === 'bride' && { backgroundColor: sheetPrimary, borderColor: sheetPrimary },
                        ]}
                      >
                        <Ionicons name="female" size={18} color={newSide === 'bride' ? '#fff' : sheetPrimary} style={{ marginLeft: 8 }} />
                        <Text style={[styles.sidePillText, newSide === 'bride' && { color: '#fff', fontWeight: '800' }]}>כלה</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <FlatList
                    data={filteredCategories}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={styles.grid}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const isSelected = (pendingSelectedId ?? selectedCategoryId) === item.id;
                      const iconName: keyof typeof Ionicons.glyphMap =
                        item.side === 'groom' ? 'male' : item.side === 'bride' ? 'female' : 'ellipsis-horizontal';

                      return (
                        <Pressable
                          onPress={() => {
                            // UX: selecting an existing category should be instant.
                            // (Previously required an extra "בחירה" confirm press.)
                            setPendingSelectedId(item.id);
                            onSelect(item);
                            requestClose();
                          }}
                          style={[
                            styles.card,
                            { width: cardSize, height: cardSize },
                            isSelected
                              ? { backgroundColor: sheetPrimary, borderColor: sheetPrimary }
                              : { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.06)' },
                          ]}
                        >
                          {isSelected && (
                            <View style={styles.cardCheck}>
                              <Ionicons name="checkmark" size={16} color={sheetPrimary} />
                            </View>
                          )}

                          <Ionicons
                            name={iconName}
                            size={isCompact ? 44 : 48}
                            color={isSelected ? '#fff' : 'rgba(15,23,42,0.35)'}
                          />
                          <Text style={[styles.cardText, isSelected && { color: '#fff' }]} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={{ paddingVertical: 30 }}>
                        <Text style={styles.emptyText}>אין קטגוריות עדיין</Text>
                      </View>
                    }
                  />
                )}
              </View>

              {/* Bottom action */}
              <View pointerEvents="box-none" style={styles.bottomArea}>
                <LinearGradient
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,1)']}
                  style={[styles.bottomGradient, { paddingBottom: bottomPadding }]}
                >
                  <Pressable
                    onPress={handleConfirm}
                    disabled={
                      creating ||
                      (mode === 'existing' && !selectedCategory) ||
                      (mode === 'new' && !newName.trim())
                    }
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      {
                        backgroundColor:
                          creating ||
                          (mode === 'existing' && !selectedCategory) ||
                          (mode === 'new' && !newName.trim())
                            ? 'rgba(19,91,236,0.45)'
                            : sheetPrimary,
                        transform: [{ scale: pressed ? 0.99 : 1 }],
                      },
                    ]}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" style={{ marginLeft: 8 }} />
                    <Text style={styles.primaryBtnText}>
                      {mode === 'new' ? (creating ? 'מוסיף...' : 'הוסף קטגוריה') : 'בחירה'}
                    </Text>
                  </Pressable>
                </LinearGradient>
              </View>
            </BlurView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  backdropPressArea: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: '100%',
    alignItems: 'center',
  },
  sheetFrame: {
    width: '100%',
    maxWidth: 420,
    height: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  sheetGlass: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handleRow: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handleBar: {
    width: 48,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.55)',
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  segmentWrap: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.06)',
    padding: 4,
    flexDirection: 'row-reverse',
    position: 'relative',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // Note: RTL layout, "existing" is the right segment.
  segmentIndicatorRight: { right: 4 },
  segmentIndicatorLeft: { left: 4 },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.60)',
  },
  chipsRow: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    gap: 10,
    flexDirection: 'row-reverse',
  },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.65)',
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 20,
  },
  grid: {
    paddingBottom: 130,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(15,23,42,0.80)',
    textAlign: 'center',
    lineHeight: 20,
  },
  cardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
  },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    shadowColor: '#135bec',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  createArea: {
    paddingTop: 6,
    paddingBottom: 140,
  },
  createLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.75)',
    marginBottom: 8,
    textAlign: 'right',
  },
  inputWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  input: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right',
  },
  sideRow: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  sidePill: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(19,91,236,0.35)',
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#135bec',
  },
});

