import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  Platform,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { IS_RTL, ROW_DIR } from '@/lib/rtl';

type Side = 'groom' | 'bride';
type SideFilter = 'all' | Side;
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
  enableSides = true,
  onClose,
  onSelect,
  onCreateCategory,
  title = 'בחירת קטגוריה',
  closeOnSelect = true,
  overlay,
  onRenameCategory,
  onDeleteCategory,
}: {
  visible: boolean;
  categories: GuestCategory[];
  selectedCategoryId?: string | null;
  enableSides?: boolean;
  onClose: () => void;
  onSelect: (category: GuestCategory) => void;
  onCreateCategory: (name: string, side: Side) => Promise<GuestCategory>;
  title?: string;
  closeOnSelect?: boolean;
  overlay?: React.ReactNode;
  onRenameCategory?: (category: GuestCategory, nextName: string) => Promise<GuestCategory>;
  onDeleteCategory?: (category: GuestCategory) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useMemo(() => new Animated.Value(0), []);
  const isClosingRef = useRef(false);
  const prevVisibleRef = useRef(false);

  const [mode, setMode] = useState<Mode>('existing');
  const [filter, setFilter] = useState<SideFilter>('all');
  const [pendingSelectedId, setPendingSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSide, setNewSide] = useState<Side>('groom');
  const [creating, setCreating] = useState(false);
  const [manageTarget, setManageTarget] = useState<GuestCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameMode, setRenameMode] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sheetPrimary = '#135bec';

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setMode('existing');
      setFilter('all');
      setPendingSelectedId(selectedCategoryId ?? null);
      setNewName('');
      setNewSide('groom');
      setCreating(false);
      setManageTarget(null);
      setRenameValue('');
      setRenameMode(false);
      setRenaming(false);
      setDeleting(false);
      isClosingRef.current = false;
      translateY.setValue(0);
    }
    prevVisibleRef.current = visible;
  }, [selectedCategoryId, translateY, visible]);

  useEffect(() => {
    if (!visible) return;
    setPendingSelectedId(selectedCategoryId ?? null);
  }, [selectedCategoryId, visible]);

  // If the current event doesn't have "groom/bride" semantics (e.g. brit/bar-mitzvah),
  // keep the sheet in a generic mode: no side filters and no "assign to side" UI.
  useEffect(() => {
    if (!visible) return;
    if (!enableSides) {
      setFilter('all');
      setNewSide('groom'); // DB still expects a side value; keep a stable default.
    }
  }, [enableSides, visible]);

  const filteredCategories = useMemo(() => {
    if (!enableSides) return categories;
    if (filter === 'all') return categories;
    return categories.filter(c => c.side === filter);
  }, [categories, enableSides, filter]);

  const selectedCategory = useMemo(() => {
    const id = pendingSelectedId ?? selectedCategoryId ?? null;
    if (!id) return null;
    return categories.find(c => c.id === id) ?? null;
  }, [categories, pendingSelectedId, selectedCategoryId]);

  const existingGridBottomPadding = Math.max(18, insets.bottom + 8);
  const isCreateDisabled = creating || !newName.trim();
  const isRenameDisabled = renaming || !renameValue.trim();
  const canManageExistingCategories = Boolean(onRenameCategory || onDeleteCategory);

  const handleConfirm = async () => {
    if (mode === 'existing') {
      if (!selectedCategory) return;
      onSelect(selectedCategory);
      if (closeOnSelect) requestClose();
      return;
    }

    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      const created = await onCreateCategory(name, newSide);
      onSelect(created);
      if (closeOnSelect) requestClose();
    } finally {
      setCreating(false);
    }
  };

  const closeManageOverlay = () => {
    if (renaming || deleting) return;
    setManageTarget(null);
    setRenameMode(false);
    setRenameValue('');
  };

  const openManageOverlay = (category: GuestCategory) => {
    if (!canManageExistingCategories) return;
    setManageTarget(category);
    setRenameValue(category.name);
    setRenameMode(false);
  };

  const handleRenameCategory = async () => {
    if (!manageTarget || !onRenameCategory) return;
    const nextName = renameValue.trim();
    if (!nextName) return;
    try {
      setRenaming(true);
      const updated = await onRenameCategory(manageTarget, nextName);
      if ((pendingSelectedId ?? selectedCategoryId) === manageTarget.id) {
        setPendingSelectedId(updated.id);
      }
      setManageTarget(updated);
      setRenameMode(false);
      setRenameValue(updated.name);
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteCategory = () => {
    if (!manageTarget || !onDeleteCategory || deleting) return;
    const target = manageTarget;
    Alert.alert(
      'מחיקת קטגוריה',
      `למחוק את הקטגוריה "${target.name}"?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await onDeleteCategory(target);
              if ((pendingSelectedId ?? selectedCategoryId) === target.id) {
                setPendingSelectedId(null);
              }
              setManageTarget(null);
              setRenameMode(false);
              setRenameValue('');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const chips: Array<{ key: SideFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = useMemo(() => {
    if (!enableSides) return [{ key: 'all', label: 'הכל', icon: 'people' }];
    return [
      { key: 'all', label: 'הכל', icon: 'people' },
      { key: 'groom', label: 'חתן', icon: 'male' },
      { key: 'bride', label: 'כלה', icon: 'female' },
    ];
  }, [enableSides]);

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
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (gesture.numberActiveTouches !== 1) return false;
          const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
          return isVertical && gesture.dy > 4;
        },
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (gesture.numberActiveTouches !== 1) return false;
          const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
          return isVertical && gesture.dy > 1;
        },
        onPanResponderGrant: () => {
          // Stop any in-flight animations so drag feels direct.
          translateY.stopAnimation();
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropDim, { opacity: backdropOpacity }]} />

        {/* Tap outside */}
        <Pressable style={styles.backdropPressArea} onPress={requestClose} />

        <View style={styles.sheetWrap}>
          <Animated.View
            style={[
              styles.sheetFrame,
              { maxHeight: sheetHeight, transform: [{ translateY }] },
            ]}
          >
            <BlurView intensity={28} tint="light" style={styles.sheetGlass}>
              {/* Drag handle */}
              <View style={styles.handleRow} {...panResponder.panHandlers}>
                <View style={styles.handleBar} />
              </View>

              <View style={styles.headerArea}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>
                  בחר קטגוריה קיימת להעברה מהירה או צור קטגוריה חדשה בלי לצאת מהמסך.
                </Text>

                {/* Segmented */}
                <View style={styles.segmentWrap}>
                  <View
                    style={[
                      styles.segmentIndicator,
                      mode === 'existing'
                        ? (IS_RTL ? styles.segmentIndicatorStart : styles.segmentIndicatorEnd)
                        : (IS_RTL ? styles.segmentIndicatorEnd : styles.segmentIndicatorStart),
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
                {mode === 'existing' && enableSides && (
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
                  <View style={styles.createModeWrap}>
                    <AppKeyboardAwareScrollView
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={[styles.createArea, { paddingBottom: Math.max(24, insets.bottom + 16) }]}
                    >
                      <View style={styles.createCard}>
                        <Text style={styles.createHint}>
                          תן שם ברור לקטגוריה החדשה כדי שיהיה קל למצוא ולהעביר אליה אורחים.
                        </Text>

                        <View style={styles.createSection}>
                          <Text style={styles.createLabel}>שם הקטגוריה</Text>
                          <View style={styles.inputWrap}>
                            <TextInput
                              value={newName}
                              onChangeText={setNewName}
                              placeholder="למשל: חברים חתן"
                              placeholderTextColor="rgba(15,23,42,0.45)"
                              style={styles.input}
                              autoCapitalize="none"
                              autoCorrect={false}
                              textAlign="right"
                              onKeyPress={(e) => {
                                if (Platform.OS !== 'web') return;
                                const key = (e as any)?.nativeEvent?.key;
                                if (key === 'Enter') {
                                  (e as any)?.preventDefault?.();
                                  (e as any)?.stopPropagation?.();
                                }
                              }}
                            />
                          </View>
                        </View>

                        {enableSides && (
                          <View style={styles.createSection}>
                            <Text style={styles.createLabel}>שייך לצד</Text>
                            <View style={styles.sideRow}>
                              <Pressable
                                onPress={() => setNewSide('groom')}
                                style={[
                                  styles.sidePill,
                                  newSide === 'groom' && { backgroundColor: sheetPrimary, borderColor: sheetPrimary },
                                ]}
                              >
                                <Ionicons
                                  name="male"
                                  size={18}
                                  color={newSide === 'groom' ? '#fff' : sheetPrimary}
                                />
                                <Text style={[styles.sidePillText, newSide === 'groom' && { color: '#fff', fontWeight: '800' }]}>
                                  חתן
                                </Text>
                              </Pressable>

                              <Pressable
                                onPress={() => setNewSide('bride')}
                                style={[
                                  styles.sidePill,
                                  newSide === 'bride' && { backgroundColor: sheetPrimary, borderColor: sheetPrimary },
                                ]}
                              >
                                <Ionicons
                                  name="female"
                                  size={18}
                                  color={newSide === 'bride' ? '#fff' : sheetPrimary}
                                />
                                <Text style={[styles.sidePillText, newSide === 'bride' && { color: '#fff', fontWeight: '800' }]}>
                                  כלה
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}

                        <View style={styles.createSubmitShell}>
                          <TouchableOpacity
                            onPress={() => void handleConfirm()}
                            disabled={isCreateDisabled}
                            activeOpacity={0.9}
                            style={[
                              styles.createSubmitBtn,
                              isCreateDisabled ? styles.createSubmitBtnDisabled : styles.createSubmitBtnEnabled,
                            ]}
                          >
                            <Ionicons name="checkmark" size={20} color="#fff" />
                            <Text style={styles.createSubmitBtnText}>
                              {creating ? 'מוסיף...' : enableSides ? 'הוסף קטגוריה' : 'שמור קטגוריה'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </AppKeyboardAwareScrollView>
                  </View>
                ) : (
                  <FlatList
                    data={filteredCategories}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={[
                      styles.grid,
                      { paddingBottom: existingGridBottomPadding },
                    ]}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const isSelected = (pendingSelectedId ?? selectedCategoryId) === item.id;
                      const iconName: keyof typeof Ionicons.glyphMap = !enableSides
                        ? 'people'
                        : item.side === 'groom'
                          ? 'male'
                          : item.side === 'bride'
                            ? 'female'
                            : 'ellipsis-horizontal';
                      const sideLabel = !enableSides ? '' : item.side === 'groom' ? 'חתן' : item.side === 'bride' ? 'כלה' : 'אחר';

                      return (
                        <Pressable
                          onPress={() => {
                            // UX: selecting an existing category should be instant.
                            // (Previously required an extra "בחירה" confirm press.)
                            setPendingSelectedId(item.id);
                            onSelect(item);
                            if (closeOnSelect) requestClose();
                          }}
                          onLongPress={() => openManageOverlay(item)}
                          delayLongPress={220}
                          style={[
                            styles.card,
                            { width: cardSize, height: cardSize },
                            isSelected
                              ? { backgroundColor: sheetPrimary, borderColor: sheetPrimary }
                              : { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.06)' },
                          ]}
                        >
                          {!enableSides ? null : (
                            <View style={[styles.cardSideBadge, isSelected && styles.cardSideBadgeActive]}>
                              <Text style={[styles.cardSideBadgeText, isSelected && styles.cardSideBadgeTextActive]}>
                                {sideLabel}
                              </Text>
                            </View>
                          )}
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

              {/* Optional overlay (rendered ABOVE all sheet content) */}
              {overlay ? (
                <View pointerEvents="box-none" style={styles.overlayInsideSheet}>
                  {overlay}
                </View>
              ) : null}
              {manageTarget ? (
                <View pointerEvents="box-none" style={styles.overlayInsideSheet}>
                  <View style={styles.manageBackdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeManageOverlay} />
                    <AppKeyboardAwareScrollView
                      style={styles.manageScroll}
                      contentContainerStyle={[
                        styles.manageScrollContent,
                        { paddingBottom: Math.max(24, insets.bottom + 16) },
                      ]}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.manageCard}>
                        {renameMode ? (
                          <>
                            <Text style={styles.manageEyebrow}>עריכת קטגוריה</Text>
                            <Text style={styles.manageTitle}>שינוי שם קטגוריה</Text>
                            <Text style={styles.manageSubtitle}>
                              עדכן את שם הקטגוריה כדי שיהיה ברור יותר לאורחים ולניהול הפנימי.
                            </Text>
                            <View style={styles.manageInputWrap}>
                              <TextInput
                                value={renameValue}
                                onChangeText={setRenameValue}
                                placeholder="שם הקטגוריה"
                                placeholderTextColor="rgba(15,23,42,0.45)"
                                style={styles.manageInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textAlign="right"
                              />
                            </View>
                            <View style={styles.manageButtonsRow}>
                              <TouchableOpacity
                                onPress={closeManageOverlay}
                                disabled={renaming}
                                activeOpacity={0.92}
                                style={[styles.manageBtn, styles.manageBtnSecondary]}
                              >
                                <Text style={styles.manageBtnSecondaryText}>ביטול</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => void handleRenameCategory()}
                                disabled={isRenameDisabled}
                                activeOpacity={0.92}
                                style={[
                                  styles.manageBtn,
                                  styles.manageBtnPrimary,
                                  isRenameDisabled && styles.manageBtnDisabled,
                                ]}
                              >
                                <Ionicons name="checkmark" size={18} color="#fff" />
                                <Text style={styles.manageBtnPrimaryText}>{renaming ? 'שומר...' : 'שמור שם'}</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={styles.manageEyebrow}>אפשרויות קטגוריה</Text>
                            <Text style={styles.manageTitle}>{manageTarget.name}</Text>
                            <Text style={styles.manageSubtitle}>בלחיצה ארוכה אפשר לערוך את שם הקטגוריה או למחוק אותה.</Text>
                            <TouchableOpacity
                              onPress={() => setRenameMode(true)}
                              activeOpacity={0.92}
                              style={styles.manageActionBtn}
                            >
                              <View style={styles.manageActionIcon}>
                                <Ionicons name="create-outline" size={18} color="#135bec" />
                              </View>
                              <View style={styles.manageActionTextWrap}>
                                <Text style={styles.manageActionTitle}>שינוי שם קטגוריה</Text>
                                <Text style={styles.manageActionSubtitle}>עדכון שם בלי לצאת מהחלון</Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleDeleteCategory}
                              activeOpacity={0.92}
                              style={[styles.manageActionBtn, styles.manageActionBtnDanger]}
                            >
                              <View style={[styles.manageActionIcon, styles.manageActionIconDanger]}>
                                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                              </View>
                              <View style={styles.manageActionTextWrap}>
                                <Text style={styles.manageActionTitleDanger}>מחיקת קטגוריה</Text>
                                <Text style={styles.manageActionSubtitle}>הסרה מלאה של הקטגוריה מהרשימה</Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={closeManageOverlay}
                              activeOpacity={0.92}
                              style={[styles.manageBtn, styles.manageBtnSecondary, styles.manageBtnFull]}
                            >
                              <Text style={styles.manageBtnSecondaryText}>סגירה</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </AppKeyboardAwareScrollView>
                  </View>
                </View>
              ) : null}
            </BlurView>
          </Animated.View>
        </View>
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
  backdropDim: {
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
  },
  backdropPressArea: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayInsideSheet: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  sheetWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheetFrame: {
    width: '100%',
    maxWidth: 420,
    height: '92%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#f8fbff',
  },
  sheetGlass: {
    flex: 1,
    backgroundColor: 'rgba(248,251,255,0.96)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  handleRow: {
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  handleBar: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.45)',
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(51,65,85,0.72)',
    textAlign: 'center',
  },
  segmentWrap: {
    height: 52,
    borderRadius: 18,
    backgroundColor: '#edf4ff',
    padding: 5,
    flexDirection: ROW_DIR,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(19,91,236,0.08)',
    shadowColor: '#135bec',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  // Use start/end to avoid left/right swapping surprises in RTL builds.
  segmentIndicatorStart: { start: 4 },
  segmentIndicatorEnd: { end: 4 },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.62)',
  },
  chipsRow: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 10,
    flexDirection: ROW_DIR,
    justifyContent: 'center',
    flexGrow: 1,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
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
    paddingTop: 14,
  },
  grid: {
    paddingBottom: 138,
  },
  gridRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(15,23,42,0.80)',
    textAlign: 'center',
    lineHeight: 20,
  },
  cardSideBadge: {
    position: 'absolute',
    top: 12,
    ...(IS_RTL ? ({ end: 12 } as const) : ({ start: 12 } as const)),
    minWidth: 48,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: 'rgba(19,91,236,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSideBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardSideBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#135bec',
  },
  cardSideBadgeTextActive: {
    color: '#fff',
  },
  cardCheck: {
    position: 'absolute',
    top: 10,
    ...(IS_RTL ? ({ start: 10 } as const) : ({ end: 10 } as const)),
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
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
    zIndex: 20,
  },
  bottomGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  bottomGradientWeb: {
    backgroundColor: 'rgba(248,251,255,0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.18)',
  },
  primaryBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
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
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 6,
    gap: 16,
  },
  createModeWrap: {
    flex: 1,
    width: '100%',
  },
  createCard: {
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 16,
    gap: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  createHint: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(51,65,85,0.78)',
    textAlign: 'right',
  },
  createSection: {
    gap: 8,
  },
  createLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.75)',
    textAlign: 'right',
  },
  inputWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right',
  },
  sideRow: {
    flexDirection: ROW_DIR,
    gap: 12,
  },
  sidePill: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(19,91,236,0.22)',
    backgroundColor: '#fff',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  sidePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#135bec',
  },
  createSubmitBtn: {
    height: 56,
    borderRadius: 18,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: '#135bec',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  createSubmitShell: {
    marginTop: 6,
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#135bec',
  },
  createSubmitBtnEnabled: {
    backgroundColor: '#135bec',
    opacity: 1,
  },
  createSubmitBtnDisabled: {
    backgroundColor: 'rgba(19,91,236,0.45)',
    opacity: 1,
  },
  createSubmitBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  manageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.52)',
  },
  manageScroll: {
    flex: 1,
    width: '100%',
  },
  manageScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  manageCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  manageEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    color: '#135bec',
    textAlign: 'right',
    marginBottom: 6,
  },
  manageTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  manageSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(51,65,85,0.78)',
    textAlign: 'right',
  },
  manageInputWrap: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  manageInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right',
  },
  manageButtonsRow: {
    marginTop: 16,
    flexDirection: ROW_DIR,
    gap: 10,
  },
  manageBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
  },
  manageBtnPrimary: {
    backgroundColor: '#135bec',
    shadowColor: '#135bec',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  manageBtnSecondary: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  manageBtnDisabled: {
    backgroundColor: 'rgba(19,91,236,0.45)',
    shadowOpacity: 0,
    elevation: 0,
  },
  manageBtnFull: {
    marginTop: 12,
    flex: 0,
    width: '100%',
  },
  manageBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  manageBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  manageActionBtn: {
    marginTop: 16,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(19,91,236,0.12)',
    backgroundColor: '#f8fbff',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
  },
  manageActionBtnDanger: {
    marginTop: 10,
    borderColor: 'rgba(239,68,68,0.14)',
    backgroundColor: '#fff7f7',
  },
  manageActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#eaf1ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageActionIconDanger: {
    backgroundColor: '#fee2e2',
  },
  manageActionTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  manageActionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  manageActionTitleDanger: {
    fontSize: 15,
    fontWeight: '900',
    color: '#b91c1c',
    textAlign: 'right',
  },
  manageActionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(51,65,85,0.74)',
    textAlign: 'right',
  },
});

