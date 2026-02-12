import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, ActivityIndicator, Modal, SectionList, TextInput, FlatList, Dimensions, Alert, PanResponder, Platform, StatusBar } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '@/store/layoutStore';
import { Table } from '@/types';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventSwitcher } from '@/components/EventSwitcher';
import { SeatingGridReadonly } from '../seating/web/SeatingGridReadonly';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, tableCellSize, type Orientation, type TableType } from '../seating/web/types';

const { width, height } = Dimensions.get('window');

export default function BrideGroomSeating() {
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
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<any[]>([]);
  const [modalTitle, setModalTitle] = useState('');
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
  
  // State for filtering and searching
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('הכל');
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const [searchQueryTable, setSearchQueryTable] = useState('');
  const [categoryFilterTable, setCategoryFilterTable] = useState('הכל');
  const [categoriesForTable, setCategoriesForTable] = useState<string[]>([]);

  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<Table | null>(null);
  const [seatedGuestsForTable, setSeatedGuestsForTable] = useState<any[]>([]);
  const [selectedGuestsToAdd, setSelectedGuestsToAdd] = useState<Set<string>>(new Set());
  const [tableModalView, setTableModalView] = useState<'seated' | 'add'>('seated');
  const [tableName, setTableName] = useState('');

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
    
    // Close modal and clear selection
    await closeModalAndShowTabBar();
    setSelectedGuestsToAdd(new Set());
  };

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

  const handleTablePress = (table: Table) => {
    setSelectedTableForModal(table);
    setTableName(table.name || '');
    const guestsForTable = guests.filter(g => g.table_id === table.id);
    setSeatedGuestsForTable(guestsForTable);
    
    // Reset filters and view
    setTableModalView('seated');
    setSearchQueryTable('');
    const unseated = guests.filter(g => g.status === 'מגיע' && !g.table_id);
    const categories = ['הכל', ...Array.from(new Set(unseated.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setCategoriesForTable(categories);
    setCategoryFilterTable('הכל');

    setTableModalVisible(true);
    setTabBarVisible(false);
  };

  const closeModalAndShowTabBar = async () => {
    await handleSaveTableName();
    setTableModalVisible(false);
    setTabBarVisible(true);
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
            zoomScale: 0.5,
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
  const maxX = tables.length > 0 ? Math.max(...tables.map(t => t.x ?? 0)) : width;
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

  const fetchTables = async () => {
    if (!resolvedEventId) return;
    
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('event_id', resolvedEventId)
      .order('number');
    
    if (!error) setTables(data || []);
  };

  const fetchGuests = async () => {
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
  };

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
      if (webV2) {
        const cols = typeof webV2?.grid?.cols === 'number' ? Math.round(webV2.grid.cols) : DEFAULT_GRID_COLS;
        const rows = typeof webV2?.grid?.rows === 'number' ? Math.round(webV2.grid.rows) : DEFAULT_GRID_ROWS;
        setWebSketch({
          gridCols: cols,
          gridRows: rows,
          tables: Array.isArray(webV2.tables) ? webV2.tables : [],
          zones: Array.isArray(webV2.zones) ? webV2.zones : [],
          labels: Array.isArray(webV2.labels) ? webV2.labels : [],
        });
        return;
      }

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

        const maxX = mapped.reduce((m: number, t: any) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w), 0);
        const maxY = mapped.reduce((m: number, t: any) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h), 0);
        setWebSketch({
          gridCols: Math.max(DEFAULT_GRID_COLS, maxX + 6),
          gridRows: Math.max(DEFAULT_GRID_ROWS, maxY + 6),
          tables: mapped,
          zones: [],
          labels: [],
        });
        return;
      }

      // Last fallback: derive from public.tables x/y (written by the editor as grid*40)
      if (tables.length) {
        const mapped = tables.map((t) => {
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
            number: (t as any).number ?? undefined,
          };
        });

        const maxX = mapped.reduce((m: number, t: any) => Math.max(m, t.gridX + tableCellSize(t.type, t.seats, t.orientation).w), 0);
        const maxY = mapped.reduce((m: number, t: any) => Math.max(m, t.gridY + tableCellSize(t.type, t.seats, t.orientation).h), 0);
        setWebSketch({
          gridCols: Math.max(DEFAULT_GRID_COLS, maxX + 6),
          gridRows: Math.max(DEFAULT_GRID_ROWS, maxY + 6),
          tables: mapped,
          zones: [],
          labels: [],
        });
        return;
      }

      setWebSketch(null);
    } catch {
      setWebSketch(null);
    }
  };
  
  const openModalWithGuests = (title: string, guestList: any[]) => {
    setModalTitle(title);
    setSearchQuery('');
    setCategoryFilter('הכל');

    const categories = ['הכל', ...Array.from(new Set(guestList.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setAllCategories(categories);
    
    const groupedGuests = guestList.reduce((groups: any, guest: any) => {
      const category = guest.guest_categories?.name || 'ללא קטגוריה';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(guest);
      return groups;
    }, {});
    
    const sectionsData = Object.keys(groupedGuests).map(category => ({
      id: category,
      title: category,
      data: groupedGuests[category],
    }));
    
    setModalData(sectionsData);
    setModalVisible(true);
  };

  const resetZoom = () => {
    if (scrollViewRef.current) {
      // איפוס מיקום
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: true });
      // איפוס זום
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.setNativeProps({
            zoomScale: 0.5,
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

  const confirmedGuestsList = guests.filter(g => g.status === 'מגיע');
  const seatedGuestsList = confirmedGuestsList.filter(g => g.table_id);
  const unseatedGuestsList = confirmedGuestsList.filter(g => !g.table_id);

  const sumPeople = (guestList: any[]) => guestList.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

  const confirmedGuestsCount = sumPeople(confirmedGuestsList);
  const seatedGuestsCount = sumPeople(seatedGuestsList);
  const unseatedGuestsCount = sumPeople(unseatedGuestsList);

  const filteredSections = modalData
    .map(section => {
      if (categoryFilter !== 'הכל' && section.title !== categoryFilter) {
        return null;
      }

      const filteredGuests = section.data.filter((guest: any) =>
        guest.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (filteredGuests.length > 0) {
        return { ...section, data: filteredGuests };
      }
      return null;
    })
    .filter(Boolean) as any[];

  return (
    <View
      style={[
        styles.container,
        {
          // Add top padding so the header/status-bar won't cover the top UI.
          // Use the larger of safe-area and status-bar, then add extra breathing room.
          paddingTop:
            Math.max(insets.top || 0, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 28,
        },
      ]}
    >
      {dragMode && (
        <TouchableOpacity
          style={styles.dragModePill}
          onPress={() => setDragMode(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.dragModeText}>סיים גרירה</Text>
        </TouchableOpacity>
      )}

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <EventSwitcher
          userId={userData?.id}
          selectedEventId={resolvedEventId}
          onSelectEventId={handleSelectEventId}
          label="אירוע פעיל"
        />
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <TouchableOpacity 
          style={styles.statBox}
          onPress={() => openModalWithGuests('טרם הושבו', unseatedGuestsList)}
        >
          <Ionicons name="walk" size={28} color={colors.primary} />
          <Text style={styles.statValue}>{unseatedGuestsCount}</Text>
          <Text style={styles.statLabel}>טרם הושבו</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.statBox}
          onPress={() =>
            router.push({
              pathname: '/(couple)/TablesList',
              params: resolvedEventId ? { eventId: resolvedEventId } : {},
            })
          }
        >
          <Ionicons name="grid" size={28} color={colors.primary} />
          <Text style={styles.statValue}>{tables.length}</Text>
          <Text style={styles.statLabel}>שולחנות</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.statBox}
          onPress={() => openModalWithGuests('הושבו', seatedGuestsList)}
        >
          <Ionicons name="body" size={28} color={colors.primary} />
          <Text style={styles.statValue}>{seatedGuestsCount}</Text>
          <Text style={styles.statLabel}>הושבו</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.statBox}
          onPress={() => openModalWithGuests('אישרו הגעה', confirmedGuestsList)}
        >
          <Ionicons name="checkmark-circle-outline" size={28} color={colors.primary} />
          <Text style={styles.statValue}>{confirmedGuestsCount}</Text>
          <Text style={styles.statLabel}>אישרו הגעה</Text>
        </TouchableOpacity>
      </View>
      
      {/* Guest List Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}>
              <Ionicons name="close-circle" size={30} color={colors.gray[200]} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{modalTitle}</Text>
            
            <View style={styles.filterContainer}>
              <TextInput
                  style={styles.searchInput}
                  placeholder="חיפוש לפי שם..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={colors.gray[500]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
                  <View style={styles.categoryContainer}>
                      {allCategories.map(category => (
                          <TouchableOpacity
                              key={category}
                              style={[
                                  styles.categoryButton,
                                  categoryFilter === category && styles.categoryButtonActive
                              ]}
                              onPress={() => setCategoryFilter(category)}
                          >
                              <Text style={[
                                  styles.categoryButtonText,
                                  categoryFilter === category && styles.categoryButtonTextActive
                              ]}>{category}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>
              </ScrollView>
            </View>

            <SectionList
              sections={filteredSections}
              keyExtractor={(item) => item.id.toString()}
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.sectionHeader}>{title}</Text>
              )}
              renderItem={({ item }) => {
                const tableNumber = item.tables?.number;
                
                return (
                  <View style={styles.guestItem}>
                    <View style={styles.guestMainInfo}>
                      <Text style={styles.guestName}>{item.name}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        {tableNumber && (
                          <Text style={styles.tableNumber}>שולחן {tableNumber}</Text>
                        )}
                        <View style={styles.peopleCountBadge}>
                            <Ionicons name="person" size={12} color={colors.richBlack} />
                            <Text style={styles.peopleCountText}>{item.numberOfPeople || 1}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
            />
          </View>
        </View>
      </Modal>

      {/* Table Guests Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={tableModalVisible}
        onRequestClose={closeModalAndShowTabBar}
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
              <View style={styles.tableButtonsContainer}>
                <TouchableOpacity 
                  style={styles.saveNameButton} 
                  onPress={handleSaveTableName}
                >
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.deleteTableButton} 
                  onPress={handleDeleteTable}
                >
                  <Ionicons name="trash" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, tableModalView === 'seated' && styles.toggleButtonActive]}
                onPress={() => setTableModalView('seated')}
              >
                <Text style={[styles.toggleButtonText, tableModalView === 'seated' && styles.toggleButtonTextActive]}>
                  אורחים ({seatedGuestsForTable.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, tableModalView === 'add' && styles.toggleButtonActive]}
                onPress={() => setTableModalView('add')}
              >
                <Text style={[styles.toggleButtonText, tableModalView === 'add' && styles.toggleButtonTextActive]}>
                  הוספת אורחים
                </Text>
              </TouchableOpacity>
            </View>

            {tableModalView === 'seated' && (
              <FlatList
                data={seatedGuestsForTable}
                keyExtractor={(item) => item.id.toString()}
                numColumns={2}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                renderItem={({ item }) => (
                  <View style={styles.seatedGuestItem}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                        <Text style={[styles.guestName, {fontSize: 14, flex: 1}]} numberOfLines={1}>{item.name}</Text>
                        <View style={[styles.peopleCountBadge, {marginLeft: 4}]}>
                            <Ionicons name="person" size={10} color={colors.richBlack} />
                            <Text style={[styles.peopleCountText, {fontSize: 10}]}>{item.numberOfPeople || 1}</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveGuestFromTable(item.id)} style={{marginLeft: 4}}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                )}
                nestedScrollEnabled
                style={{ flex: 1, marginTop: 20 }}
                ListEmptyComponent={<Text style={styles.emptyListText}>אין אורחים יושבים בשולחן זה</Text>}
              />
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
                  ListEmptyComponent={<Text style={styles.emptyListText}>כל האורחים שהגיעו כבר הושבו</Text>}
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
        </View>
      </Modal>

      {/* Canvas */}
      {Platform.OS === 'web' && webSketch ? (
        <View style={styles.canvasScroll}>
          {/*
            Tooltip on hover: show seated guests count for this table number.
            We compute counts from the current guests list.
          */}
          <SeatingGridReadonly
            gridCols={webSketch.gridCols}
            gridRows={webSketch.gridRows}
            tables={webSketch.tables}
            zones={webSketch.zones}
            labels={webSketch.labels}
            getTableTooltip={(t: any) => {
              const num = t?.number;
              if (!num) return null;
              const seated = seatedByNumber.get(Number(num)) ?? 0;
              return `יושבים בשולחן: ${seated}`;
            }}
            onPressTableNumber={(num) => {
              if (!num) return;
              const t = tables.find((x) => x.number === num);
              if (t) handleTablePress(t);
            }}
          />
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.canvasScroll}
          contentContainerStyle={{ 
            width: canvasWidth,
            height: height * 2,
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
          <View style={[styles.canvas, { width: canvasWidth, height: height * 2 }]}> 
              {/* Grid */}
              {[...Array(Math.ceil((height * 2) / 50))].map((_, i) => (
                <View key={i} style={[styles.gridLine, { top: i * 50 }]} />
              ))}
              {[...Array(Math.ceil(canvasWidth / 80))].map((_, i) => (
                <View key={i} style={[styles.gridLineV, { left: i * 80 }]} />
              ))}
              
              {/* Tables */}
              {tables.map(table => {
                // מיקום מתוקן לפי minX ו-padding
                const adjustedX = (table.x ?? 0) - minX + padding;
                if (!positions[table.id]) {
                  positions[table.id] = new Animated.ValueXY({
                    x: adjustedX,
                    y: typeof table.y === 'number' ? table.y : 60
                  });
                }
                // Calculate total people seated at this table
                const guestsAtTable = guests.filter(g => g.table_id === table.id);
                const totalPeopleSeated = guestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
                const isTableFull = totalPeopleSeated >= table.capacity;
                const isReserveTable = table.shape === 'reserve';
                return (
                  <Animated.View
                    key={table.id}
                    style={[
                      styles.table,
                      table.shape === 'rectangle' ? styles.tableRect : styles.tableSquare,
                      isTableFull && styles.tableFullStyle,
                      isReserveTable && styles.reserveTableStyle,
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
                      <Text style={[
                        styles.tableName,
                        isTableFull && styles.tableFullText,
                        isReserveTable && styles.reserveTableText,
                        pressedTable === table.id && { color: isTableFull ? colors.white : colors.textLight }
                      ]}>{table.number}</Text>
                      <Text style={[
                        styles.tableCap,
                        isTableFull && styles.tableFullCapText,
                        isReserveTable && styles.reserveTableCapText,
                        pressedTable === table.id && { color: isTableFull ? colors.white : colors.gray[500] }
                      ]}>
                        {totalPeopleSeated} / {table.capacity}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
              
              {/* Text Areas */}
              {textAreas.map((t, idx) => (
                <View
                  key={t.id}
                  style={[styles.textArea, { top: t.y ?? 200 + idx * 40, left: t.x ?? 200 }]}
                >
                  <Text style={styles.textAreaText}>{t.text}</Text>
                </View>
              ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '400',
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
  canvas: { 
    width: width * 3,
    height: height * 2,
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
  tableSquare: { width: 70, height: 70 },
  // Knight table: vertical rectangle ("מלבן לאורך")
  tableRect: { width: 58, height: 118 },
  tableSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  tableName: { fontWeight: 'bold', fontSize: 16, color: colors.text },
  tableCustomName: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 2,
  },
  tableCap: { fontSize: 14, color: colors.textLight },
  tableFullStyle: {
    backgroundColor: colors.success,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tableFullText: {
    color: colors.white,
    fontWeight: '700',
  },
  tableFullCapText: {
    color: colors.white,
    fontWeight: '600',
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
  guestName: {
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
    backgroundColor: 'rgba(244, 67, 54, 0.06)',
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.2)',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
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
    width: '100%',
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
}); 