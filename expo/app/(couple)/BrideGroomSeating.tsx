import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, ActivityIndicator, Modal, TextInput, FlatList, useWindowDimensions, Alert, PanResponder, Platform, StatusBar, ViewStyle, BackHandler } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  interpolate,
  KeyboardState,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Entypo, Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '@/store/layoutStore';
import { Table } from '@/types';
import { Stack, useRouter, useFocusEffect, useLocalSearchParams, useSegments } from 'expo-router';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventSwitcher } from '@/components/EventSwitcher';
import { AppLoader, AppLoaderScreen } from '@/components/AppLoader';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { CELL_SIZE, DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';
import { BlurView } from 'expo-blur';
import { ALIGN_RIGHT, IS_RTL, ROW_DIR, ROW_REVERSE_DIR } from '@/lib/rtl';
import { TableSeatRing, getTableSeatBorderColor, getTableSeatFillColor } from '@/components/couple/TableSeatRing';
import { SeatingViewHeader, type SeatingViewMode } from '@/components/couple/SeatingViewHeader';
import { NavyCardBackground } from '@/components/couple/NavyCardBackground';
import { SeatingTablesGridView, type SeatingGridTableItem } from '@/components/couple/SeatingTablesGridView';
import BackSwipe from '@/components/BackSwipe';

const TABLE_PANEL_DURATION = 500;
const TABLE_NAME_MAX_LENGTH = 10;
const AnimatedEntypo = Reanimated.createAnimatedComponent(Entypo);
const AnimatedBlurView = Reanimated.createAnimatedComponent(BlurView);

function Backdrop({
  onPress,
  duration = TABLE_PANEL_DURATION,
}: {
  onPress: () => void;
  duration?: number;
}) {
  return (
    <Reanimated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2 },
      ]}
      entering={FadeIn.duration(duration)}
      exiting={FadeOut.duration(duration)}
    >
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <AnimatedBlurView style={{ flex: 1 }} intensity={55} />
      </Pressable>
    </Reanimated.View>
  );
}

export type FabButtonProps = {
  onPress: () => void;
  isOpen: boolean;
  children: React.ReactNode;
  panelStyle?: ViewStyle;
  duration?: number;
  openedSize?: number;
  closedSize?: number;
  openedHeight?: number | string;
  openedBorderRadius?: number;
  openedPadding?: number;
  iconColor?: string;
};

