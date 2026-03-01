import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, ActivityIndicator, Modal, TextInput, FlatList, useWindowDimensions, Alert, PanResponder, Platform, StatusBar } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { cancelAnimation, runOnUI, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '@/store/layoutStore';
import { Table } from '@/types';
import { Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventSwitcher } from '@/components/EventSwitcher';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { CELL_SIZE, DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/_types';

export default function BrideGroomSeating() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const { userData } = useUserStore();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();
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
  
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPositionsReady, setIsPositionsReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [textAreas, setTextAreas] = useState<any[]>([]);
  const [webSketch, setWebSketch] = useState<null | { gridCols: number; gridRows: number; tables: any[]; zones: any[]; labels: any[] }>(null);
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
  const [successVisible, setSuccessVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('הצלחה');
  const [successMessage, setSuccessMessage] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGuestSeatable = (g: any) => {
    const status = String(g?.status ?? '').trim();
    // Allow seating for all statuses except explicit "not coming".
    return status !== 'לא מגיע';
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
    };
  }, []);

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
    if (selectedGuestsToAdd.size === 0) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const tableId = selectedTableForModal?.id;

    if (!tableId) return; // Ensure tableId is available

    // חישוב סכום האנשים שמתווספים
    const guestsToAdd = guests.filter(g => guestIds.includes(g.id));
    const totalPeopleToAdd = guestsToAdd.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

    // 1. עדכון האורחים
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: tableId })
      .in('id', guestIds);
    
    if (guestUpdateError) {
      console.error("Error updating guests:", guestUpdateError);
      return;
    }
    
    // 2. עדכון מספר המוזמנים בשולחן - חישוב מחדש של כל האנשים בשולחן
    const currentGuestsAtTable = guests.filter(g => g.table_id === tableId);
    const currentTotalPeople = currentGuestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
    const newTotalPeople = currentTotalPeople + totalPeopleToAdd;
    
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: newTotalPeople })
      .eq('id', tableId);
      
    if (tableUpdateError) {
      console.error("Error updating table count:", tableUpdateError);
      return;
    }

    // Refresh data
    await fetchGuests();
    await fetchTables();
    
    // Keep table modal open: go back to "seated" tab and clear selection.
    setTableModalView('seated');
    setSelectedGuestsToAdd(new Set());

    const tableNum = selectedTableForModal?.number ?? '';
    const peopleText = totalPeopleToAdd > 0 ? ` (${totalPeopleToAdd} אנשים)` : '';

    // Update the seated list immediately (so the UI reflects the change right away).
    setSeatedGuestsForTable((prev) => {
      const existingIds = new Set((prev || []).map((g: any) => String(g?.id)));
      const added = guestsToAdd.map((g: any) => ({ ...g, table_id: tableId }));
      return [...prev, ...added.filter((g: any) => !existingIds.has(String(g?.id)))];
    });

    showSuccess('נוסף לשולחן', `נוספו ${guestIds.length} אורחים${peopleText} לשולחן ${tableNum}`);
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
  }, []);

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

  const handleSaveTableName = async () => {
    if (!selectedTableForModal) {
      return;
    }
    
    const currentName = selectedTableForModal.name || '';
    if (tableName.trim() === currentName.trim()) {
      return; // No change, do nothing
    }
    
    const { error } = await supabase
      .from('tables')
      .update({ name: tableName.trim() || null })
      .eq('id', selectedTableForModal.id);
  
    if (error) {
      console.error('Error updating table name:', error);
    } else {
      // Update local state to reflect the change immediately
      setTables(currentTables => 
        currentTables.map(t => 
          t.id === selectedTableForModal.id ? { ...t, name: tableName.trim() || null } : t
        )
      );
      // Update the selected table for modal as well
      setSelectedTableForModal(prev => prev ? { ...prev, name: tableName.trim() || null } : null);
    }
  };

  const { setTabBarVisible } = useLayoutStore();
  // Map-only screen: hide tab bar while focused.
  // Important: tab screens often stay mounted; use focus/blur rather than mount/unmount.
  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  // If user rotates while in drag mode, exit drag mode.
  useEffect(() => {
    if (isLandscape && dragMode) setDragMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLandscape]);

  const handleTablePress = (table: Table) => {
    setSelectedTableForModal(table);
    setTableName(table.name || '');
    const guestsForTable = guests.filter(g => g.table_id === table.id);
    setSeatedGuestsForTable(guestsForTable);
    
    // Reset filters and view
    setTableModalView('seated');
    setSearchQueryTable('');
    const unseated = guests.filter((g) => isGuestSeatable(g) && !g.table_id);
    const categories = ['הכל', ...Array.from(new Set(unseated.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setCategoriesForTable(categories);
    setCategoryFilterTable('הכל');

    setTableModalVisible(true);
    setTabBarVisible(false);
    clearSeatedEditState();
  };

  const closeModalAndShowTabBar = async () => {
    await handleSaveTableName();
    setTableModalVisible(false);
    setTabBarVisible(false);
    clearSeatedEditState();
    setSuccessVisible(false);
    setSuccessMessage('');
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
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

  useEffect(() => {
    if (resolvedEventId) {
      setLoading(true);
      Promise.all([
        fetchTables(),
        fetchTextAreas(),
        fetchGuests(),
      ]).finally(() => setLoading(false));
    }
  }, [resolvedEventId]);

  useFocusEffect(
    useCallback(() => {
      // Fetch data every time the screen comes into focus
      if (resolvedEventId) {
        setLoading(true);
        Promise.all([
          fetchTables(),
          fetchTextAreas(),
          fetchGuests(),
        ]).finally(() => setLoading(false));
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
  const unseatedGuestsList = guests.filter((g) => isGuestSeatable(g) && !g.table_id);

  // (dashboardStats removed: this screen is map-only)

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
          getTableBaseColor={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
            const full = cap > 0 && seated >= cap;
            const over = cap > 0 && seated > cap;
            if (over) return '#059669';
            if (full) return '#10B981';
            return t?.type === 'reserve' ? '#F59E0B' : '#06173d';
          }}
          getTableBackgroundAlpha={(t: any) => {
            const num = Number(t?.number);
            const cap = Number(t?.seats ?? 0) || 0;
            const seated = Number.isFinite(num) ? (seatedByNumber.get(num) ?? 0) : 0;
            const full = cap > 0 && seated >= cap;
            const over = cap > 0 && seated > cap;
            if (over) return 0.34;
            if (full) return 0.24;
            return t?.type === 'reserve' ? 0.18 : 0.82;
          }}
          getTableTooltip={(t: any) => {
            const num = t?.number;
            if (!num) return null;
            const seated = seatedByNumber.get(Number(num)) ?? 0;
            const cap = Number(t?.seats ?? 0) || 0;
            return cap ? `יושבים בשולחן: ${seated} / ${cap}` : `יושבים בשולחן: ${seated}`;
          }}
          getTableSubLabel={(t: any) => {
            const num = t?.number;
            if (!num) return null;
            const seated = seatedByNumber.get(Number(num)) ?? 0;
            const cap = Number(t?.seats ?? 0) || 0;
            return cap ? `${seated} / ${cap}` : String(seated);
          }}
          onPressTableNumber={(num) => {
            if (!num) return;
            const t = tables.find((x) => x.number === num);
            if (t) handleTablePress(t);
          }}
        />
      ) : (
        <MobileSeatingMap
          sketch={(webSketchWithNames ?? webSketch) as any}
          onPressTableNumber={(num) => {
            if (!num) return;
            const t = tables.find((x) => x.number === num);
            if (t) handleTablePress(t);
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
            return cap ? `${seated} / ${cap}` : String(seated);
          }}
        />
      )}
    </View>
  ) : (
    <ScrollView
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
                onPress={() => {
                  // Tap opens modal only when not in drag mode
                  if (draggingTableIdRef.current === table.id) return;
                  if (!dragMode) {
                    handleTablePress(table);
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
                  {totalPeopleSeated} / {table.capacity}
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
    </ScrollView>
  );

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }
  
  if (!resolvedEventId) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>אין אירוע זמין</Text>
      </View>
    );
  }

  // (landscape hooks already computed above)

  const topBarTop = Math.max(insets.top || 0, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 10;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Full-screen map frame */}
      <View style={styles.mapFrame}>{mapNode}</View>

      {/* Floating top bar: back + (optional) event switcher */}
      <View
        pointerEvents="box-none"
        style={[
          styles.floatingTopBar,
          {
            top: topBarTop,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={styles.backFab}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <View style={styles.eventSwitcherWrap}>
          <EventSwitcher
            userId={userData?.id}
            selectedEventId={resolvedEventId}
            onSelectEventId={handleSelectEventId}
            label="אירוע פעיל"
          />
        </View>
      </View>

      {dragMode && (
        <TouchableOpacity
          style={[styles.dragModePill, { top: topBarTop + 6 }]}
          onPress={() => setDragMode(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.dragModeText}>סיים גרירה</Text>
        </TouchableOpacity>
      )}

      {/* Table Guests Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={tableModalVisible}
        onRequestClose={() => {
          if (removeConfirmVisible) {
            if (removeConfirmBusy) return;
            setRemoveConfirmVisible(false);
            setRemoveConfirmIds([]);
            return;
          }
          closeModalAndShowTabBar();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModalButton} onPress={closeModalAndShowTabBar}>
              <Ionicons name="close-circle" size={30} color={colors.gray[200]} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              שולחן {selectedTableForModal?.number}
              {selectedTableForModal?.name && ` - ${selectedTableForModal.name}`}
            </Text>
            
            <View style={styles.tableNameContainer}>
              <View style={styles.tableNameRow}>
                <TouchableOpacity style={styles.saveNameButton} onPress={handleSaveTableName}>
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.tableNameInput}
                  value={tableName}
                  onChangeText={setTableName}
                  placeholder="הוסף שם לשולחן (אופציונלי)"
                  placeholderTextColor={colors.gray[500]}
                  onBlur={handleSaveTableName} // Save when input loses focus
                  onSubmitEditing={handleSaveTableName} // Save when pressing Enter/Done
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
                  setTableModalView('add');
                  clearSeatedEditState();
                }}
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
                      style={{ marginLeft: 6 }}
                    />
                    <Text style={styles.seatedEditButtonText}>{seatedEditMode ? 'ביטול' : 'עריכה'}</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={seatedGuestsForTable}
                  keyExtractor={(item) => String(item.id)}
                  numColumns={2}
                  columnWrapperStyle={{ justifyContent: 'space-between' }}
                  renderItem={({ item }) => {
                    const id = String(item.id);
                    const selected = selectedSeatedGuestsToRemove.has(id);
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <Text style={[styles.guestName, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={[styles.peopleCountBadge, { marginLeft: 4 }]}>
                            <Ionicons name="person" size={10} color={colors.richBlack} />
                            <Text style={[styles.peopleCountText, { fontSize: 10 }]}>{item.numberOfPeople || 1}</Text>
                          </View>
                        </View>

                        {seatedEditMode ? (
                          <Ionicons
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={selected ? colors.primary : colors.gray[300]}
                            style={{ marginLeft: 6 }}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  }}
                  nestedScrollEnabled
                  style={{ flex: 1, marginTop: 12 }}
                  ListEmptyComponent={<Text style={styles.emptyListText}>אין אורחים יושבים בשולחן זה</Text>}
                />

                {seatedEditMode ? (
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
                        ? `הסר ${selectedSeatedGuestsToRemove.size} אורחים מהשולחן`
                        : 'בחר אורחים להסרה'}
                    </Text>
                  </TouchableOpacity>
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
                          {categoriesForTable.map(category => (
                              <TouchableOpacity
                                  key={category}
                                  style={[
                                      styles.categoryButton,
                                      categoryFilterTable === category && styles.categoryButtonActive
                                  ]}
                                  onPress={() => setCategoryFilterTable(category)}
                              >
                                  <Text style={[
                                      styles.categoryButtonText,
                                      categoryFilterTable === category && styles.categoryButtonTextActive
                                  ]}>{category}</Text>
          </TouchableOpacity>
        ))}
                      </View>
                  </ScrollView>
                </View>

                <FlatList
                  data={unseatedGuestsList.filter(g => {
                    const categoryMatch = categoryFilterTable === 'הכל' || (g.guest_categories?.name || 'ללא קטגוריה') === categoryFilterTable;
                    const searchMatch = g.name.toLowerCase().includes(searchQueryTable.toLowerCase());
                    return categoryMatch && searchMatch;
                  })}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={2}
                  columnWrapperStyle={{ justifyContent: 'space-between' }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.selectableGuestItem}
                      onPress={() => handleToggleGuestSelection(item.id)}
                    >
                      <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                        <Text style={[styles.guestName, {fontSize: 14, flex: 1}]} numberOfLines={1}>{item.name}</Text>
                        <View style={[styles.peopleCountBadge, {marginLeft: 4}]}>
                            <Ionicons name="person" size={10} color={colors.richBlack} />
                            <Text style={[styles.peopleCountText, {fontSize: 10}]}>{item.numberOfPeople || 1}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={selectedGuestsToAdd.has(item.id) ? "checkbox" : "square-outline"}
                        size={20}
                        color={selectedGuestsToAdd.has(item.id) ? colors.primary : colors.gray[300]}
                        style={{marginLeft: 4}}
                      />
                    </TouchableOpacity>
                  )}
                  nestedScrollEnabled
                  style={{ flex: 1 }}
                  ListEmptyComponent={<Text style={styles.emptyListText}>כל האורחים שניתן להושיב כבר הושבו</Text>}
                />
                
                <TouchableOpacity
                  style={[styles.finalAddButton, selectedGuestsToAdd.size === 0 && styles.disabledButton]}
                  onPress={handleAddGuestsToTable}
                  disabled={selectedGuestsToAdd.size === 0}
                >
                  <Text style={styles.finalAddButtonText}>
                    {selectedGuestsToAdd.size > 0 ? `הוסף ${selectedGuestsToAdd.size} אורחים` : 'בחר אורחים להוספה'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            
          </View>

          {/* RTL Confirm Remove Guests (rendered INSIDE the table modal to avoid stacked Modals bugs) */}
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

          {/* Success (styled, RTL) - keep table modal open */}
          {successVisible ? (
            <View style={styles.successOverlay}>
              <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setSuccessVisible(false)} />
              <View style={styles.successCard}>
                <View style={styles.successHeaderRow}>
                  <View style={styles.successIconWrap}>
                    <Ionicons name="checkmark" size={18} color="rgba(6,95,70,1)" />
                  </View>
                  <Text style={styles.successTitle}>{successTitle}</Text>
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
  );
}

function clampNumber(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

// Larger cell size for the map-only view so table names are readable.
const MAP_CELL = 36;

function MobileSeatingMap({
  sketch,
  onPressTableNumber,
  getTableSubLabel,
  getTableOccupancy,
}: {
  sketch: { gridCols: number; gridRows: number; tables: any[]; zones: any[]; labels: any[] };
  onPressTableNumber?: (num: number | undefined) => void;
  getTableSubLabel?: (t: any) => string | null;
  getTableOccupancy?: (t: any) => { seated: number; capacity: number } | null;
}) {
  // useWindowDimensions gives us rotation events for free.
  const { width: winW, height: winH } = useWindowDimensions();

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
  const vW = useSharedValue(winW);
  const vH = useSharedValue(winH);
  const cW = useSharedValue(baseW);
  const cH = useSharedValue(baseH);

  useEffect(() => { vW.value = winW; vH.value = winH; }, [winW, winH, vW, vH]);
  useEffect(() => { cW.value = baseW; cH.value = baseH; }, [baseW, baseH, cW, cH]);

  // ── Fit: scale to fill viewport, center (tx=ty=0) ────────────────────────
  const doFit = useCallback(() => {
    const vw = winW, vh = winH, bw = baseW, bh = baseH;
    if (!vw || !vh || !bw || !bh) return;
    // Sync shared values immediately so worklets see up-to-date viewport
    vW.value = vw; vH.value = vh;
    cW.value = bw; cH.value = bh;
    const s = clampNumber(Math.min(vw / bw, vh / bh) * 1.12, 0.1, 10);
    cancelAnimation(scale); cancelAnimation(tx); cancelAnimation(ty);
    scale.value = withTiming(s, { duration: 260 });
    tx.value    = withTiming(0, { duration: 260 });
    ty.value    = withTiming(0, { duration: 260 });
    sv_s.value  = s; sv_tx.value = 0; sv_ty.value = 0;
  }, [winW, winH, baseW, baseH, scale, tx, ty, sv_s, sv_tx, sv_ty, vW, vH, cW, cH]);

  // Fit on rotation or initial content load.
  const didFitRef = useRef(false);
  useEffect(() => { doFit(); }, [winW, winH]);
  useEffect(() => { if (!didFitRef.current) { didFitRef.current = true; doFit(); } }, [baseW, baseH]);

  // ── Clamp: keep map reachable; called on UI thread after each gesture ─────
  const doClamp = () => {
    'worklet';
    const s = scale.value;
    const bw = cW.value, bh = cH.value;
    const vw = vW.value, vh = vH.value;
    const pad = 40; // px the user can drag "past" the edge
    // Max pan so that the edge of the scaled content is still 'pad' px inside viewport
    const mxRaw = (bw * s - vw) / 2;
    const myRaw = (bh * s - vh) / 2;
    const mx = mxRaw > 0 ? mxRaw + pad : 0;
    const my = myRaw > 0 ? myRaw + pad : 0;
    tx.value = clampNumber(tx.value, -mx, mx);
    ty.value = clampNumber(ty.value, -my, my);
    sv_tx.value = tx.value;
    sv_ty.value = ty.value;
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
    .onEnd(() => { doClamp(); });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .minDistance(0)
    .onBegin(() => {
      cancelAnimation(tx); cancelAnimation(ty);
      sv_tx.value = tx.value;
      sv_ty.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = sv_tx.value + e.translationX;
      ty.value = sv_ty.value + e.translationY;
    })
    .onEnd(() => { doClamp(); });

  const gesture = Gesture.Simultaneous(pan, pinch);

  // ── Animated style ────────────────────────────────────────────────────────
  // translateX/Y then scale: translate moves center, scale expands around it.
  // This keeps the math: tx=0 → centered, |tx| ≤ (bw*s-vw)/2+pad.
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ── Zoom buttons ─────────────────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    const minS = clampNumber(Math.min(winW / Math.max(1, baseW), winH / Math.max(1, baseH)) * 0.4, 0.08, 1);
    const ns = clampNumber(scale.value * factor, minS, 10);
    cancelAnimation(scale);
    scale.value = withTiming(ns, { duration: 200 });
    sv_s.value = ns;
    runOnUI(doClamp)();
  }, [winW, winH, baseW, baseH, scale, sv_s, doClamp]);

  return (
    <View style={styles.mobileMapRoot}>
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
          <Reanimated.View style={[{ width: baseW, height: baseH }, animStyle]}>

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
              const isFull = cap > 0 && seated >= cap;
              const isOver = cap > 0 && seated > cap;

              const greenFull = 'rgba(16, 185, 129, 0.24)'; // emerald-500
              const greenOver = 'rgba(5, 150, 105, 0.34)';  // emerald-600 (darker)
              const greenBorderFull = 'rgba(16, 185, 129, 0.70)';
              const greenBorderOver = 'rgba(5, 150, 105, 0.86)';

              const base = isReserve ? '#F59E0B' : '#06173d';
              const bg = isOver ? greenOver : isFull ? greenFull : isReserve ? `${base}22` : 'rgba(6, 23, 61, 0.76)';
              const border = isOver ? greenBorderOver : isFull ? greenBorderFull : isReserve ? `${base}55` : 'rgba(6, 23, 61, 1)';
              const textColor = isOver || isFull ? 'rgba(6, 95, 70, 1)' : isReserve ? base : '#FFFFFF';
              const w = sz.w * MAP_CELL;
              const h = sz.h * MAP_CELL;
              const tableName = String(t?.name ?? '').trim();
              const sub  = getTableSubLabel?.(t) ?? null;
              return (
                <Pressable
                  key={String(t.id)}
                  onPress={() => onPressTableNumber?.(t.number)}
                  style={[styles.mobileTable, {
                    width: w, height: h,
                    backgroundColor: bg, borderColor: border,
                    transform: [{ translateX: left }, { translateY: top }],
                  }]}
                >
                  <Text style={[styles.mobileTableNum, { color: textColor }]}>{t.number ?? ''}</Text>
                  {tableName ? (
                    <Text
                      style={[
                        styles.mobileTableName,
                        { color: isOver || isFull ? textColor : isReserve ? base : 'rgba(255,255,255,0.92)' },
                      ]}
                      numberOfLines={2}
                    >
                      {tableName}
                    </Text>
                  ) : null}
                  {sub ? (
                    <Text
                      style={[
                        styles.mobileTableSub,
                        isOver || isFull ? { color: textColor } : !isReserve ? { color: 'rgba(255,255,255,0.92)' } : null,
                      ]}
                    >
                      {sub}
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
        </View>
      </GestureDetector>

      {/* +/− zoom buttons */}
      <View style={styles.mobileMapControls}>
        <TouchableOpacity style={styles.mobileMapBtn} onPress={() => zoomBy(1.3)}>
          <Ionicons name="add" size={18} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mobileMapBtn} onPress={() => zoomBy(1 / 1.3)}>
          <Ionicons name="remove" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[100] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapFrame: {
    flex: 1,
    backgroundColor: colors.white,
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  floatingTopBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    zIndex: 30,
  },
  backFab: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  eventSwitcherWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '78%',
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
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  mobileTableNum: { fontSize: 20, fontWeight: '900' },
  mobileTableName: { marginTop: 3, fontSize: 13, fontWeight: '900', textAlign: 'center', paddingHorizontal: 4 },
  mobileTableSub: { marginTop: 3, fontSize: 13, fontWeight: '900', color: 'rgba(17,24,39,0.78)' },
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
  mobileMapControls: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 16,
    padding: 8,
  },
  mobileMapBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
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
    color: colors.textLight,
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
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
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
  guestRowTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  guestName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  guestPplPill: {
    flexDirection: 'row-reverse',
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
  guestRowMeta: { marginTop: 8, flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
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
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: colors.text,
    writingDirection: 'rtl',
  },
  filterContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
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
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    paddingRight: 4,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
    marginLeft: 8,
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
    alignSelf: 'flex-end',
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
  },
  seatedGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.gray[200],
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
  },
  seatedHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 6,
  },
  seatedEditButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
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
    backgroundColor: colors.error,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 4,
    marginBottom: 12,
  },
  bulkRemoveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
    flexDirection: 'row-reverse',
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
    marginBottom: 20,
  },
  tableNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableNameInput: {
    backgroundColor: colors.gray[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    borderWidth: 1,
    borderColor: colors.gray[300],
    flex: 1,
  },
  saveNameButton: {
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: 8,
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
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[300],
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 10,
  },
  peopleCountText: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmMessage: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  confirmButtonsRow: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    gap: 10,
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
  },
  successHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
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
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  successMessage: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
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