export function FabButton({
  onPress,
  isOpen,
  panelStyle,
  children,
  duration = TABLE_PANEL_DURATION,
  openedSize,
  closedSize = 64,
  openedHeight = '75%',
  openedBorderRadius = 20,
  openedPadding = 0,
  iconColor = colors.text,
}: FabButtonProps) {
  const { width, height: windowHeight } = useWindowDimensions();
  const resolvedOpenedSize = openedSize ?? width;
  const resolvedOpenedHeight = useMemo(() => {
    if (typeof openedHeight === 'number' && Number.isFinite(openedHeight)) return openedHeight;
    const s = String(openedHeight ?? '').trim();
    const m = /^(\d+(?:\.\d+)?)%$/.exec(s);
    if (m) {
      const pct = Number(m[1]);
      if (Number.isFinite(pct)) return (windowHeight * pct) / 100;
    }
    // Fallback: keep the panel reasonably sized even if a non-percent string was provided.
    return windowHeight * 0.75;
  }, [openedHeight, windowHeight]);
  const spacing = closedSize * 0.2;
  const closeIconSize = closedSize * 0.34;
  const openIconSize = closedSize * 0.52;
  const { height: keyboardHeight, state } = useAnimatedKeyboard();

  const keyboardHeightStyle = useAnimatedStyle(() => {
    return {
      marginBottom:
        state.value === KeyboardState.OPEN ? keyboardHeight.value - 80 + spacing : 0,
    };
  });

  return (
    <Reanimated.View
      style={[
        tablePanelStyles.panel,
        panelStyle,
        {
          width: isOpen ? resolvedOpenedSize : closedSize,
          height: isOpen ? resolvedOpenedHeight : closedSize,
          borderRadius: isOpen ? openedBorderRadius : closedSize / 2,
          padding: isOpen ? openedPadding : spacing,
        },
        keyboardHeightStyle,
      ]}
      layout={LinearTransition.duration(duration)}
    >
      <Pressable onPress={onPress} style={{ position: 'absolute', right: 0, top: 0, width: closedSize, height: closedSize, zIndex: 3, justifyContent: 'center', alignItems: 'center' }}>
        {isOpen ? (
          <AnimatedEntypo
            key="close"
            name="cross"
            size={closeIconSize}
            color={iconColor}
            entering={FadeIn.duration(duration)}
            exiting={FadeOut.duration(duration)}
          />
        ) : (
          <AnimatedEntypo
            key="open"
            name="plus"
            size={openIconSize}
            color={iconColor}
            entering={FadeIn.duration(duration)}
            exiting={FadeOut.duration(duration)}
          />
        )}
      </Pressable>

      {isOpen ? (
        <Reanimated.View
          entering={FadeInDown.duration(duration)}
          exiting={FadeOutDown.duration(duration)}
          style={{ flex: 1 }}
        >
          {children}
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
}

const tablePanelStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    overflow: 'hidden',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.white,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
});

export default function BrideGroomSeating() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const { userData } = useUserStore();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  
  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    router.replace({ pathname: './', params: { eventId: nextEventId } });
  };

  const isAdminContext = useMemo(() => segments.includes('(admin)'), [segments]);
  const eventBackHref = useMemo(() => {
    if (resolvedEventId) {
      return isAdminContext ? `/(admin)/admin-event-details?id=${resolvedEventId}` : `/(couple)?eventId=${resolvedEventId}`;
    }
    return isAdminContext ? '/(admin)/admin-events' : '/(couple)';
  }, [isAdminContext, resolvedEventId]);

  const handleBack = useCallback(() => {
    router.replace(eventBackHref as any);
  }, [eventBackHref, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [isPositionsReady, setIsPositionsReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [textAreas, setTextAreas] = useState<any[]>([]);
  const [webSketch, setWebSketch] = useState<null | { gridCols: number; gridRows: number; tables: any[]; zones: any[]; labels: any[] }>(null);
  const [seatingViewMode, setSeatingViewMode] = useState<SeatingViewMode>('map');
  const [pressedTable, setPressedTable] = useState<string | null>(null);
  const positions = useRef<{ [id: string]: Animated.ValueXY }>({}).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [dragMode, setDragMode] = useState(false);
  const dragModeRef = useRef(false);
  const [selectedTableForDrag, setSelectedTableForDrag] = useState<string | null>(null);
  const selectedTableForDragRef = useRef<string | null>(null);
  const draggingTableIdRef = useRef<string | null>(null);
  const panRespondersRef = useRef<Record<string, any>>({});
  const wobbleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    selectedTableForDragRef.current = selectedTableForDrag;
  }, [selectedTableForDrag]);
  useEffect(() => {
    dragModeRef.current = dragMode;
    if (dragMode) {
      wobbleAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(wobbleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(wobbleAnim, { toValue: -1, duration: 120, useNativeDriver: true }),
        ])
      ).start();
    } else {
      wobbleAnim.stopAnimation();
      wobbleAnim.setValue(0);
      setSelectedTableForDrag(null);
    }
  }, [dragMode, wobbleAnim]);
  
  const [searchQueryTable, setSearchQueryTable] = useState('');
  const [categoryFilterTable, setCategoryFilterTable] = useState('הכל');
  const [categoriesForTable, setCategoriesForTable] = useState<string[]>([]);

  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<Table | null>(null);
  const [seatedGuestsForTable, setSeatedGuestsForTable] = useState<any[]>([]);
  const [selectedGuestsToAdd, setSelectedGuestsToAdd] = useState<Set<string>>(new Set());
  const [tableModalView, setTableModalView] = useState<'seated' | 'add'>('seated');
  const [tableName, setTableName] = useState('');
  const [seatedEditMode, setSeatedEditMode] = useState(false);
  const [selectedSeatedGuestsToRemove, setSelectedSeatedGuestsToRemove] = useState<Set<string>>(new Set());
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [removeConfirmIds, setRemoveConfirmIds] = useState<string[]>([]);
  const [removeConfirmBusy, setRemoveConfirmBusy] = useState(false);
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [addingGuestsToTable, setAddingGuestsToTable] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('הצלחה');
  const [successMessage, setSuccessMessage] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Origin-based open/close animation for the table panel.
  const panelProgress = useSharedValue(0);
  const panelOriginX = useSharedValue(windowWidth / 2);
  const panelOriginY = useSharedValue(windowHeight / 2);
  const panelTargetX = useSharedValue(windowWidth / 2);
  const panelTargetY = useSharedValue(windowHeight / 2);

  const panelBottom = Math.max(12, insets.bottom + 12);
  const panelHeight = Math.round(windowHeight * 0.75);

  useEffect(() => {
    panelTargetX.value = windowWidth / 2;
    panelTargetY.value = windowHeight - panelBottom - panelHeight / 2;
  }, [panelBottom, panelHeight, panelTargetX, panelTargetY, windowHeight, windowWidth]);

  const isGuestSeatable = (g: any) => {
    const status = String(g?.status ?? '').trim();
    // Allow seating for all statuses except explicit "not coming".
    return status !== 'לא מגיע';
  };

  const getGuestStatusTone = (statusRaw: any) => {
    const status = String(statusRaw ?? '').trim();
    if (status === 'מגיע') {
      return { bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.35)', text: 'rgba(46,125,50,1)', label: status };
    }
    if (status === 'לא מגיע') {
      return { bg: 'rgba(244,67,54,0.10)', border: 'rgba(244,67,54,0.35)', text: 'rgba(183,28,28,1)', label: status };
    }
    if (status === 'ממתין') {
      return { bg: 'rgba(240,203,70,0.18)', border: 'rgba(204,160,0,0.35)', text: colors.gold, label: status };
    }
    return { bg: 'rgba(15,23,42,0.05)', border: 'rgba(15,23,42,0.10)', text: colors.textLight, label: status || '—' };
  };

  const showSuccess = useCallback((title: string, message: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessTitle(title);
    setSuccessMessage(message);
    setSuccessVisible(true);
    successTimerRef.current = setTimeout(() => {
      setSuccessVisible(false);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);
    };
  }, []);

  const panelBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(panelProgress.value, [0, 0.12, 1], [0, 1, 1]),
    };
  });

  const panelAnimatedStyle = useAnimatedStyle(() => {
    const p = panelProgress.value;
    const s = interpolate(p, [0, 1], [0.08, 1]);
    const tx = interpolate(p, [0, 1], [panelOriginX.value - panelTargetX.value, 0]);
    const ty = interpolate(p, [0, 1], [panelOriginY.value - panelTargetY.value, 0]);
    return {
      opacity: interpolate(p, [0, 0.08, 1], [0, 1, 1]),
      transform: [{ translateX: tx }, { translateY: ty }, { scale: s }],
    };
  });

  const handleToggleGuestSelection = (guestId: string) => {
    const newSelection = new Set(selectedGuestsToAdd);
    if (newSelection.has(guestId)) {
      newSelection.delete(guestId);
    } else {
      newSelection.add(guestId);
    }
    setSelectedGuestsToAdd(newSelection);
  };

  const handleAddGuestsToTable = async () => {
    if (selectedGuestsToAdd.size === 0 || addingGuestsToTable) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const tableId = selectedTableForModal?.id;

    if (!tableId) return;

    setAddingGuestsToTable(true);
    try {
      const guestsToAdd = guests.filter(g => guestIds.includes(g.id));
      const totalPeopleToAdd = guestsToAdd.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

      const { error: guestUpdateError } = await supabase
        .from('guests')
        .update({ table_id: tableId })
        .in('id', guestIds);

      if (guestUpdateError) {
        console.error("Error updating guests:", guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להוסיף את האורחים לשולחן');
        return;
      }

      const currentGuestsAtTable = guests.filter(g => g.table_id === tableId);
      const currentTotalPeople = currentGuestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
      const newTotalPeople = currentTotalPeople + totalPeopleToAdd;

      const { error: tableUpdateError } = await supabase
        .from('tables')
        .update({ seated_guests: newTotalPeople })
        .eq('id', tableId);

      if (tableUpdateError) {
        console.error("Error updating table count:", tableUpdateError);
        Alert.alert('שגיאה', 'לא ניתן לעדכן את מספר היושבים בשולחן');
        return;
      }

      await fetchGuests();
      await fetchTables();

      setTableModalView('seated');
      setSelectedGuestsToAdd(new Set());

      const tableNum = selectedTableForModal?.number ?? '';
      const peopleText = totalPeopleToAdd > 0 ? ` (${totalPeopleToAdd} אנשים)` : '';

      setSeatedGuestsForTable((prev) => {
        const existingIds = new Set((prev || []).map((g: any) => String(g?.id)));
        const added = guestsToAdd.map((g: any) => ({ ...g, table_id: tableId }));
        return [...prev, ...added.filter((g: any) => !existingIds.has(String(g?.id)))];
      });

      showSuccess('נוסף לשולחן', `נוספו ${guestIds.length} אורחים${peopleText} לשולחן ${tableNum}`);
    } finally {
      setAddingGuestsToTable(false);
    }
  };

  const toggleSeatedGuestRemovalSelection = useCallback((guestId: string) => {
    setSelectedSeatedGuestsToRemove((prev) => {
      const next = new Set(prev);
      const id = String(guestId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSeatedEditState = useCallback(() => {
    setSeatedEditMode(false);
    setSelectedSeatedGuestsToRemove(new Set());
    setMovePickerVisible(false);
    setMoveTargetTableId(null);
  }, []);

  const movedPeopleCount = useMemo(() => {
    if (!selectedSeatedGuestsToRemove.size) return 0;
    const selectedSet = new Set(Array.from(selectedSeatedGuestsToRemove).map(String));
    return (seatedGuestsForTable || []).reduce((sum, g) => {
      if (!selectedSet.has(String(g?.id))) return sum;
      return sum + (Number(g?.numberOfPeople ?? 1) || 1);
    }, 0);
  }, [seatedGuestsForTable, selectedSeatedGuestsToRemove]);

  const peopleByTableId = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of guests || []) {
      const tid = g?.table_id ? String(g.table_id) : null;
      if (!tid) continue;
      const ppl = Number(g?.numberOfPeople ?? g?.number_of_people ?? 1) || 1;
      map.set(tid, (map.get(tid) ?? 0) + ppl);
    }
    return map;
  }, [guests]);

  const openMovePicker = useCallback(() => {
    setMoveTargetTableId(null);
    setMovePickerVisible(true);
  }, []);

  const performBulkMoveGuestsToTable = useCallback(
    async (ids: string[], destTableId: string) => {
      if (!selectedTableForModal) return;
      if (!ids.length) return;
      const fromTableId = String(selectedTableForModal.id);
      const toTableId = String(destTableId);
      if (!toTableId || toTableId === fromTableId) return;

      const dest = (tables || []).find((t) => String(t?.id) === toTableId) ?? null;
      if (!dest) {
        Alert.alert('שגיאה', 'לא נמצא שולחן יעד');
        return;
      }

      setMoveBusy(true);
      try {
        const selectedSet = new Set(ids.map(String));
        const guestsToMove = seatedGuestsForTable.filter((g) => selectedSet.has(String(g?.id)));
        const totalPeopleMoved = guestsToMove.reduce((sum, g) => sum + (g?.numberOfPeople || 1), 0);

        const { error: guestUpdateError } = await supabase
          .from('guests')
          .update({ table_id: toTableId })
          .in('id', ids);

        if (guestUpdateError) {
          console.error('Error moving guests:', guestUpdateError);
          Alert.alert('שגיאה', 'אירעה שגיאה בהעברת האורחים לשולחן אחר');
          return;
        }

        const remainingGuestsAtSource = seatedGuestsForTable.filter((g) => !selectedSet.has(String(g?.id)));
        const newSourceTotalPeople = remainingGuestsAtSource.reduce((sum, g) => sum + (g?.numberOfPeople || 1), 0);

        const currentGuestsAtDest = (guests || []).filter((g) => String(g?.table_id ?? '') === toTableId);
        const currentDestTotalPeople = currentGuestsAtDest.reduce((sum, g) => sum + (g?.numberOfPeople || 1), 0);
        const newDestTotalPeople = currentDestTotalPeople + totalPeopleMoved;

        const [sourceRes, destRes] = await Promise.all([
          supabase.from('tables').update({ seated_guests: newSourceTotalPeople }).eq('id', fromTableId),
          supabase.from('tables').update({ seated_guests: newDestTotalPeople }).eq('id', toTableId),
        ]);

        if (sourceRes.error || destRes.error) {
          console.error('Error updating table counts:', sourceRes.error || destRes.error);
          Alert.alert('שגיאה', 'אירעה שגיאה בעדכון השולחנות');
          // Continue: we still refresh state.
        }

        await fetchGuests();
        await fetchTables();
        setSeatedGuestsForTable(remainingGuestsAtSource);
        setSelectedSeatedGuestsToRemove(new Set());
        setMovePickerVisible(false);
        setMoveTargetTableId(null);

        const peopleText = totalPeopleMoved > 0 ? ` (${totalPeopleMoved} אנשים)` : '';
        showSuccess('הועבר לשולחן', `הועברו ${ids.length} אורחים${peopleText} לשולחן ${dest.number ?? ''}`);
      } catch (e) {
        console.error('Error in bulk move guests:', e);
        Alert.alert('שגיאה', 'אירעה שגיאה בהעברת האורחים לשולחן אחר');
      } finally {
        setMoveBusy(false);
      }
    },
    [fetchGuests, fetchTables, guests, seatedGuestsForTable, selectedTableForModal, showSuccess, tables]
  );

  const performBulkRemoveGuestsFromTable = useCallback(
    async (ids: string[]) => {
      if (!selectedTableForModal) return;
      if (!ids.length) return;

      setRemoveConfirmBusy(true);
      try {
        const { error: guestUpdateError } = await supabase
          .from('guests')
          .update({ table_id: null })
          .in('id', ids);

        if (guestUpdateError) {
          console.error('Error removing guests from table:', guestUpdateError);
          Alert.alert('שגיאה', 'אירעה שגיאה בהסרת האורחים מהשולחן');
          return;
        }

        const selectedSet = new Set(ids.map(String));
        const remainingGuestsAtTable = seatedGuestsForTable.filter((g) => !selectedSet.has(String(g.id)));
        const newTotalPeople = remainingGuestsAtTable.reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);

        const { error: tableUpdateError } = await supabase
          .from('tables')
          .update({ seated_guests: newTotalPeople })
          .eq('id', selectedTableForModal.id);

        if (tableUpdateError) {
          console.error('Error updating table count:', tableUpdateError);
          Alert.alert('שגיאה', 'אירעה שגיאה בעדכון השולחן');
          return;
        }

        await fetchGuests();
        await fetchTables();
        setSeatedGuestsForTable(remainingGuestsAtTable);
        clearSeatedEditState();
      } catch (e) {
        console.error('Error in bulk remove guests:', e);
        Alert.alert('שגיאה', 'אירעה שגיאה בהסרת האורחים מהשולחן');
      } finally {
        setRemoveConfirmBusy(false);
      }
    },
    [clearSeatedEditState, fetchGuests, fetchTables, seatedGuestsForTable, selectedTableForModal]
  );

  const handleRemoveSelectedGuestsFromTable = useCallback(() => {
    if (!selectedTableForModal) return;
    const ids = Array.from(selectedSeatedGuestsToRemove);
    if (ids.length === 0) return;

    setRemoveConfirmIds(ids);
    setRemoveConfirmVisible(true);
  }, [selectedSeatedGuestsToRemove, selectedTableForModal]);

  const handleMoveSelectedGuests = useCallback(() => {
    if (!selectedTableForModal) return;
    const ids = Array.from(selectedSeatedGuestsToRemove);
    if (ids.length === 0) return;
    openMovePicker();
  }, [openMovePicker, selectedSeatedGuestsToRemove, selectedTableForModal]);

  const handleSaveTableName = async () => {
    if (!selectedTableForModal) {
      return;
    }
    
    const currentName = selectedTableForModal.name || '';
    const nextName = tableName.trim().slice(0, TABLE_NAME_MAX_LENGTH);
    if (nextName === currentName.trim()) {
      return; // No change, do nothing
    }
    
    const { error } = await supabase
      .from('tables')
      .update({ name: nextName || null })
      .eq('id', selectedTableForModal.id);
  
    if (error) {
      console.error('Error updating table name:', error);
    } else {
      // Update local state to reflect the change immediately
      setTables(currentTables => 
        currentTables.map(t => 
          t.id === selectedTableForModal.id ? { ...t, name: nextName || null } : t
        )
      );
      // Update the selected table for modal as well
      setSelectedTableForModal(prev => prev ? { ...prev, name: nextName || null } : null);
    }
  };

  const { setTabBarVisible } = useLayoutStore();
  // Keep the bottom tab bar visible on the seating screen as well.
  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(true);
      return undefined;
    }, [setTabBarVisible])
  );

  // הצגת הודעה כשאירוע עדיין לא מאושר
  useFocusEffect(
    useCallback(() => {
      if (!resolvedEventId || isAdminContext) return;
      let cancelled = false;
      eventService.getEvent(resolvedEventId).then((evt) => {
        if (cancelled) return;
        if (evt?.isApproved === false) {
          Alert.alert(
            'האירוע עדיין ממתין לאישור',
            'מפת הושבה תהיה זמינה לאחר שצוות MOON יאשר את האירוע שלך.',
            [{ text: 'הבנתי', style: 'default', onPress: () => router.replace(eventBackHref as any) }]
          );
        }
      }).catch(() => {/* fail open */});
      return () => { cancelled = true; };
    }, [resolvedEventId, isAdminContext, router, eventBackHref])
  );

  // If user rotates while in drag mode, exit drag mode.
  useEffect(() => {
    if (isLandscape && dragMode) setDragMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLandscape]);

  const handleTablePress = (table: Table, origin?: { x: number; y: number }) => {
    if (closePanelTimerRef.current) {
      clearTimeout(closePanelTimerRef.current);
      closePanelTimerRef.current = null;
    }

    // Seed the origin for the animation (fallback: screen center).
    const ox = Number(origin?.x);
    const oy = Number(origin?.y);
    panelOriginX.value = Number.isFinite(ox) ? ox : windowWidth / 2;
    panelOriginY.value = Number.isFinite(oy) ? oy : windowHeight / 2;
    panelProgress.value = 0;

    setSelectedTableForModal(table);
    setTableName(table.name || '');
    const guestsForTable = guests.filter(g => g.table_id === table.id);
    setSeatedGuestsForTable(guestsForTable);
    
    // Reset filters and view
    setTableModalView('seated');
    setSearchQueryTable('');
    const unseated = guests.filter((g) => !g.table_id);
    const categories = ['הכל', ...Array.from(new Set(unseated.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setCategoriesForTable(categories);
    setCategoryFilterTable('הכל');

    setTableModalVisible(true);
    clearSeatedEditState();

    requestAnimationFrame(() => {
      panelProgress.value = withTiming(1, { duration: TABLE_PANEL_DURATION });
    });
  };

  const closeModalAndShowTabBar = async () => {
    if (addingGuestsToTable) return;
    // Save table name best-effort (don't block the close animation).
    void handleSaveTableName();

    panelProgress.value = withTiming(0, { duration: TABLE_PANEL_DURATION });

    // Clear transient overlays/state immediately.
    if (movePickerVisible) {
      setMovePickerVisible(false);
      setMoveTargetTableId(null);
    }
    if (removeConfirmVisible) {
      setRemoveConfirmVisible(false);
      setRemoveConfirmIds([]);
    }
    clearSeatedEditState();
    setSuccessVisible(false);
    setSuccessMessage('');
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);
    closePanelTimerRef.current = setTimeout(() => {
      setTableModalVisible(false);
    }, TABLE_PANEL_DURATION);
  };

  const handleRemoveGuestFromTable = async (guestId: string) => {
    // מציאת האורח שמוסר
    const guestToRemove = guests.find(g => g.id === guestId);
    if (!guestToRemove) return;

    // 1. Update guest's table_id to null
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: null })
      .eq('id', guestId);

    if (guestUpdateError) {
      console.error("Error removing guest from table:", guestUpdateError);
      return;
    }
    
    // 2. עדכון מספר האנשים בשולחן - חישוב מחדש בלי האורח שהוסר
    const remainingGuestsAtTable = guests.filter(g => g.table_id === selectedTableForModal?.id && g.id !== guestId);
    const newTotalPeople = remainingGuestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
    
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: newTotalPeople })
      .eq('id', selectedTableForModal?.id);
      
    if (tableUpdateError) {
      console.error("Error updating table count:", tableUpdateError);
      return;
    }

    // Refresh data
    await fetchGuests();
    await fetchTables();
    
    // Refresh the modal view
    const updatedGuestsForTable = seatedGuestsForTable.filter(g => g.id !== guestId);
    setSeatedGuestsForTable(updatedGuestsForTable);
  };

  const handleDeleteTable = async () => {
    if (!selectedTableForModal) return;
    
    // הצג אישור מחיקה
    Alert.alert(
      'מחיקת שולחן',
      `האם אתה בטוח שברצונך למחוק את שולחן ${selectedTableForModal.number}? כל האורחים שיושבים בו יוסרו מהשולחן.`,
      [
        { text: 'ביטול', style: 'cancel' },
        { 
          text: 'מחק', 
          style: 'destructive', 
          onPress: async () => {
            try {
              // 1. הסר את כל האורחים מהשולחן
              const { error: guestUpdateError } = await supabase
                .from('guests')
                .update({ table_id: null })
                .eq('table_id', selectedTableForModal.id);
              
              if (guestUpdateError) {
                console.error("Error removing guests from table:", guestUpdateError);
                Alert.alert('שגיאה', 'אירעה שגיאה בהסרת האורחים מהשולחן');
                return;
              }
              
              // 2. מחק את השולחן
              const { error: tableDeleteError } = await supabase
                .from('tables')
                .delete()
                .eq('id', selectedTableForModal.id);
                
              if (tableDeleteError) {
                console.error("Error deleting table:", tableDeleteError);
                Alert.alert('שגיאה', 'אירעה שגיאה במחיקת השולחן');
                return;
              }
              
              // 3. רענן את הנתונים
              await fetchGuests();
              await fetchTables();
              
              // 4. סגור את החלון
              await closeModalAndShowTabBar();
              
              Alert.alert('הצלחה', 'השולחן נמחק בהצלחה');
            } catch (error) {
              console.error("Error in handleDeleteTable:", error);
              Alert.alert('שגיאה', 'אירעה שגיאה במחיקת השולחן');
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    if (userData?.id && resolvedEventId) setActiveEvent(userData.id, resolvedEventId);
  }, [userData?.id, resolvedEventId, setActiveEvent]);

  useFocusEffect(
    useCallback(() => {
      // רענון בכניסה למסך: לואדר מלא רק בטעינה הראשונה, אחרת רענון שקט ברקע
      if (resolvedEventId) {
        const isFirstLoad = !hasLoadedOnceRef.current;
        if (isFirstLoad) setLoading(true);
        Promise.all([
          fetchTables(),
          fetchTextAreas(),
          fetchGuests(),
        ]).finally(() => {
          hasLoadedOnceRef.current = true;
          if (isFirstLoad) setLoading(false);
        });
      }
      
      // איפוס מיקום וזום כשחוזרים לעמוד
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: false });
          scrollViewRef.current.setNativeProps({
            zoomScale: 1,
            contentOffset: { x: 0, y: 0 }
          });
        }
      }, 200);
    }, [resolvedEventId])
  );

  // יצירת Animated.ValueXY לכל שולחן
  useEffect(() => {
    let newPositionsCreated = false;
    tables.forEach(table => {
      if (!positions[table.id]) {
        newPositionsCreated = true;
        positions[table.id] = new Animated.ValueXY({
          x: typeof table.x === 'number' ? table.x : 40,
          y: typeof table.y === 'number' ? table.y : 60
        });
      }
    });

    // ניקוי זיכרון
    Object.keys(positions).forEach(id => {
      if (!tables.find(t => t.id === id)) {
        delete positions[id];
      }
    });

    if (newPositionsCreated) {
      setIsPositionsReady(true);
    }
  }, [tables]);

  // חישוב גבולות המפה לפי השולחנות (נדרש גם לשמירת מיקום אחרי גרירה)
  const minX = tables.length > 0 ? Math.min(...tables.map(t => t.x ?? 0)) : 0;
  const maxX = tables.length > 0 ? Math.max(...tables.map(t => t.x ?? 0)) : windowWidth;
  const padding = 100;
  const canvasWidth = maxX - minX + padding * 2;

  const persistDraggedTablePosition = useCallback(
    async (tableId: string) => {
      if (!positions[tableId]) return;
      try {
        const { x: adjustedX, y } = (positions[tableId] as any).__getValue?.() ?? { x: 0, y: 0 };
        const rawX = adjustedX - padding + minX;
        const rawY = y;

        const { error } = await supabase
          .from('tables')
          .update({ x: rawX, y: rawY })
          .eq('id', tableId);

        if (!error) {
          setTables((prev) =>
            prev.map((t) => (t.id === tableId ? ({ ...t, x: rawX, y: rawY } as any) : t))
          );
        } else {
          console.error('Error saving table position:', error);
        }
      } catch (e) {
        console.error('Error persisting dragged position:', e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minX]
  );

  const getPanResponderForTable = useCallback(
    (tableId: string) => {
      if (panRespondersRef.current[tableId]) return panRespondersRef.current[tableId];

      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => dragModeRef.current,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          dragModeRef.current &&
          (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: () => {
          draggingTableIdRef.current = tableId;
          setSelectedTableForDrag(tableId);
          const current = (positions[tableId] as any).__getValue?.() ?? { x: 0, y: 0 };
          positions[tableId].setOffset({ x: current.x, y: current.y });
          positions[tableId].setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: positions[tableId].x, dy: positions[tableId].y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: async () => {
          positions[tableId].flattenOffset();
          draggingTableIdRef.current = null;
          await persistDraggedTablePosition(tableId);
        },
        onPanResponderTerminate: async () => {
          positions[tableId].flattenOffset();
          draggingTableIdRef.current = null;
          await persistDraggedTablePosition(tableId);
        },
      });

      panRespondersRef.current[tableId] = responder;
      return responder;
    },
    [persistDraggedTablePosition, positions]
  );

  async function fetchTables() {
    if (!resolvedEventId) return;
    
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('event_id', resolvedEventId)
      .order('number');
    
    if (!error) setTables(data || []);
  }

  async function fetchGuests() {
    if (!resolvedEventId) return;

    try {
      // Avoid PostgREST relationship joins (PGRST200) by fetching separately and joining client-side.
      const [
        { data: guestsData, error: guestsError },
        { data: categoriesData, error: categoriesError },
        { data: tablesData, error: tablesError },
      ] = await Promise.all([
        supabase.from('guests').select('*').eq('event_id', resolvedEventId),
        supabase.from('guest_categories').select('id,name').eq('event_id', resolvedEventId),
        supabase.from('tables').select('id,number').eq('event_id', resolvedEventId),
      ]);

      if (guestsError) throw guestsError;
      if (categoriesError) throw categoriesError;
      if (tablesError) throw tablesError;

      const categoryNameById = new Map<string, string>(
        (categoriesData || []).map((c: any) => [c.id, c.name])
      );
      const tableNumberById = new Map<string, number>(
        (tablesData || []).map((t: any) => [t.id, t.number])
      );

      const mappedGuests = (guestsData || []).map((guest: any) => ({
        ...guest,
        guest_categories: guest.category_id
          ? { name: categoryNameById.get(guest.category_id) }
          : null,
        tables: guest.table_id ? { number: tableNumberById.get(guest.table_id) } : null,
        numberOfPeople: guest.number_of_people || 1,
      }));

      setGuests(mappedGuests);
    } catch (error) {
      console.error('Error fetching guests for stats:', error);
    }
  }

  function getWebV2FromAnnotations(annotations: any) {
    if (!annotations) return null;
    if (Array.isArray(annotations)) {
      const found = annotations.find((x) => x && typeof x === 'object' && x.type === 'web_v2' && x.version === 2);
      return found ?? null;
    }
    if (typeof annotations === 'object') {
      const w = (annotations as any).web_v2;
      return w && typeof w === 'object' ? w : null;
    }
    return null;
  }

  function toArrayMaybe(value: any) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      // Some older/surprising shapes might be stored as object maps.
      return Object.values(value);
    }
    return [];
  }

  const toFiniteNumber = (value: any) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeOrientation = (value: any): Orientation => (value === 'column' ? 'column' : 'row');

  const normalizeTableType = (value: any): TableType => {
    const v = String(value ?? '').trim();
    if (v === 'regular' || v === 'reserve' || v === 'knight') return v;
    // Back-compat: legacy booleans
    if ((value as any)?.isReserve) return 'reserve';
    if ((value as any)?.isKnight) return 'knight';
    return 'regular';
  };

  const normalizeWebV2Tables = (items: any[]) => {
    return (items || [])
      .filter(Boolean)
      .map((t: any, idx: number) => {
        const type: TableType = normalizeTableType(t?.type ?? t);
        const seats =
          toFiniteNumber(t?.seats ?? t?.capacity) ?? (type === 'knight' ? 20 : 12);
        const nameRaw = t?.name ?? t?.tableName ?? t?.label ?? t?.title ?? '';
        const name = String(nameRaw ?? '').trim() || null;
        const gridX =
          toFiniteNumber(
            t?.gridX ??
              t?.x ??
              t?.col ??
              t?.grid?.x ??
              t?.pos?.x ??
              t?.position?.x ??
              t?.p?.x
          ) ?? 0;
        const gridY =
          toFiniteNumber(
            t?.gridY ??
              t?.y ??
              t?.row ??
              t?.grid?.y ??
              t?.pos?.y ??
              t?.position?.y ??
              t?.p?.y
          ) ?? 0;
        const orientation = normalizeOrientation(t?.orientation);
        const number = toFiniteNumber(t?.number ?? t?.num ?? t?.tableNumber);
        return {
          id: String(t?.id ?? `table-${idx}`),
          type,
          seats,
          orientation,
          gridX,
          gridY,
          ...(name ? { name } : {}),
          ...(number != null ? { number: Math.round(number) } : {}),
        };
      })
      .filter((t: any) => Number.isFinite(t.gridX) && Number.isFinite(t.gridY));
  };

  const normalizeWebV2Zones = (items: any[]) => {
    return (items || [])
      .filter(Boolean)
      .map((z: any, idx: number) => {
        const gridX =
          toFiniteNumber(z?.gridX ?? z?.x ?? z?.col ?? z?.grid?.x ?? z?.pos?.x ?? z?.position?.x ?? z?.p?.x) ?? 0;
        const gridY =
          toFiniteNumber(z?.gridY ?? z?.y ?? z?.row ?? z?.grid?.y ?? z?.pos?.y ?? z?.position?.y ?? z?.p?.y) ?? 0;
        const widthCells = toFiniteNumber(z?.widthCells ?? z?.w ?? z?.width) ?? 1;
        const heightCells = toFiniteNumber(z?.heightCells ?? z?.h ?? z?.height) ?? 1;
        return {
          id: String(z?.id ?? `zone-${idx}`),
          name: String(z?.name ?? ''),
          gridX,
          gridY,
          widthCells: Math.max(1, Math.round(widthCells)),
          heightCells: Math.max(1, Math.round(heightCells)),
        };
      });
  };

  const normalizeWebV2Labels = (items: any[]) => {
    return (items || [])
      .filter(Boolean)
      .map((l: any, idx: number) => {
        const gridX =
          toFiniteNumber(l?.gridX ?? l?.x ?? l?.col ?? l?.grid?.x ?? l?.pos?.x ?? l?.position?.x ?? l?.p?.x) ?? 0;
        const gridY =
          toFiniteNumber(l?.gridY ?? l?.y ?? l?.row ?? l?.grid?.y ?? l?.pos?.y ?? l?.position?.y ?? l?.p?.y) ?? 0;
        return {
          id: String(l?.id ?? `label-${idx}`),
          text: String(l?.text ?? ''),
          gridX,
          gridY,
        };
      });
  };

  // משיכת הערות (annotations) + סקיצה מה-DB
  const fetchTextAreas = async () => {
    if (!resolvedEventId) return;
    
    const { data, error } = await supabase
      .from('seating_maps')
      .select('annotations,tables')
      .eq('event_id', resolvedEventId)
      .maybeSingle();

    const annotations = (data as any)?.annotations;
    if (!error && data && Array.isArray(annotations)) {
      setTextAreas(annotations);
    } else {
      setTextAreas([]);
    }

    // Web sketch (readonly viewer): prefer web_v2, else fallback to legacy seating_maps.tables (or public.tables)
    try {
      const webV2 = getWebV2FromAnnotations(annotations);
      // We'll prefer web_v2 for zones/labels and grid size, but if tables are missing
      // we'll fall back to legacy/public tables.
      const webV2Cols =
        webV2 && typeof webV2?.grid?.cols === 'number' ? Math.round(webV2.grid.cols) : DEFAULT_GRID_COLS;
      const webV2Rows =
        webV2 && typeof webV2?.grid?.rows === 'number' ? Math.round(webV2.grid.rows) : DEFAULT_GRID_ROWS;
      const webV2ZonesRaw = webV2 ? toArrayMaybe(webV2.zones ?? webV2?.state?.zones ?? webV2?.data?.zones) : [];
      const webV2LabelsRaw = webV2 ? toArrayMaybe(webV2.labels ?? webV2?.state?.labels ?? webV2?.data?.labels) : [];
      const webV2TablesRaw = webV2 ? toArrayMaybe(webV2.tables ?? webV2?.state?.tables ?? webV2?.data?.tables) : [];

      let finalCols = webV2Cols;
      let finalRows = webV2Rows;
      let finalTables: any[] = normalizeWebV2Tables(webV2TablesRaw);
      let finalZones: any[] = normalizeWebV2Zones(webV2ZonesRaw);
      let finalLabels: any[] = normalizeWebV2Labels(webV2LabelsRaw);

      if (__DEV__ && webV2) {
        console.log('[BrideGroomSeating:webSketch]', {
          source: 'web_v2',
          cols: finalCols,
          rows: finalRows,
          tables: finalTables.length,
          zones: finalZones.length,
          labels: finalLabels.length,
        });
      }

      // If web_v2 didn't include tables, try legacy first.
      if (!finalTables.length) {
        const legacy = Array.isArray((data as any)?.tables) ? ((data as any).tables as any[]) : null;
        if (legacy && legacy.length) {
          const mapped = legacy.filter(Boolean).map((t: any, idx: number) => {
            const type: TableType = t.isReserve ? 'reserve' : t.isKnight ? 'knight' : 'regular';
            const num = typeof t.id === 'number' ? t.id : idx + 1;
            const gridX = Math.round((Number(t.x) || 0) / 40);
            const gridY = Math.round((Number(t.y) || 0) / 40);
            return {
              id: `table-legacy-${num}`,
              type,
              seats: Number(t.seats) || (type === 'knight' ? 20 : 12),
              orientation: 'row' as Orientation,
              gridX,
              gridY,
              number: num,
            };
          });
          const maxX = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w),
            0
          );
          const maxY = mapped.reduce(
            (m: number, t: any) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h),
            0
          );
          finalCols = Math.max(finalCols, DEFAULT_GRID_COLS, maxX + 6);
          finalRows = Math.max(finalRows, DEFAULT_GRID_ROWS, maxY + 6);
          finalTables = mapped;
        }
      }

      // Last fallback: query public.tables directly (don't rely on state timing).
      if (!finalTables.length) {
        const { data: publicTables, error: publicTablesError } = await supabase
          .from('tables')
          .select('id,number,name,capacity,shape,x,y')
          .eq('event_id', resolvedEventId);
        if (!publicTablesError && Array.isArray(publicTables) && publicTables.length) {
          const px = publicTables.map((t: any) => ({
            x: Number(t?.x) || 0,
            y: Number(t?.y) || 0,
          }));
          const pxXMin = Math.min(...px.map((p) => p.x));
          const pxXMax = Math.max(...px.map((p) => p.x));
          const pxYMin = Math.min(...px.map((p) => p.y));
          const pxYMax = Math.max(...px.map((p) => p.y));
          const publicPositionsUnset = pxXMax === 0 && pxXMin === 0 && pxYMax === 0 && pxYMin === 0;

          const mapped = publicTables.map((t: any) => {
            const type: TableType = t.shape === 'reserve' ? 'reserve' : t.shape === 'rectangle' ? 'knight' : 'regular';
            const gridX = Math.round((Number(t.x) || 0) / 40);
            const gridY = Math.round((Number(t.y) || 0) / 40);
            return {
              id: `table-public-${t.id}`,
              type,
              seats: Number(t.capacity) || (type === 'knight' ? 20 : 12),
              orientation: 'row' as Orientation,
              gridX,
              gridY,
              number: typeof t.number === 'number' ? t.number : undefined,
              name: String(t?.name ?? '').trim() || null,
            };
          });
          finalTables = normalizeWebV2Tables(mapped);

          // If all tables have pixel positions unset (x=y=0), we *must* auto-layout.
          // Otherwise the map will always show a stacked column on the edge.
          if (publicPositionsUnset) {
            // Mark by forcing X spread check to pass (handled below).
            finalTables = finalTables.map((t: any) => ({ ...t, gridX: 0, gridY: 0 }));
          }
        }
      }

      // Ensure we never pass invalid coordinates to the readonly grid (native would render nothing).
      // Re-normalize whatever source we ended up with.
      finalTables = normalizeWebV2Tables(finalTables);

      // If all tables cluster at the same X (i.e. no real 2D layout was designed),
      // auto-arrange them into a grid so the mobile map is actually readable.
      if (finalTables.length >= 2) {
        const xs = finalTables.map((t: any) => Number(t.gridX) || 0);
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const shouldAutoArrange =
          xMax - xMin <= 2 ||
          finalTables.every((t: any) => (Number(t.gridX) || 0) === 0 && (Number(t.gridY) || 0) === 0);

        if (shouldAutoArrange) {
          // Spread tables more horizontally (especially in landscape) and add generous spacing.
          const n = finalTables.length;
          const aspect = windowWidth / Math.max(1, windowHeight);
          const isWide = aspect >= 1.2;
          const COL_MULT = isWide ? 2.0 : 1.45;
          const TABLE_COLS = Math.min(14, Math.max(4, Math.ceil(Math.sqrt(n) * COL_MULT)));

          const STEP = isWide ? 9 : 8; // cells
          const START_X = 4;
          const START_Y = 4;

          finalTables = finalTables.map((t: any, idx: number) => ({
            ...t,
            gridX: START_X + (idx % TABLE_COLS) * STEP,
            gridY: START_Y + Math.floor(idx / TABLE_COLS) * STEP,
          }));
        }
      }

      // Always ensure grid dims fit the placed content (avoid overlaps / tiny cramped view).
      if (finalTables.length || finalZones.length || finalLabels.length) {
        const maxX = Math.max(
          0,
          ...finalTables.map((t: any) => (Number(t.gridX) || 0) + tableCellSize(t.type, t.seats, t.orientation).w),
          ...finalZones.map((z: any) => (Number(z.gridX) || 0) + (Number(z.widthCells) || 1)),
          ...finalLabels.map((l: any) => (Number(l.gridX) || 0) + 1)
        );
        const maxY = Math.max(
          0,
          ...finalTables.map((t: any) => (Number(t.gridY) || 0) + tableCellSize(t.type, t.seats, t.orientation).h),
          ...finalZones.map((z: any) => (Number(z.gridY) || 0) + (Number(z.heightCells) || 1)),
          ...finalLabels.map((l: any) => (Number(l.gridY) || 0) + 1)
        );

        // Keep reasonable but never too small; contentRect will crop excess anyway.
        finalCols = Math.max(24, Math.ceil(maxX) + 6);
        finalRows = Math.max(20, Math.ceil(maxY) + 6);
      }

      if (finalTables.length || finalZones.length || finalLabels.length) {
        setWebSketch({
          gridCols: finalCols,
          gridRows: finalRows,
          tables: finalTables,
          zones: finalZones,
          labels: finalLabels,
        });
        return;
      }

      // No sketch content
      setWebSketch(null);
      return;
    } catch {
      setWebSketch(null);
    }
  };
  
  const resetZoom = () => {
    if (scrollViewRef.current) {
      // איפוס מיקום
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: true });
      // איפוס זום
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.setNativeProps({
            zoomScale: 1,
            contentOffset: { x: 0, y: 0 }
          });
        }
      }, 300);
    }
  };

  // IMPORTANT: hooks must run on every render (before any early returns).
  const seatedByNumber = useMemo(() => {
    const numberById = new Map<string, number>(
      (tables || []).filter(Boolean).map((t: any) => [String(t.id), Number(t.number)])
    );
    const map = new Map<number, number>();
    for (const g of guests || []) {
      const tid = g?.table_id ? String(g.table_id) : null;
      if (!tid) continue;
      const num = numberById.get(tid);
      if (!num) continue;
      const ppl = Number(g?.numberOfPeople ?? g?.number_of_people ?? 1) || 1;
      map.set(num, (map.get(num) ?? 0) + ppl);
    }
    return map;
  }, [guests, tables]);

  // Keep these hooks ABOVE early returns (loading / no event) to preserve hook order.
  const unseatedGuestsList = guests.filter((g) => !g.table_id);

  const seatingHeaderStats = useMemo(() => {
    const seatableGuests = (guests || []).filter(isGuestSeatable);
    const peopleAt = (g: any) => Number(g?.numberOfPeople ?? g?.number_of_people ?? 1) || 1;

    const totalSeatablePeople = seatableGuests.reduce((sum, g) => sum + peopleAt(g), 0);
    const seatedPeople = seatableGuests
      .filter((g) => g?.table_id)
      .reduce((sum, g) => sum + peopleAt(g), 0);
    const seatedPercent =
      totalSeatablePeople > 0 ? (seatedPeople / totalSeatablePeople) * 100 : 0;

    const waitingCount = seatableGuests
      .filter((g) => !g?.table_id)
      .reduce((sum, g) => sum + peopleAt(g), 0);

    let fullTablesCount = 0;
    for (const t of tables || []) {
      const cap = Number(t?.capacity ?? 0) || 0;
      if (cap <= 0) continue;
      const seated = (guests || [])
        .filter((g) => String(g?.table_id) === String(t.id))
        .reduce((sum, g) => sum + peopleAt(g), 0);
      if (seated >= cap) fullTablesCount += 1;
    }

    return {
      seatedPercent,
      tablesCount: (tables || []).length,
      fullTablesCount,
      waitingCount,
    };
  }, [guests, tables]);

  const webSketchWithNames = useMemo(() => {
    if (!webSketch) return null;
    const byNumber = new Map<number, string | null>();
    const byRawId = new Map<string, string | null>();

    for (const t of tables || []) {
      const name = String((t as any)?.name ?? '').trim() || null;
      byRawId.set(String((t as any)?.id ?? ''), name);
      const num = Number((t as any)?.number);
      if (Number.isFinite(num)) byNumber.set(num, name);
    }

    const mergedTables = (webSketch.tables || []).map((t: any) => {
      const existing = String(t?.name ?? '').trim() || null;
      if (existing) return t;
      const num = Number(t?.number);
      const fromNum = Number.isFinite(num) ? (byNumber.get(num) ?? null) : null;
      // In some fallbacks we prefix the id (e.g. table-public-<uuid>), so try to strip prefixes.
      const rawId = String(t?.id ?? '');
      const stripped =
        rawId.startsWith('table-public-')
          ? rawId.replace('table-public-', '')
          : rawId.startsWith('table-live-')
            ? rawId.replace('table-live-', '')
            : rawId;
      const fromId = (byRawId.get(rawId) ?? byRawId.get(stripped) ?? null);
      const name = fromNum ?? fromId;
      return name ? { ...t, name } : t;
    });

    return { ...webSketch, tables: mergedTables };
  }, [tables, webSketch]);

  const gridTables = useMemo((): SeatingGridTableItem[] => {
    const sketchTables = webSketchWithNames?.tables ?? webSketch?.tables;
    if (sketchTables?.length) {
      return sketchTables.map((t: any) => ({
        id: String(t.id),
        type: (t.type ?? 'regular') as TableType,
        seats: Number(t.seats ?? 0) || 0,
        orientation: t.orientation,
        gridX: t.gridX,
        gridY: t.gridY,
        number: t.number,
        name: t.name ?? null,
      }));
    }

    return (tables || []).map((t) => ({
      id: String(t.id),
      type: (t.shape === 'reserve' ? 'reserve' : t.shape === 'rectangle' ? 'knight' : 'regular') as TableType,
      seats: Number(t.capacity ?? 0) || 0,
      number: t.number,
      name: t.name ?? null,
      area: t.area ?? null,
    }));
  }, [tables, webSketch, webSketchWithNames]);

  const gridZones = webSketchWithNames?.zones ?? webSketch?.zones ?? [];

  const mapNode = webSketch ? (
    <View style={styles.canvasScroll}>
      {Platform.OS === 'web' ? (
        <SeatingGridReadonly
          gridCols={webSketchWithNames?.gridCols ?? webSketch.gridCols}
          gridRows={webSketchWithNames?.gridRows ?? webSketch.gridRows}
          tables={webSketchWithNames?.tables ?? webSketch.tables}
          zones={webSketchWithNames?.zones ?? webSketch.zones}
          labels={webSketchWithNames?.labels ?? webSketch.labels}
          hideTableType
          cellSizeMultiplier={2}
          useBaseColorAsWebBackground
          showTableBorder={false}
          showSeatRing
          getTableOccupancy={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            if (!Number.isFinite(num)) return { seated: 0, capacity: cap };
            return { seated: seatedByNumber.get(num) ?? 0, capacity: cap };
          }}
          getTableBaseColor={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
            const full = cap > 0 && seated >= cap;
            const over = cap > 0 && seated > cap;
            if (over) return '#06173d';
            if (full) return '#06173d';
            return t?.type === 'reserve' ? colors.warning : '#06173d';
          }}
          getTableBackgroundAlpha={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
            const full = cap > 0 && seated >= cap;
            const over = cap > 0 && seated > cap;
            if (over) return 0.82;
            if (full) return 0.82;
            return t?.type === 'reserve' ? 0.32 : 0.82;
          }}
          getTableTooltip={(t: any) => {
            const num = t?.number;
            if (!num) return null;
            const seated = seatedByNumber.get(Number(num)) ?? 0;
            const cap = Number(t?.seats ?? 0) || 0;
            return cap ? `מקומות / יושבים: ${cap} / ${seated}` : `יושבים בשולחן: ${seated}`;
          }}
          getTableSubLabel={(t: any) => {
            const num = t?.number;
            if (!num) return null;
            const seated = seatedByNumber.get(Number(num)) ?? 0;
            const cap = Number(t?.seats ?? 0) || 0;
            return cap ? `${seated}/${cap}` : String(seated);
          }}
          onPressTableNumber={(num: number | undefined, origin?: { x: number; y: number }) => {
            if (!num) return;
            const t = tables.find((x) => x.number === num);
            if (t) handleTablePress(t, origin);
          }}
        />
      ) : (
        <MobileSeatingMap
          sketch={(webSketchWithNames ?? webSketch) as any}
          onPressTableNumber={(num: number | undefined, origin?: { x: number; y: number }) => {
            if (!num) return;
            const t = tables.find((x) => x.number === num);
            if (t) handleTablePress(t, origin);
          }}
          getTableOccupancy={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            if (!Number.isFinite(num)) return { seated: 0, capacity: cap };
            return { seated: seatedByNumber.get(num) ?? 0, capacity: cap };
          }}
          getTableSubLabel={(t: any) => {
            const num = t?.number;
            if (!num) return null;
            const seated = seatedByNumber.get(Number(num)) ?? 0;
            const cap = Number(t?.seats ?? 0) || 0;
            return cap ? `${seated}/${cap}` : String(seated);
          }}
        />
      )}
    </View>
  ) : (
    <AppKeyboardAwareScrollView
      ref={scrollViewRef}
      style={styles.canvasScroll}
      contentContainerStyle={{
        width: canvasWidth,
        height: windowHeight * 2,
      }}
      maximumZoomScale={3}
      minimumZoomScale={0.5}
      bounces={false}
      bouncesZoom={false}
      horizontal
      scrollEnabled={!dragMode}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.canvas, { width: canvasWidth, height: windowHeight * 2 }]}>
        {/* Grid */}
        {[...Array(Math.ceil((windowHeight * 2) / 50))].map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: i * 50 }]} />
        ))}
        {[...Array(Math.ceil(canvasWidth / 80))].map((_, i) => (
          <View key={i} style={[styles.gridLineV, { left: i * 80 }]} />
        ))}

        {/* Tables */}
        {tables.map((table) => {
          // מיקום מתוקן לפי minX ו-padding
          const adjustedX = (table.x ?? 0) - minX + padding;
          if (!positions[table.id]) {
            positions[table.id] = new Animated.ValueXY({
              x: adjustedX,
              y: typeof table.y === 'number' ? table.y : 60,
            });
          }
          // Calculate total people seated at this table
          const guestsAtTable = guests.filter((g) => g.table_id === table.id);
          const totalPeopleSeated = guestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
          const isReserveTable = table.shape === 'reserve';
          const cap = Number(table.capacity ?? 0) || 0;
          const isTableFull = cap > 0 && totalPeopleSeated >= cap;
          const isTableOverFull = cap > 0 && totalPeopleSeated > cap;
          return (
            <Animated.View
              key={table.id}
              style={[
                styles.table,
                table.shape === 'rectangle' ? styles.tableRect : styles.tableSquare,
                isReserveTable && styles.reserveTableStyle,
                isTableFull && styles.tableFullStyle,
                isTableOverFull && styles.tableOverFullStyle,
                selectedTableForDrag === table.id && styles.tableSelected,
                {
                  transform: [
                    ...(positions[table.id]
                      ? positions[table.id].getTranslateTransform()
                      : [{ translateX: adjustedX }, { translateY: table.y ?? 60 }]),
                    {
                      rotate: dragMode
                        ? wobbleAnim.interpolate({
                            inputRange: [-1, 1],
                            outputRange: ['-2deg', '2deg'],
                          })
                        : '0deg',
                    },
                  ],
                },
              ]}
              {...getPanResponderForTable(table.id).panHandlers}
            >
              <Pressable
                onPressIn={() => setPressedTable(table.id)}
                onPressOut={() => setPressedTable(null)}
                onLongPress={() => {
                  // Long press enters drag mode (like iOS home screen)
                  dragModeRef.current = true;
                  setDragMode(true);
                  setSelectedTableForDrag(table.id);
                }}
                delayLongPress={320}
                onPress={(e) => {
                  // Tap opens modal only when not in drag mode
                  if (draggingTableIdRef.current === table.id) return;
                  if (!dragMode) {
                    handleTablePress(table, {
                      x: e?.nativeEvent?.pageX ?? windowWidth / 2,
                      y: e?.nativeEvent?.pageY ?? windowHeight / 2,
                    });
                  }
                }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text
                  style={[
                    styles.tableName,
                    isReserveTable && styles.reserveTableText,
                    isTableFull && styles.tableFullText,
                    isTableOverFull && styles.tableOverFullText,
                    pressedTable === table.id && { color: isTableFull ? colors.white : colors.textLight },
                  ]}
                >
                  {table.number}
                </Text>
                {table.name ? (
                  <Text
                    style={[
                      styles.tableCustomName,
                      isReserveTable && styles.reserveTableCapText,
                      isTableFull && styles.tableFullCapText,
                      isTableOverFull && styles.tableOverFullCapText,
                    ]}
                    numberOfLines={1}
                  >
                    {table.name}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.tableCap,
                    isReserveTable && styles.reserveTableCapText,
                    isTableFull && styles.tableFullCapText,
                    isTableOverFull && styles.tableOverFullCapText,
                    pressedTable === table.id && { color: isTableFull ? colors.white : colors.gray[500] },
                  ]}
                >
                  {table.capacity} / {totalPeopleSeated}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Text Areas */}
        {textAreas.map((t, idx) => (
          <View key={t.id} style={[styles.textArea, { top: (t.y ?? 200) + idx * 40, left: t.x ?? 200 }]}>
            <Text style={styles.textAreaText}>{t.text}</Text>
          </View>
        ))}
      </View>
    </AppKeyboardAwareScrollView>
  );

  if (loading) {
    return (
      <AppLoaderScreen
        variant="default"
        title="טוען מפת ישיבה"
        subtitle="מכין את השולחנות והאורחים"
      />
    );
  }
  
  if (!resolvedEventId) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>אין אירוע זמין</Text>
      </View>
    );
  }

  // (landscape hooks already computed above)

  const safeTopInset = Math.max(
    insets.top || 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  );

  return (
    <BackSwipe fallbackHref={eventBackHref} onBack={handleBack}>
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="#152949" />

      <View style={styles.seatingHeaderShell}>
        <NavyCardBackground variant="compact" />
        <View style={[styles.seatingHeaderInner, { paddingTop: safeTopInset + 8 }]}>
          <View style={[styles.headerNavRow, { flexDirection: ROW_REVERSE_DIR }]}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.headerBackBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.eventSwitcherInHeader}>
              <EventSwitcher
                userId={userData?.id}
                selectedEventId={resolvedEventId}
                onSelectEventId={handleSelectEventId}
                label="אירוע פעיל"
              />
            </View>
            <View style={styles.headerSideSpacer} />
          </View>
          <SeatingViewHeader
            flush
            viewMode={seatingViewMode}
            onChangeViewMode={setSeatingViewMode}
            seatedPercent={seatingHeaderStats.seatedPercent}
            tablesCount={seatingHeaderStats.tablesCount}
            fullTablesCount={seatingHeaderStats.fullTablesCount}
            waitingCount={seatingHeaderStats.waitingCount}
          />
        </View>
      </View>

      <View style={styles.mapFrame}>
        {seatingViewMode === 'map' ? (
          mapNode
        ) : (
          <SeatingTablesGridView
            tables={gridTables}
            zones={gridZones}
            getOccupancy={(t) => {
              const num = Number(t.number);
              const cap = Number(t.seats ?? 0) || 0;
              if (!Number.isFinite(num)) return { seated: 0, capacity: cap };
              return { seated: seatedByNumber.get(num) ?? 0, capacity: cap };
            }}
            onPressTable={(num) => {
              if (!num) return;
              const t = tables.find((x) => x.number === num);
              if (t) {
                handleTablePress(t, {
                  x: windowWidth / 2,
                  y: windowHeight / 2,
                });
              }
            }}
          />
        )}
      </View>

      {dragMode && (
        <TouchableOpacity
          style={[styles.dragModePill, { top: safeTopInset + 8 }]}
          onPress={() => setDragMode(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.dragModeText}>סיים גרירה</Text>
        </TouchableOpacity>
      )}

      {/* Table Guests Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={tableModalVisible}
        onRequestClose={() => {
          if (addingGuestsToTable) return;
          if (movePickerVisible) {
            if (moveBusy) return;
            setMovePickerVisible(false);
            setMoveTargetTableId(null);
            return;
          }
          if (removeConfirmVisible) {
            if (removeConfirmBusy) return;
            setRemoveConfirmVisible(false);
            setRemoveConfirmIds([]);
            return;
          }
          closeModalAndShowTabBar();
        }}
      >
        <View style={{ flex: 1 }}>
          {/* Backdrop + blur (animated together with the panel) */}
          <Reanimated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2 },
              panelBackdropStyle,
            ]}
          >
            <Pressable
              onPress={() => {
                if (addingGuestsToTable) return;
                if (movePickerVisible) {
                  if (moveBusy) return;
                  setMovePickerVisible(false);
                  setMoveTargetTableId(null);
                  return;
                }
                if (removeConfirmVisible) {
                  if (removeConfirmBusy) return;
                  setRemoveConfirmVisible(false);
                  setRemoveConfirmIds([]);
                  return;
                }
                closeModalAndShowTabBar();
              }}
              style={{ flex: 1 }}
            >
              <AnimatedBlurView style={{ flex: 1 }} intensity={55} />
            </Pressable>
          </Reanimated.View>

          {/* Panel (animates from/to the pressed table position) */}
          <Reanimated.View
            style={[
              styles.tablePanel,
              {
                height: panelHeight,
                bottom: panelBottom,
              },
              panelAnimatedStyle,
            ]}
          >
            <Pressable
              onPress={() => {
                if (addingGuestsToTable) return;
                if (movePickerVisible) {
                  if (moveBusy) return;
                  setMovePickerVisible(false);
                  setMoveTargetTableId(null);
                  return;
                }
                if (removeConfirmVisible) {
                  if (removeConfirmBusy) return;
                  setRemoveConfirmVisible(false);
                  setRemoveConfirmIds([]);
                  return;
                }
                closeModalAndShowTabBar();
              }}
              style={styles.tablePanelCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="סגירה"
            >
              <AnimatedEntypo name="cross" size={22} color={colors.text} />
            </Pressable>

            <AppLoader
              visible={addingGuestsToTable}
              variant="seating"
              count={selectedGuestsToAdd.size}
              tableNumber={selectedTableForModal?.number}
            />

            <View style={styles.modalSheetContent}>
              <View style={styles.modalHero}>
                <View style={styles.modalHeroTitleWrap}>
                  <Text style={styles.modalTitle}>
                    {selectedTableForModal?.name?.trim()
                      ? selectedTableForModal.name
                      : `שולחן ${selectedTableForModal?.number ?? ''}`}
                  </Text>
                  <Text style={styles.modalHeroSubtitle}>
                    {`שולחן ${selectedTableForModal?.number ?? ''} · ${seatedGuestsForTable.length} אורחים`}
                  </Text>
                </View>
                <View style={styles.modalHeroBadge}>
                  <Ionicons name="people-outline" size={14} color={colors.primary} />
                  <Text style={styles.modalHeroBadgeText}>
                    {`${peopleByTableId.get(String(selectedTableForModal?.id ?? '')) ?? 0} / ${selectedTableForModal?.capacity ?? 0}`}
                  </Text>
                </View>
              </View>

              <View style={styles.tableNameContainer}>
                <View style={styles.tableNameRow}>
                  <TouchableOpacity style={styles.saveNameButton} onPress={handleSaveTableName}>
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.tableNameInput}
                    value={tableName}
                    onChangeText={(text) => setTableName(text.slice(0, TABLE_NAME_MAX_LENGTH))}
                    placeholder="הוסף שם לשולחן (אופציונלי)"
                    placeholderTextColor={colors.gray[500]}
                    maxLength={TABLE_NAME_MAX_LENGTH}
                    onBlur={handleSaveTableName}
                    onSubmitEditing={handleSaveTableName}
                    returnKeyType="done"
                    blurOnSubmit={true}
                  />
                </View>
              </View>

              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[styles.toggleButton, tableModalView === 'seated' && styles.toggleButtonActive]}
                  onPress={() => {
                    setTableModalView('seated');
                  }}
                >
                  <Text style={[styles.toggleButtonText, tableModalView === 'seated' && styles.toggleButtonTextActive]}>
                    אורחים ({seatedGuestsForTable.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, tableModalView === 'add' && styles.toggleButtonActive]}
                  onPress={() => {
                    if (addingGuestsToTable) return;
                    setTableModalView('add');
                    clearSeatedEditState();
                  }}
                  disabled={addingGuestsToTable}
                >
                  <Text style={[styles.toggleButtonText, tableModalView === 'add' && styles.toggleButtonTextActive]}>
                    הוספת אורחים
                  </Text>
                </TouchableOpacity>
              </View>

              {tableModalView === 'seated' && (
                <View style={{ flex: 1 }}>
                  <View style={styles.seatedHeaderRow}>
                    <TouchableOpacity
                      style={styles.seatedEditButton}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (seatedEditMode) clearSeatedEditState();
                        else {
                          setSelectedSeatedGuestsToRemove(new Set());
                          setSeatedEditMode(true);
                        }
                      }}
                    >
                      <Ionicons
                        name={seatedEditMode ? 'close' : 'create-outline'}
                        size={18}
                        color={colors.text}
                        style={undefined}
                      />
                      <Text style={styles.seatedEditButtonText}>{seatedEditMode ? 'ביטול' : 'עריכה'}</Text>
                    </TouchableOpacity>
                  </View>

                  <FlatList
                    data={seatedGuestsForTable}
                    keyExtractor={(item) => String(item.id)}
                    numColumns={2}
                    columnWrapperStyle={styles.seatedGuestRow}
                    renderItem={({ item }) => {
                      const id = String(item.id);
                      const selected = selectedSeatedGuestsToRemove.has(id);
                      const tone = getGuestStatusTone(item?.status);
                      return (
                        <TouchableOpacity
                          style={[
                            styles.seatedGuestItem,
                            seatedEditMode && styles.seatedGuestItemEditMode,
                            seatedEditMode && selected && styles.seatedGuestItemSelected,
                          ]}
                          activeOpacity={seatedEditMode ? 0.85 : 1}
                          onPress={() => {
                            if (!seatedEditMode) return;
                            toggleSeatedGuestRemovalSelection(id);
                          }}
                        >
                          <View style={styles.seatedGuestMain}>
                            <View style={styles.seatedGuestTopRow}>
                              <Text
                                style={[styles.guestName, seatedEditMode && styles.guestNameEditMode]}
                                numberOfLines={2}
                              >
                                {item.name}
                              </Text>
                            </View>

                            <View style={styles.seatedGuestMetaRow}>
                              {!seatedEditMode ? (
                                <View style={[styles.guestStatusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                                  <Text style={[styles.guestStatusText, { color: tone.text }]} numberOfLines={1}>
                                    {tone.label}
                                  </Text>
                                </View>
                              ) : null}

                              <View style={styles.peopleCountBadge}>
                                <Ionicons name="person" size={10} color={colors.richBlack} />
                                <Text style={styles.peopleCountText}>{item.numberOfPeople || 1}</Text>
                              </View>
                            </View>
                          </View>

                          {seatedEditMode ? (
                            <View style={styles.seatedGuestCheckboxWrap}>
                              <Ionicons
                                name={selected ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={selected ? colors.primary : colors.gray[300]}
                              />
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    }}
                    nestedScrollEnabled
                    style={{ flex: 1, marginTop: 12 }}
                    contentContainerStyle={styles.seatedGuestListContent}
                    ListEmptyComponent={<Text style={styles.emptyListText}>אין אורחים יושבים בשולחן זה</Text>}
                  />

                  {seatedEditMode ? (
                    <View style={styles.bulkActionsRow}>
                      <TouchableOpacity
                        style={[
                          styles.bulkMoveButton,
                          selectedSeatedGuestsToRemove.size === 0 && styles.disabledButton,
                        ]}
                        activeOpacity={0.9}
                        disabled={selectedSeatedGuestsToRemove.size === 0}
                        onPress={handleMoveSelectedGuests}
                      >
                        <Text style={styles.bulkMoveButtonText}>
                          {selectedSeatedGuestsToRemove.size > 0
                            ? `העבר (${selectedSeatedGuestsToRemove.size})`
                            : 'העבר'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.bulkRemoveButton,
                          selectedSeatedGuestsToRemove.size === 0 && styles.disabledButton,
                        ]}
                        activeOpacity={0.9}
                        disabled={selectedSeatedGuestsToRemove.size === 0}
                        onPress={handleRemoveSelectedGuestsFromTable}
                      >
                        <Text style={styles.bulkRemoveButtonText}>
                          {selectedSeatedGuestsToRemove.size > 0
                            ? `הסר (${selectedSeatedGuestsToRemove.size})`
                            : 'הסר'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}

              {tableModalView === 'add' && (
                <>
                  <View style={styles.filterContainer}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="חיפוש לפי שם..."
                      value={searchQueryTable}
                      onChangeText={setSearchQueryTable}
                      placeholderTextColor={colors.gray[500]}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
                      <View style={styles.categoryContainer}>
                        {categoriesForTable.map((category) => (
                          <TouchableOpacity
                            key={category}
                            style={[
                              styles.categoryButton,
                              categoryFilterTable === category && styles.categoryButtonActive,
                            ]}
                            onPress={() => setCategoryFilterTable(category)}
                          >
                            <Text
                              style={[
                                styles.categoryButtonText,
                                categoryFilterTable === category && styles.categoryButtonTextActive,
                              ]}
                            >
                              {category}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  <FlatList
                    data={unseatedGuestsList.filter((g) => {
                      const categoryMatch =
                        categoryFilterTable === 'הכל' ||
                        (g.guest_categories?.name || 'ללא קטגוריה') === categoryFilterTable;
                      const searchMatch = g.name.toLowerCase().includes(searchQueryTable.toLowerCase());
                      return categoryMatch && searchMatch;
                    })}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={2}
                    columnWrapperStyle={{ justifyContent: 'space-between' }}
                    renderItem={({ item }) => {
                      const id = String(item?.id ?? '');
                      const seatable = isGuestSeatable(item);
                      const tone = getGuestStatusTone(item?.status);
                      const selected = selectedGuestsToAdd.has(id);

                      return (
                        <TouchableOpacity
                          style={[
                            styles.selectableGuestItem,
                            selected && styles.selectableGuestItemSelected,
                            !seatable && styles.selectableGuestItemDisabled,
                          ]}
                          onPress={() => {
                            if (addingGuestsToTable || !seatable) return;
                            handleToggleGuestSelection(item.id);
                          }}
                          activeOpacity={seatable && !addingGuestsToTable ? 0.85 : 1}
                          disabled={addingGuestsToTable || !seatable}
                        >
                          <View style={styles.selectableGuestMain}>
                            <View style={styles.selectableGuestTopRow}>
                              <Text style={styles.selectableGuestName} numberOfLines={2}>
                                {item.name}
                              </Text>

                              <View style={styles.selectableGuestCheckboxWrap}>
                                <Ionicons
                                  name={selected ? 'checkbox' : 'square-outline'}
                                  size={20}
                                  color={!seatable ? colors.gray[300] : selected ? colors.primary : colors.gray[300]}
                                />
                              </View>
                            </View>

                            <View style={styles.selectableGuestMetaRow}>
                              <View style={[styles.guestStatusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                                <Text style={[styles.guestStatusText, { color: tone.text }]} numberOfLines={1}>
                                  {tone.label}
                                </Text>
                              </View>

                              <View style={styles.peopleCountBadge}>
                                <Ionicons name="person" size={10} color={colors.richBlack} />
                                <Text style={styles.peopleCountText}>{item.numberOfPeople || 1}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    nestedScrollEnabled
                    style={{ flex: 1 }}
                    ListEmptyComponent={<Text style={styles.emptyListText}>אין אורחים לא משובצים</Text>}
                  />

                  <TouchableOpacity
                    style={[
                      styles.finalAddButton,
                      (selectedGuestsToAdd.size === 0 || addingGuestsToTable) && styles.disabledButton,
                    ]}
                    onPress={handleAddGuestsToTable}
                    disabled={selectedGuestsToAdd.size === 0 || addingGuestsToTable}
                  >
                    <Text style={styles.finalAddButtonText}>
                      {addingGuestsToTable
                        ? 'מושיב...'
                        : selectedGuestsToAdd.size > 0
                          ? `הוסף ${selectedGuestsToAdd.size} אורחים`
                          : 'בחר אורחים להוספה'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Reanimated.View>

          {/* RTL Confirm Remove Guests (keep inside the same overlay layer) */}
          {removeConfirmVisible ? (
            <View style={styles.confirmOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill as any}
                onPress={() => {
                  if (removeConfirmBusy) return;
                  setRemoveConfirmVisible(false);
                  setRemoveConfirmIds([]);
                }}
              />
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>הסרת אורחים מהשולחן</Text>
                <Text style={styles.confirmMessage}>האם להסיר {removeConfirmIds.length} אורחים מהשולחן?</Text>

                <View style={styles.confirmButtonsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.confirmBtn, styles.confirmBtnCancel]}
                    disabled={removeConfirmBusy}
                    onPress={() => {
                      if (removeConfirmBusy) return;
                      setRemoveConfirmVisible(false);
                      setRemoveConfirmIds([]);
                    }}
                  >
                    <Text style={styles.confirmBtnText}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.confirmBtn,
                      styles.confirmBtnDanger,
                      removeConfirmBusy && styles.confirmBtnDisabled,
                    ]}
                    disabled={removeConfirmBusy}
                    onPress={async () => {
                      const ids = [...removeConfirmIds];
                      await performBulkRemoveGuestsFromTable(ids);
                      setRemoveConfirmVisible(false);
                      setRemoveConfirmIds([]);
                    }}
                  >
                    {removeConfirmBusy ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>הסר</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {/* Move guests picker (RTL) */}
          {movePickerVisible ? (
            <View style={styles.confirmOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill as any}
                onPress={() => {
                  if (moveBusy) return;
                  setMovePickerVisible(false);
                  setMoveTargetTableId(null);
                }}
              />
              <View style={styles.moveCard}>
                {/* Header */}
                <View style={styles.moveCardHeader}>
                  <View style={styles.moveCardIconWrap}>
                    <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.moveCardTitle}>העברת אורחים</Text>
                    <Text style={styles.moveCardSub} numberOfLines={1}>
                      {selectedSeatedGuestsToRemove.size} אורח{selectedSeatedGuestsToRemove.size !== 1 ? 'ים' : ''}
                      {movedPeopleCount > 0 ? ` · ${movedPeopleCount} אנשים` : ''}
                      {' '}מ׳ שולחן {selectedTableForModal?.number ?? ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.moveDivider} />

                <Text style={styles.movePickerLabel}>בחר שולחן יעד</Text>

                <View style={styles.moveListWrap}>
                  <AppKeyboardAwareScrollView contentContainerStyle={styles.moveListContent} showsVerticalScrollIndicator={false}>
                    {(tables || [])
                      .filter((t) => String(t?.id) !== String(selectedTableForModal?.id))
                      .slice()
                      .sort((a: any, b: any) => (Number(a?.number ?? 0) || 0) - (Number(b?.number ?? 0) || 0))
                      .map((t: any) => {
                        const active = String(moveTargetTableId ?? '') === String(t?.id ?? '');
                        const tid = String(t?.id ?? '');
                        const seatedNow = peopleByTableId.get(tid) ?? 0;
                        const afterMove = seatedNow + (movedPeopleCount || 0);
                        const cap = Number(t?.capacity ?? 0) || 0;
                        const pct = cap > 0 ? Math.min(1, afterMove / cap) : 0;
                        const barColor = pct >= 1 ? '#10B981' : pct >= 0.8 ? '#F59E0B' : colors.primary;
                        return (
                          <TouchableOpacity
                            key={String(t?.id ?? '')}
                            activeOpacity={0.86}
                            style={[styles.moveTableOption, active && styles.moveTableOptionActive]}
                            onPress={() => setMoveTargetTableId(String(t?.id ?? ''))}
                            disabled={moveBusy}
                          >
                            {/* Radio circle */}
                            <View style={[styles.moveRadioCircle, active && styles.moveRadioCircleActive]}>
                              {active ? (
                                <View style={styles.moveRadioInner} />
                              ) : null}
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.moveTableTitle, active && styles.moveTableTitleActive]} numberOfLines={1}>
                                שולחן {t?.number ?? ''}
                                {t?.name ? ` · ${String(t.name).trim()}` : ''}
                              </Text>

                              {/* Occupancy row */}
                              <View style={styles.moveOccRow}>
                                <Text style={[styles.moveTableSub, active && { color: colors.primary }]}>
                                  {cap > 0 ? `${cap} / ${seatedNow}` : String(seatedNow)}
                                </Text>
                                {active && movedPeopleCount > 0 ? (
                                  <>
                                    <Ionicons name="arrow-forward" size={11} color={colors.primary} />
                                    <Text style={styles.moveTableAfter}>
                                      {cap > 0 ? `${cap} / ${afterMove}` : String(afterMove)}
                                    </Text>
                                  </>
                                ) : null}
                              </View>

                              {/* Progress bar */}
                              {cap > 0 ? (
                                <View style={styles.moveBarTrack}>
                                  <View style={[styles.moveBarFill, {
                                    width: `${Math.min(100, Math.round((active && movedPeopleCount > 0 ? afterMove : seatedNow) / cap * 100))}%` as any,
                                    backgroundColor: barColor,
                                  }]} />
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </AppKeyboardAwareScrollView>
                </View>

                {/* Action buttons */}
                <View style={styles.moveActionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.moveBtnCancel}
                    disabled={moveBusy}
                    onPress={() => {
                      if (moveBusy) return;
                      setMovePickerVisible(false);
                      setMoveTargetTableId(null);
                    }}
                  >
                    <Text style={styles.moveBtnCancelText}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.moveBtnConfirm,
                      (!moveTargetTableId || moveBusy) && styles.moveBtnConfirmDisabled,
                    ]}
                    disabled={!moveTargetTableId || moveBusy}
                    onPress={async () => {
                      const ids = Array.from(selectedSeatedGuestsToRemove);
                      const destId = String(moveTargetTableId ?? '');
                      await performBulkMoveGuestsToTable(ids, destId);
                    }}
                  >
                    {moveBusy ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <>
                        <Ionicons name="swap-horizontal" size={16} color={colors.white} style={undefined} />
                        <Text style={styles.moveBtnConfirmText}>
                          העבר {selectedSeatedGuestsToRemove.size > 0 ? `(${selectedSeatedGuestsToRemove.size})` : ''}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {/* Success (styled, RTL) - keep table panel open */}
          {successVisible ? (
            <View style={styles.successOverlay}>
              <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setSuccessVisible(false)} />
              <View style={styles.successCard}>
                <View style={styles.successHeaderRow}>
                  <View style={styles.successIconWrap}>
                    <Ionicons name="checkmark" size={18} color="rgba(6,95,70,1)" />
                  </View>
                  <View style={styles.successTitleWrap}>
                    <Text style={styles.successTitle}>{successTitle}</Text>
                  </View>
                </View>
                <Text style={styles.successMessage}>{successMessage}</Text>
                <TouchableOpacity activeOpacity={0.86} style={styles.successBtn} onPress={() => setSuccessVisible(false)}>
                  <Text style={styles.successBtnText}>הבנתי</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Map only: rendered inside mapFrame above */}
    </View>
    </BackSwipe>
  );
}

function clampNumber(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

// Larger cell size for the map-only view so table names are readable.
const MAP_CELL = 36;
const MAP_CLAMP_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };
const MAP_CLAMP_SPRING = { damping: 24, stiffness: 200, mass: 0.85 };
const MAP_MIN_PAN_SLACK = 56;

function MobileSeatingMap({
  sketch,
  onPressTableNumber,
  getTableSubLabel,
  getTableOccupancy,
}: {
  sketch: { gridCols: number; gridRows: number; tables: any[]; zones: any[]; labels: any[] };
  onPressTableNumber?: (num: number | undefined, origin?: { x: number; y: number }) => void;
  getTableSubLabel?: (t: any) => string | null;
  getTableOccupancy?: (t: any) => { seated: number; capacity: number } | null;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [mapViewport, setMapViewport] = useState<{ w: number; h: number } | null>(null);
  const viewportW = mapViewport?.w ?? winW;
  const viewportH = mapViewport?.h ?? winH;

  // ── Content bounds ────────────────────────────────────────────────────────
  const contentRect = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    const include = (x0: number, y0: number, x1: number, y1: number) => {
      minX = Math.min(minX, x0); minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
    };
    for (const t of sketch.tables || []) {
      const sz = tableCellSize(t.type, t.seats, t.orientation);
      include(t.gridX, t.gridY, t.gridX + sz.w, t.gridY + sz.h);
    }
    for (const z of sketch.zones || []) include(z.gridX, z.gridY, z.gridX + z.widthCells, z.gridY + z.heightCells);
    for (const l of sketch.labels || []) include(l.gridX, l.gridY, l.gridX + 1, l.gridY + 1);
    if (!Number.isFinite(minX))
      return { originX: 0, originY: 0, cols: Math.max(1, sketch.gridCols), rows: Math.max(1, sketch.gridRows) };
    const pad = 1;
    const ox = Math.max(0, Math.floor(minX) - pad);
    const oy = Math.max(0, Math.floor(minY) - pad);
    return {
      originX: ox, originY: oy,
      cols: Math.max(1, Math.ceil(maxX) + pad - ox),
      rows: Math.max(1, Math.ceil(maxY) + pad - oy),
    };
  }, [sketch.gridCols, sketch.gridRows, sketch.labels, sketch.tables, sketch.zones]);

  const baseW = contentRect.cols * MAP_CELL;
  const baseH = contentRect.rows * MAP_CELL;

  // ── Shared values (all on the UI thread) ─────────────────────────────────
  // tx/ty are PAN offsets in SCREEN pixels from the centered position.
  // The Reanimated.View is centered by flexbox, so at tx=0,ty=0,scale=fitS
  // the map fills exactly the viewport.
  const scale   = useSharedValue(1);
  const tx      = useSharedValue(0);
  const ty      = useSharedValue(0);
  // "saved" = values at gesture start (avoids jumps on new touch)
  const sv_s  = useSharedValue(1);
  const sv_tx = useSharedValue(0);
  const sv_ty = useSharedValue(0);
  // Viewport + content dims available to worklets
  const vW = useSharedValue(viewportW);
  const vH = useSharedValue(viewportH);
  const cW = useSharedValue(baseW);
  const cH = useSharedValue(baseH);

  useEffect(() => {
    vW.value = viewportW;
    vH.value = viewportH;
  }, [viewportW, viewportH, vW, vH]);
  useEffect(() => { cW.value = baseW; cH.value = baseH; }, [baseW, baseH, cW, cH]);

  const syncSavedFromCurrent = () => {
    'worklet';
    sv_s.value = scale.value;
    sv_tx.value = tx.value;
    sv_ty.value = ty.value;
  };

  const clampTiming = MAP_CLAMP_TIMING;

  // ── Fit: scale to fill viewport, center (tx=ty=0) ────────────────────────
  const doFit = useCallback(() => {
    const vw = viewportW;
    const vh = viewportH;
    const bw = baseW;
    const bh = baseH;
    if (!vw || !vh || !bw || !bh) return;
    vW.value = vw;
    vH.value = vh;
    cW.value = bw;
    cH.value = bh;
    const s = clampNumber(Math.min(vw / bw, vh / bh) * 1.08, 0.1, 10);
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
    scale.value = withTiming(s, clampTiming, (finished) => {
      if (finished) syncSavedFromCurrent();
    });
    tx.value = withTiming(0, clampTiming);
    ty.value = withTiming(0, clampTiming);
  }, [viewportW, viewportH, baseW, baseH, scale, tx, ty, sv_s, sv_tx, sv_ty, vW, vH, cW, cH]);

  const lastFitKeyRef = useRef('');
  useEffect(() => {
    if (!mapViewport?.w || !mapViewport?.h) return;
    const key = `${Math.round(mapViewport.w)}|${Math.round(mapViewport.h)}|${baseW}|${baseH}`;
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    doFit();
  }, [mapViewport?.w, mapViewport?.h, baseW, baseH, doFit]);

  // ── Clamp: keep map reachable; called on UI thread after each gesture ─────
  const doClamp = (animate = false) => {
    'worklet';
    const s = scale.value;
    const bw = cW.value;
    const bh = cH.value;
    const vw = vW.value;
    const vh = vH.value;
    const pad = 32;
    const mxRaw = (bw * s - vw) / 2;
    const myRaw = (bh * s - vh) / 2;
    const mx = Math.max(MAP_MIN_PAN_SLACK, mxRaw > 0 ? mxRaw + pad : MAP_MIN_PAN_SLACK);
    const my = Math.max(MAP_MIN_PAN_SLACK, myRaw > 0 ? myRaw + pad : MAP_MIN_PAN_SLACK);
    const ntx = clampNumber(tx.value, -mx, mx);
    const nty = clampNumber(ty.value, -my, my);
    const dx = ntx - tx.value;
    const dy = nty - ty.value;
    const needsAdjust = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    const snapDistance = Math.hypot(dx, dy);

    if (animate && needsAdjust && snapDistance > 10) {
      cancelAnimation(tx);
      cancelAnimation(ty);
      tx.value = withSpring(ntx, MAP_CLAMP_SPRING, (finished) => {
        if (finished) syncSavedFromCurrent();
      });
      ty.value = withSpring(nty, MAP_CLAMP_SPRING);
    } else if (needsAdjust) {
      tx.value = ntx;
      ty.value = nty;
      syncSavedFromCurrent();
    } else {
      syncSavedFromCurrent();
    }
  };

  // ── Gestures ──────────────────────────────────────────────────────────────
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      cancelAnimation(scale); cancelAnimation(tx); cancelAnimation(ty);
      sv_s.value  = scale.value;
      sv_tx.value = tx.value;
      sv_ty.value = ty.value;
    })
    .onUpdate((e) => {
      const minS = clampNumber(Math.min(vW.value / Math.max(1, cW.value), vH.value / Math.max(1, cH.value)) * 0.4, 0.08, 1);
      const maxS = 10;
      const ns = clampNumber(sv_s.value * e.scale, minS, maxS);
      // Zoom toward the pinch focal point
      const cx = vW.value / 2;
      const cy = vH.value / 2;
      const fpx = (e.focalX - cx - sv_tx.value) / Math.max(0.001, sv_s.value);
      const fpy = (e.focalY - cy - sv_ty.value) / Math.max(0.001, sv_s.value);
      scale.value = ns;
      tx.value = sv_tx.value - fpx * (ns - sv_s.value);
      ty.value = sv_ty.value - fpy * (ns - sv_s.value);
    })
    .onEnd(() => {
      'worklet';
      doClamp(true);
      sv_s.value = scale.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .minDistance(2)
    .onBegin(() => {
      cancelAnimation(tx); cancelAnimation(ty);
      sv_tx.value = tx.value;
      sv_ty.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = sv_tx.value + e.translationX;
      ty.value = sv_ty.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      doClamp(true);
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const panStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
    ],
  }));

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // ── Zoom buttons ─────────────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    const minS = clampNumber(
      Math.min(viewportW / Math.max(1, baseW), viewportH / Math.max(1, baseH)) * 0.4,
      0.08,
      1,
    );
    const ns = clampNumber(scale.value * factor, minS, 10);
    cancelAnimation(scale);
    scale.value = withTiming(ns, clampTiming, (finished) => {
      'worklet';
      if (finished) {
        sv_s.value = ns;
        doClamp(true);
      }
    });
  }, [viewportW, viewportH, baseW, baseH, scale, sv_s, doClamp]);

  return (
    <View
      style={styles.mobileMapRoot}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        const h = e.nativeEvent.layout.height;
        if (w > 0 && h > 0) {
          setMapViewport((prev) =>
            prev && Math.round(prev.w) === Math.round(w) && Math.round(prev.h) === Math.round(h)
              ? prev
              : { w, h },
          );
        }
      }}
    >
      {/* Full-screen grid background so no white space outside map */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill as any}>
        <Defs>
          <Pattern id="bg-grid" x="0" y="0" width={MAP_CELL} height={MAP_CELL} patternUnits="userSpaceOnUse">
            <Rect x="0" y="0" width={MAP_CELL} height={MAP_CELL} fill="transparent" />
            <Line x1={MAP_CELL} y1="0" x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
            <Line x1="0" y1={MAP_CELL} x2="0" y2="0" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg-grid)" />
      </Svg>

      <GestureDetector gesture={gesture}>
        {/* flex centering: at tx=0,ty=0 the content is exactly centered */}
        <View style={styles.mobileCenter}>
          <Reanimated.View style={panStyle}>
            <Reanimated.View style={[{ width: baseW, height: baseH }, scaleStyle]}>

            {/* Zones */}
            {(sketch.zones || []).map((z: any) => {
              const left = (Number(z.gridX) - contentRect.originX) * MAP_CELL;
              const top  = (Number(z.gridY) - contentRect.originY) * MAP_CELL;
              return (
                <View
                  key={String(z.id)}
                  style={[styles.mobileZone, {
                    width:  (Number(z.widthCells)  || 1) * MAP_CELL,
                    height: (Number(z.heightCells) || 1) * MAP_CELL,
                    transform: [{ translateX: left }, { translateY: top }],
                  }]}
                >
                  <Text style={styles.mobileZoneText} numberOfLines={1}>{String(z.name ?? '')}</Text>
                </View>
              );
            })}

            {/* Tables */}
            {(sketch.tables || []).map((t: any) => {
              const sz   = tableCellSize(t.type, t.seats, t.orientation);
              const left = (Number(t.gridX) - contentRect.originX) * MAP_CELL;
              const top  = (Number(t.gridY) - contentRect.originY) * MAP_CELL;
              const isReserve = t.type === 'reserve';
              const occ = getTableOccupancy?.(t) ?? null;
              const cap = Number(occ?.capacity ?? t?.seats ?? 0) || 0;
              const seated = Number(occ?.seated ?? 0) || 0;
              const reserveBorder = 'rgba(245, 158, 11, 0.55)';
              const defaultBorder = 'rgba(203, 213, 225, 0.85)';
              const border = getTableSeatBorderColor(
                seated,
                cap,
                isReserve ? reserveBorder : defaultBorder,
              );
              const w = sz.w * MAP_CELL;
              const h = sz.h * MAP_CELL;
              const tableName = String(t?.name ?? '').trim();
              const isKnight = t.type === 'knight';
              const namePad = tableName ? (isKnight ? 13 : 20) : 4;
              const ringW = w - 4;
              const ringH = h - namePad;
              const ringSize = isKnight ? Math.min(ringW, ringH) : Math.min(w, h) - (tableName ? 24 : 8);
              const filledColor = getTableSeatFillColor(seated, cap);
              return (
                <Pressable
                  key={String(t.id)}
                  onPress={(e) =>
                    onPressTableNumber?.(t.number, {
                      x: e?.nativeEvent?.pageX ?? 0,
                      y: e?.nativeEvent?.pageY ?? 0,
                    })
                  }
                  style={[styles.mobileTable, {
                    width: w, height: h,
                    backgroundColor: '#FFFFFF',
                    borderColor: border,
                    transform: [{ translateX: left }, { translateY: top }],
                  }]}
                >
                  <TableSeatRing
                    layout={isKnight ? 'knight' : 'round'}
                    tableNumber={t.number ?? ''}
                    seated={seated}
                    capacity={cap}
                    size={ringSize}
                    width={isKnight ? ringW : undefined}
                    height={isKnight ? ringH : undefined}
                    orientation={t.orientation ?? 'column'}
                    showRatio
                    filledColor={filledColor}
                    numberColor={isReserve ? '#B45309' : '#06173d'}
                  />
                  {tableName ? (
                    <Text
                      style={[styles.mobileTableName, isKnight && styles.mobileTableNameKnight]}
                      numberOfLines={1}
                    >
                      {tableName}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}

            {/* Labels */}
            {(sketch.labels || []).map((l: any) => {
              const left = (Number(l.gridX) - contentRect.originX) * MAP_CELL;
              const top  = (Number(l.gridY) - contentRect.originY) * MAP_CELL;
              return (
                <View key={String(l.id)} style={[styles.mobileLabelWrap, { transform: [{ translateX: left }, { translateY: top }] }]}>
                  <Text style={styles.mobileLabelText} numberOfLines={1}>{String(l.text ?? '')}</Text>
                </View>
              );
            })}

          </Reanimated.View>
          </Reanimated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[100] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  seatingHeaderShell: {
    backgroundColor: '#152949',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    zIndex: 20,
    shadowColor: '#152949',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  seatingHeaderInner: {
    position: 'relative',
    zIndex: 2,
  },
  headerNavRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerSideSpacer: {
    width: 42,
    height: 42,
  },
  eventSwitcherInHeader: {
    flex: 1,
    alignItems: 'center',
  },
  mapFrame: {
    flex: 1,
    backgroundColor: colors.white,
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 14,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  statBox: { alignItems: 'center' }, // legacy (not used)
  statButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.white,
    minWidth: 128,
    maxWidth: 180,
    flexGrow: 1,
    flexBasis: 140,
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  statShineBlob: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 110,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textLight,
    marginTop: 2,
  },
  dragModePill: {
    position: 'absolute',
    top: 8,
    left: 16,
    zIndex: 20,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragModeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  canvasScroll: { flex: 1 },
  mobileMapRoot: {
    flex: 1,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    direction: 'ltr',
  },
  mobileCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    direction: 'ltr',
    overflow: 'hidden',
  },
  mobileTable: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  mobileTableName: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 2,
    color: '#06173d',
  },
  mobileTableNameKnight: {
    marginTop: 1,
    fontSize: 9,
    paddingHorizontal: 1,
  },
  mobileZone: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    borderColor: 'rgba(148,163,184,0.65)',
    backgroundColor: 'rgba(43,140,238,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  mobileZoneText: { fontWeight: '900', color: 'rgba(17,24,39,0.65)' },
  mobileLabelWrap: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(17,24,39,0.02)',
  },
  mobileLabelText: { fontWeight: '800', color: 'rgba(17,24,39,0.62)' },
  canvas: { 
    backgroundColor: colors.white, 
    overflow: 'hidden', 
  },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.gray[200] },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.gray[200] },
  table: { 
    position: 'absolute', 
    alignItems: 'center', 
    justifyContent: 'center', 
    elevation: 4, 
    backgroundColor: colors.gray[50], 
    borderRadius: 8, 
    shadowColor: colors.richBlack, 
    shadowOpacity: 0.08, 
    shadowRadius: 4, 
    shadowOffset: { width: 0, height: 2 }, 
    borderWidth: 1, 
    borderColor: colors.gray[300] 
  },
  tableSquare: { width: 92, height: 92 },
  // Knight table: vertical rectangle ("מלבן לאורך")
  tableRect: { width: 74, height: 150 },
  tableSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  tableName: { fontWeight: 'bold', fontSize: 18, color: colors.text },
  tableCustomName: {
    fontSize: 12,
    color: colors.gold,
    marginTop: 2,
  },
  tableCap: { fontSize: 15, color: colors.textLight },
  tableFullStyle: {
    backgroundColor: 'rgba(16, 185, 129, 0.24)',
    borderColor: 'rgba(16, 185, 129, 0.70)',
    shadowColor: 'rgba(16, 185, 129, 1)',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tableOverFullStyle: {
    backgroundColor: 'rgba(5, 150, 105, 0.34)',
    borderColor: 'rgba(5, 150, 105, 0.86)',
    shadowColor: 'rgba(5, 150, 105, 1)',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
  },
  tableFullText: {
    color: 'rgba(6, 95, 70, 1)',
    fontWeight: '800',
  },
  tableOverFullText: {
    color: 'rgba(6, 78, 59, 1)',
    fontWeight: '900',
  },
  tableFullCapText: {
    color: 'rgba(6, 95, 70, 1)',
    fontWeight: '800',
  },
  tableOverFullCapText: {
    color: 'rgba(6, 78, 59, 1)',
    fontWeight: '900',
  },

  textArea: { 
    position: 'absolute', 
    backgroundColor: colors.gray[100], 
    borderRadius: 8, 
    padding: 8, 
    borderWidth: 1, 
    borderColor: colors.gray[400], 
    minWidth: 60, 
    minHeight: 30, 
    alignItems: 'center', 
    justifyContent: 'center', 
    elevation: 2 
  },
  textAreaText: { fontSize: 16, color: colors.text },

  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  landscapeMapPane: {
    flex: 1,
    minWidth: 0,
    // Map should be flush to the left edge.
    marginLeft: 0,
    paddingLeft: 0,
  },
  landscapeGuestPane: {
    width: 360,
    maxWidth: '44%',
    minWidth: 300,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  guestPanelHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  guestPanelTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestPanelSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestPanelSearchWrap: {
    marginTop: 10,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(248,250,252,0.96)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
  },
  guestPanelSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestPanelFilterRow: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  guestFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  guestFilterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  guestFilterText: { fontSize: 11, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  guestFilterTextActive: { color: colors.white },
  guestPanelList: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    gap: 10,
  },
  guestRow: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  guestRowTop: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  guestName: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    alignSelf: 'stretch',
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    lineHeight: 17,
    flexShrink: 1,
  },
  guestNameEditMode: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  guestPplPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  guestPplText: { fontSize: 11, fontWeight: '900', color: colors.gray[800], textAlign: 'right' },
  guestRowMeta: { marginTop: 8, flexDirection: ROW_DIR, alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  guestMetaText: { fontSize: 11, fontWeight: '800', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  guestMetaDot: { fontSize: 11, fontWeight: '900', color: colors.gray[500] },
  guestEmpty: { paddingVertical: 28, alignItems: 'center', justifyContent: 'center', gap: 6 },
  guestEmptyTitle: { fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'center', writingDirection: 'rtl' },
  guestEmptySub: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'center', writingDirection: 'rtl' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '75%',
    width: '100%',
  },
  modalSheetContent: {
    flex: 1,
    padding: 20,
    paddingTop: 22,
    backgroundColor: 'transparent',
  },
  tablePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 9999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  tablePanelCloseBtn: {
    position: 'absolute',
    left: 14,
    top: 14,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'right',
    color: colors.text,
    writingDirection: 'rtl',
  },
  modalHero: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
    paddingHorizontal: 2,
    paddingStart: 54,
  },
  modalHeroTitleWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 4,
  },
  modalHeroSubtitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '600',
    color: colors.textLight,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalHeroBadge: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(43,140,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(43,140,238,0.14)',
  },
  modalHeroBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filterContainer: {
    marginBottom: 16,
    alignItems: ALIGN_RIGHT,
    width: '100%',
  },
  searchInput: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    textAlign: 'right',
    marginBottom: 12,
    width: '100%',
    writingDirection: 'rtl',
  },
  categoryScrollView: {
    width: '100%',
  },
  categoryContainer: {
    flexDirection: ROW_DIR,
    justifyContent: 'flex-start',
    paddingEnd: 4,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
    textAlign: 'center',
  },
  categoryButtonTextActive: {
    color: colors.white,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    textAlign: 'right',
    borderRightWidth: 4,
    borderRightColor: colors.primary,
    writingDirection: 'rtl',
  },
  sectionHeaderSmall: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    marginVertical: 4,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '95%',
    alignSelf: ALIGN_RIGHT,
  },
  guestMainInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  guestNameLarge: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'right',
    color: colors.text,
    flex: 1,
    writingDirection: 'rtl',
  },
  tableNumber: {
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    textAlign: 'center',
    minWidth: 80,
    marginLeft: 12,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: colors.primary,
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  unseatedGuestList: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  selectableGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    marginBottom: 6,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
    overflow: 'hidden',
  },
  selectableGuestItemSelected: {
    backgroundColor: 'rgba(43,140,238,0.06)',
    borderColor: 'rgba(43,140,238,0.30)',
  },
  selectableGuestItemDisabled: {
    opacity: 0.55,
  },
  selectableGuestMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    alignItems: ALIGN_RIGHT,
  },
  selectableGuestTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  selectableGuestName: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
    lineHeight: 18,
  },
  selectableGuestCheckboxWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  selectableGuestMetaRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  guestCardTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
  },
  guestStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 92,
  },
  guestStatusText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  seatedGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    marginBottom: 6,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
  },
  seatedGuestRow: {
    flexDirection: ROW_DIR,
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  seatedGuestListContent: {
    paddingBottom: 12,
    alignItems: 'stretch',
  },
  seatedGuestMain: {
    flex: 1,
    minWidth: 0,
    alignItems: ALIGN_RIGHT,
  },
  seatedGuestTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  seatedGuestMetaRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 8,
  },
  seatedGuestCheckboxWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  seatedHeaderRow: {
    flexDirection: ROW_DIR,
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 6,
  },
  seatedEditButton: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    gap: 6,
  },
  seatedEditButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  seatedGuestItemEditMode: {
    backgroundColor: 'rgba(43,140,238,0.04)',
    borderColor: 'rgba(43,140,238,0.16)',
  },
  seatedGuestItemSelected: {
    backgroundColor: 'rgba(43,140,238,0.10)',
    borderColor: 'rgba(43,140,238,0.34)',
  },
  bulkRemoveButton: {
    flex: 1,
    backgroundColor: colors.error,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  bulkRemoveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  bulkActionsRow: {
    marginTop: 16,
    marginHorizontal: 4,
    marginBottom: 12,
    flexDirection: ROW_DIR,
    gap: 10,
  },
  bulkMoveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  bulkMoveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  confirmBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  confirmBtnTextPrimary: {
    color: colors.white,
  },
  moveCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: colors.white,
    shadowColor: colors.richBlack,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    direction: 'rtl',
  },
  moveCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 0,
    width: '100%',
  },
  moveCardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(43,140,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(43,140,238,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  moveCardSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  moveDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.07)',
    marginVertical: 14,
  },
  movePickerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'left',
    writingDirection: 'rtl',
    letterSpacing: 0.4,
    marginBottom: 8,
    textTransform: 'uppercase',
    alignSelf: 'stretch',
    width: '100%',
  },
  moveListWrap: {
    maxHeight: 320,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(248,250,252,0.96)',
    overflow: 'hidden',
  },
  moveListContent: {
    padding: 8,
    gap: 8,
  },
  moveTableOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    backgroundColor: colors.white,
  },
  moveTableOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(43,140,238,0.06)',
  },
  moveRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moveRadioCircleActive: {
    borderColor: colors.primary,
  },
  moveRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  moveTableTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  moveTableTitleActive: {
    color: colors.primary,
  },
  moveOccRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  moveTableSub: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'left',
  },
  moveTableAfter: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'left',
  },
  moveBarTrack: {
    marginTop: 6,
    height: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  moveBarFill: {
    height: '100%',
    borderRadius: 99,
  },
  moveActionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  moveBtnCancel: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  moveBtnCancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    writingDirection: 'rtl',
  },
  moveBtnConfirm: {
    flex: 2,
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    gap: 6,
  },
  moveBtnConfirmDisabled: {
    opacity: 0.45,
  },
  moveBtnConfirmText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.white,
    writingDirection: 'rtl',
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 16,
  },
  finalAddButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 4,
    marginBottom: 20,
  },
  finalAddButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: colors.textLight,
  },
  disabledButton: {
    backgroundColor: colors.gray[400],
  },
  toggleContainer: {
    flexDirection: ROW_DIR,
    backgroundColor: colors.gray[200],
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.white,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  toggleButtonTextActive: {
    color: colors.primary,
  },
  closeModalButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  tableNameContainer: {
    flexDirection: 'column',
    marginBottom: 18,
  },
  tableNameRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  tableNameInput: {
    backgroundColor: 'rgba(248,250,252,0.96)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    flex: 1,
  },
  saveNameButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  deleteTableButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.error,
  },
  tableButtonsContainer: {
    flexDirection: 'row',
    justifyContent: ALIGN_RIGHT,
    gap: 10,
    marginTop: 10,
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  peopleCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.richBlack,
    marginLeft: 4,
  },
  reserveTableStyle: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // שחור שקוף
    borderColor: colors.gray[800],
  },
  reserveTableText: {
    color: colors.white,
    fontWeight: '700',
  },
  reserveTableCapText: {
    color: colors.gray[300],
    fontWeight: '600',
  },

  confirmOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 20000,
    elevation: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    direction: 'rtl',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'left',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    width: '100%',
  },
  confirmMessage: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'left',
    writingDirection: 'rtl',
    lineHeight: 20,
    alignSelf: 'stretch',
    width: '100%',
  },
  confirmButtonsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  confirmBtnCancel: {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.10)',
  },
  confirmBtnDanger: {
    backgroundColor: colors.error,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  confirmBtnDisabled: {
    opacity: 0.65,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    writingDirection: 'rtl',
  },
  confirmBtnTextDanger: {
    color: colors.white,
  },

  successOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 20000,
    elevation: 20,
  },
  successCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
    shadowColor: 'rgba(6,95,70,1)',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    direction: 'rtl',
  },
  successHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    width: '100%',
  },
  successTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  successIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: 'rgba(6,95,70,1)',
    textAlign: 'left',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
    width: '100%',
  },
  successMessage: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'left',
    writingDirection: 'rtl',
    lineHeight: 20,
    alignSelf: 'stretch',
    width: '100%',
  },
  successBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.32)',
  },
  successBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: 'rgba(6,95,70,1)',
    writingDirection: 'rtl',
  },
}); 