import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
  Pressable,
  Modal,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutStore } from '@/store/layoutStore';
import { MotiPressable } from 'moti/interactions';

interface TableColumn {
  id: number;
  tablesCount: number;
  aisle: 'normal' | 'wide';
}

interface BuiltTable {
  id: number;
  x: number;
  y: number;
  isKnight: boolean;
  isReserve: boolean;
  rotation: number;
  seats: number;
  seated_guests: number; // חדש
}

const PREVIEW_MAP_HEIGHT = 560;
const PREVIEW_MAP_Y_RANGE = 800;
const PREVIEW_TABLE_CARD_WIDTH = 44;

export default function SeatingTemplatesScreen() {
  const { eventId, keep } = useLocalSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [existingMap, setExistingMap] = useState<any>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [mode, setMode] = useState<'builder' | 'map'>('builder');
  const [baseTables, setBaseTables] = useState<BuiltTable[]>([]);
  const [manualTables, setManualTables] = useState<BuiltTable[]>([]);
  const [hiddenTableIds, setHiddenTableIds] = useState<Set<number>>(new Set());
  const { setTabBarVisible } = useLayoutStore();

  const tablesForEdit = useMemo(() => {
    const hidden = hiddenTableIds;
    const all = [...baseTables, ...manualTables].filter(t => !hidden.has(t.id));
    all.sort((a, b) => a.id - b.id);
    return all;
  }, [baseTables, manualTables, hiddenTableIds]);

  // Local UI palette inspired by the provided HTML mock
  const ui = {
    primary: '#2b8cee',
    bg: '#f6f7f8',
    card: '#ffffff',
    canvas: '#f2f2f7',
    text: '#111418',
    muted: '#6b7280',
    borderSoft: 'rgba(17, 24, 39, 0.08)',
    borderGlass: 'rgba(255, 255, 255, 0.55)',
    glassFill: 'rgba(255,255,255,0.72)',
  } as const;
  
  // Column builder state
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [newColumnTablesCount, setNewColumnTablesCount] = useState(5);
  const [newColumnAisle, setNewColumnAisle] = useState<'normal' | 'wide'>('normal');
  
  // Track which tables are knight tables (by table ID)
  const [knightTables, setKnightTables] = useState<Set<number>>(new Set());
  
  // Track which tables are reserve tables (by table ID)
  const [reserveTables, setReserveTables] = useState<Set<number>>(new Set());
  
  // Track horizontal gaps (by unique key and columns - structure: key -> gap info)
  const [horizontalGaps, setHorizontalGaps] = useState<Map<string, {size: number, columns: Set<number>, position: 'before' | 'after', rowIndex: number}>>(new Map());
  
  // Track which gap is being edited  
  const [editingGap, setEditingGap] = useState<string | null>(null);

  // When opened on web, show the dedicated web page (unless explicitly kept here for editing).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!eventId) return;
    if (keep === '1') return;
    // Avoid loops when we're already on the web route.
    if (pathname?.endsWith('/seating/templatesWeb')) return;

    router.replace({
      pathname: '/seating/templatesWeb',
      params: { eventId: String(eventId) },
    });
  }, [eventId, keep, pathname, router]);

  // Load existing seating map if available
  useEffect(() => {
    const loadExistingMap = async () => {
      if (!eventId) return;
      
      try {
        // First try to load from seating_maps
        const { data: seatingMapData, error: seatingMapError } = await supabase
          .from('seating_maps')
          .select('*')
          .eq('event_id', eventId)
          .single();
        
        if (seatingMapData && !seatingMapError) {
          setExistingMap(seatingMapData);
          // Load existing tables into the builder
          loadTablesFromExistingMap(seatingMapData.tables);
        } else {
          // If no seating_maps, try to load from tables table
          const { data: tablesData, error: tablesError } = await supabase
            .from('tables')
            .select('*')
            .eq('event_id', eventId)
            .order('number');
          
          if (tablesData && !tablesError && tablesData.length > 0) {
            // Convert tables data to BuiltTable format
            const builtTables = tablesData.map(table => ({
              id: table.number,
              x: table.x || 0,
              y: table.y || 0,
              isKnight: table.shape === 'rectangle',
              isReserve: table.shape === 'reserve',
              rotation: 0,
              seats: table.capacity,
              seated_guests: typeof table.seated_guests === 'number' ? table.seated_guests : 0, // ודא שדה קיים
            }));
            
            // Create a mock seating map
            const mockSeatingMap = {
              id: 'mock',
              event_id: eventId,
              num_tables: tablesData.length,
              tables: builtTables,
              annotations: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            setExistingMap(mockSeatingMap);
            loadTablesFromExistingMap(builtTables);
          }
        }
      } catch (error) {
        // Map doesn't exist yet, which is fine
        console.log('No existing map found');
      }
    };

    loadExistingMap();
  }, [eventId]);

  // Function to load existing tables into the builder
  const loadTablesFromExistingMap = (existingTables: BuiltTable[]) => {
    if (!existingTables || existingTables.length === 0) return;

    // Group tables by X position to identify columns
    const xPositions = [...new Set(existingTables.map(t => t.x))].sort((a, b) => b - a); // Sort right to left
    
    const newColumns: TableColumn[] = [];
    const newKnightTables = new Set<number>();
    const newReserveTables = new Set<number>();

    xPositions.forEach((xPos, columnIndex) => {
      const tablesInColumn = existingTables.filter(t => t.x === xPos).sort((a, b) => a.y - b.y);
      
      // ודא שלכל טבלה יש seated_guests
      tablesInColumn.forEach(table => {
        if (typeof table.seated_guests !== 'number') {
          table.seated_guests = 0;
        }
      });
      
      // Determine aisle type based on spacing to next column
      let aisle: 'normal' | 'wide' = 'normal';
      if (columnIndex < xPositions.length - 1) {
        const nextX = xPositions[columnIndex + 1];
        const spacing = xPos - nextX;
        aisle = spacing > 150 ? 'wide' : 'normal';
      }

      newColumns.push({
        id: Date.now() + columnIndex,
        tablesCount: tablesInColumn.length,
        aisle: aisle,
      });

      // Mark knight and reserve tables
      tablesInColumn.forEach(table => {
        if (table.isKnight) {
          newKnightTables.add(table.id);
        } else if (table.isReserve) {
          newReserveTables.add(table.id);
        }
      });
    });

    setColumns(newColumns);
    setKnightTables(newKnightTables);
    setReserveTables(newReserveTables);
    setBaseTables(existingTables);
    setManualTables([]);
    setHiddenTableIds(new Set());
  };

  const generateTablesFromColumns = (): BuiltTable[] => {
    const tables: BuiltTable[] = [];
    let tableId = 1;

  // Fixed vertical spacing between tables in the same column
    const VERTICAL_TABLE_SPACING = 120;

    // Start from the right side and work left for each column
    let currentX = 1050; // Start from right side of the screen

    // All columns start from the same Y position (top)
    const startY = 100; // Fixed starting Y position for all columns

    columns.forEach((column, columnIndex) => {
      // Add tables for the current column - all start from same Y
      let currentY = startY;
      
      for (let i = 0; i < column.tablesCount; i++) {
        // Check for "before" gap before this row
        const beforeGapKey = `before-${i}`;
        const beforeGap = horizontalGaps.get(beforeGapKey);
        if (beforeGap && beforeGap.columns.has(columnIndex)) {
          currentY += beforeGap.size;
        }
        
        tables.push({
          id: tableId,
          x: currentX,
          y: currentY,
          isKnight: knightTables.has(tableId),
          isReserve: reserveTables.has(tableId),
          rotation: 0,
          seats: knightTables.has(tableId) ? 20 : reserveTables.has(tableId) ? 8 : 12,
          seated_guests: 0, // הוספת שדה התחלתי
        });
        tableId++;
        
        // Move to next position, adding "after" gap if exists for this column
        if (i < column.tablesCount - 1) {
          currentY += VERTICAL_TABLE_SPACING;
          const afterGapKey = `after-${i}`;
          const afterGap = horizontalGaps.get(afterGapKey);
          if (afterGap && afterGap.columns.has(columnIndex)) {
            currentY += afterGap.size;
          }
        }
      }
      
      // Move currentX for the next column (to the left)
      const tableWidth = 50; // All tables start as regular
      const horizontalSpacing = column.aisle === 'wide' ? 220 : 120; // Increased wide spacing from 180 to 220
      currentX -= (tableWidth + horizontalSpacing);
    });
    
    return tables;
  };

  const mergeGeneratedTablesPreservingPositions = useCallback(
    (prev: BuiltTable[], generated: BuiltTable[]) => {
      const hidden = hiddenTableIds;
      const prevById = new Map<number, BuiltTable>(prev.map(t => [t.id, t]));
      return generated.filter(t => !hidden.has(t.id)).map(t => {
        const prevT = prevById.get(t.id);
        if (!prevT) return t;
        return {
          ...t,
          x: typeof prevT.x === 'number' ? prevT.x : t.x,
          y: typeof prevT.y === 'number' ? prevT.y : t.y,
          seated_guests:
            typeof prevT.seated_guests === 'number' ? prevT.seated_guests : t.seated_guests,
        };
      });
    },
    [hiddenTableIds]
  );

  // Keep generated tables in sync with builder inputs, but preserve any manual positioning edits.
  useEffect(() => {
    const generated = generateTablesFromColumns();
    setBaseTables(prev => mergeGeneratedTablesPreservingPositions(prev, generated));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, horizontalGaps, knightTables, reserveTables, mergeGeneratedTablesPreservingPositions]);

  const addColumn = () => {
    const newColumn: TableColumn = {
      id: Date.now(),
      tablesCount: newColumnTablesCount,
      aisle: newColumnAisle,
    };
    
    setColumns([...columns, newColumn]);
  };

  const removeColumn = (columnId: number) => {
    setColumns(columns.filter(column => column.id !== columnId));
  };

  const clearAll = () => {
    Alert.alert(
      'מחק הכל',
      'האם אתה בטוח שברצונך למחוק את כל העמודות?',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחק', style: 'destructive', onPress: () => {
          setColumns([]);
          setKnightTables(new Set());
          setReserveTables(new Set());
          setHorizontalGaps(new Map());
          setEditingGap(null);
          setBaseTables([]);
          setManualTables([]);
          setHiddenTableIds(new Set());
        }}
      ]
    );
  };

  const toggleTableType = (tableId: number) => {
    setSelectedTableId(tableId);
    const isKnight = knightTables.has(tableId);
    const isReserve = reserveTables.has(tableId);
    
    let currentType = 'רגיל';
    if (isKnight) currentType = 'אביר';
    if (isReserve) currentType = 'רזרבה';
    
    Alert.alert(
      'בחר סוג שולחן',
      `שולחן ${tableId} כרגע הוא: ${currentType}`,
      [
        {
          text: 'שולחן רגיל',
          onPress: () => {
            const newKnightTables = new Set(knightTables);
            const newReserveTables = new Set(reserveTables);
            newKnightTables.delete(tableId);
            newReserveTables.delete(tableId);
            setKnightTables(newKnightTables);
            setReserveTables(newReserveTables);
          }
        },
        {
          text: 'שולחן אביר',
          onPress: () => {
            const newKnightTables = new Set(knightTables);
            const newReserveTables = new Set(reserveTables);
            newKnightTables.add(tableId);
            newReserveTables.delete(tableId);
            setKnightTables(newKnightTables);
            setReserveTables(newReserveTables);
          }
        },
        {
          text: 'שולחן רזרבה',
          onPress: () => {
            const newKnightTables = new Set(knightTables);
            const newReserveTables = new Set(reserveTables);
            newKnightTables.delete(tableId);
            newReserveTables.add(tableId);
            setKnightTables(newKnightTables);
            setReserveTables(newReserveTables);
          }
        },
        { text: 'ביטול', style: 'cancel' }
      ]
    );
  };

  const showColumnSelectionDialog = (gapKey: string, position: 'before' | 'after', rowIndex: number) => {
    Alert.alert(
      'בחר עמודות',
      'באילו עמודות ליצור את המרווח?',
      [
        ...columns.map((_, columnIndex) => ({
          text: `עמודה ${columnIndex + 1}`,
          onPress: () => {
            const newGaps = new Map(horizontalGaps);
            if (!newGaps.has(gapKey)) {
              newGaps.set(gapKey, {
                size: 60,
                columns: new Set([columnIndex]),
                position,
                rowIndex
              });
            } else {
              const existingGap = newGaps.get(gapKey)!;
              existingGap.columns.add(columnIndex);
              newGaps.set(gapKey, {...existingGap});
            }
            setHorizontalGaps(newGaps);
          }
        })),
        { text: 'כל העמודות', onPress: () => {
          const newGaps = new Map(horizontalGaps);
          newGaps.set(gapKey, {
            size: 60,
            columns: new Set(columns.map((_, idx) => idx)),
            position,
            rowIndex
          });
          setHorizontalGaps(newGaps);
        }},
        { text: 'ביטול', style: 'cancel' as const }
      ]
    );
  };

  const getTotalTables = () => {
    return tablesForEdit.length;
  };

  const getTotalSeats = () => {
    return tablesForEdit.reduce((total, table) => total + (table.seats ?? 0), 0);
  };

  const handleCreateMap = async () => {
    const tables = tablesForEdit.map(t => ({
      ...t,
      seated_guests: typeof t.seated_guests === 'number' ? t.seated_guests : 0,
    }));

    if (tables.length === 0) {
      Alert.alert('שגיאה', 'נא להוסיף לפחות שולחן אחד');
      return;
    }

    setLoading(true);
    try {
      if (existingMap) {
        // Update existing map
        await updateSeatingMap(tables);
      } else {
        // Create new map
        await createSeatingMap(tables);
      }
    } catch (error) {
      console.error('Error creating/updating map:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת המפה');
    } finally {
      setLoading(false);
    }
  };

  const createSeatingMap = async (tables: BuiltTable[]) => {
    if (!eventId) {
      Alert.alert('שגיאה', 'חסר eventId. חזור למסך האירוע ופתח שוב את הבונה.');
      return;
    }

    // Create or update seating_maps row (UNIQUE(event_id) => upsert).
    const { error: seatingMapError } = await supabase
      .from('seating_maps')
      .upsert(
        {
          event_id: eventId,
          num_tables: tables.length,
          tables: tables,
          annotations: [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      );

    // Supabase PostgREST: PGRST205 => table not found in schema cache
    if (seatingMapError && seatingMapError.code !== 'PGRST205') throw seatingMapError;

    // Make tables write idempotent: remove existing records then re-insert
    const { error: deleteError } = await supabase.from('tables').delete().eq('event_id', eventId);
    if (deleteError) throw deleteError;

    // Create table records for the tables table
    const tableRecords = tables.map(table => {
      let shape = 'square'; // default
      if (table.isKnight) shape = 'rectangle';
      else if (table.isReserve) shape = 'reserve';
      
      return {
        event_id: eventId,
        number: table.id, // Save id as number
        capacity: table.seats, // Save seats as capacity
        shape: shape, // Save shape: square/rectangle/reserve
        name: `שולחן ${table.id}`,
        x: table.x, // שמירת ערך X
        y: table.y, // שמירת ערך Y
        seated_guests: table.seated_guests ?? 0, // שמירת שדה חדש
      };
    });

    const { error: tablesError } = await supabase
      .from('tables')
      .insert(tableRecords);

    if (tablesError) throw tablesError;
    showSuccessAlert(tables.length);
  };

  const updateSeatingMap = async (tables: BuiltTable[]) => {
    if (!eventId) {
      Alert.alert('שגיאה', 'חסר eventId. חזור למסך האירוע ופתח שוב את הבונה.');
      return;
    }

    // Update seating_maps if exists, otherwise ignore and persist tables only.
    const { error: seatingMapError } = await supabase
      .from('seating_maps')
      .update({
        num_tables: tables.length,
        tables: tables,
        annotations: [],
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (seatingMapError && seatingMapError.code !== 'PGRST205') throw seatingMapError;

    // Delete existing table records for this event
    const { error: deleteError } = await supabase
      .from('tables')
      .delete()
      .eq('event_id', eventId);

    if (deleteError) throw deleteError;

    // Create new table records for the tables table
    const tableRecords = tables.map(table => {
      let shape = 'square'; // default
      if (table.isKnight) shape = 'rectangle';
      else if (table.isReserve) shape = 'reserve';
      
      return {
        event_id: eventId,
        number: table.id, // Save id as number
        capacity: table.seats, // Save seats as capacity
        shape: shape, // Save shape: square/rectangle/reserve
        name: `שולחן ${table.id}`,
        x: table.x, // שמירת ערך X
        y: table.y, // שמירת ערך Y
        seated_guests: table.seated_guests ?? 0, // שמירת שדה חדש
      };
    });

    const { error: tablesError } = await supabase
      .from('tables')
      .insert(tableRecords);

    if (tablesError) throw tablesError;
    showSuccessAlert(tables.length);
  };

  const showSuccessAlert = (totalTables: number) => {
    const action = existingMap ? 'עודכנה' : 'נוצרה';
    Alert.alert(
      'הצלחה!',
      `${action} מפת הושבה עם ${totalTables} שולחנות ו-${getTotalSeats()} מקומות ישיבה`,
      [
        {
          text: 'חזור',
          style: 'cancel',
          onPress: () => router.back()
        },
        {
          text: 'עבור למפה',
          onPress: () =>
            router.push({
              pathname: '/BrideGroomSeating',
              params: { eventId: String(eventId) },
            })
        }
      ]
    );
  };

  const renderPreview = () => {
    // Preview should reflect the actual saved/freeform positions (x/y) too.
    const tables = tablesForEdit;
    
    if (tables.length === 0) {
      return (
        <View style={styles.emptyPreview}>
          <Ionicons name="restaurant-outline" size={48} color={colors.gray[400]} />
          <Text style={styles.emptyPreviewText}>הוסף עמודות כדי לראות תצוגה מקדימה</Text>
        </View>
      );
    }

    // Scale world coordinates into the preview canvas.
    const xs = tables.map(t => t.x ?? 0);
    const ys = tables.map(t => t.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const H_PADDING = 24;
    const V_PADDING = 24;

    // Fit-to-height scale (keep it <= 1 so preview doesn't blow up)
    const scale = Math.min(
      1,
      (PREVIEW_MAP_HEIGHT - V_PADDING * 2) / Math.max(1, (maxY - minY) + 140)
    );

    const totalWidth = Math.max(400, (maxX - minX) * scale + H_PADDING * 2 + 120);

    return (
      <View style={styles.hallVisualization}>
        {/* Dot-grid background */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern id="dotGrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <Circle cx="1.5" cy="1.5" r="1.5" fill="#cbd5e1" opacity={0.75} />
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#dotGrid)" opacity={0.55} />
          </Svg>
        </View>

        {/* Zoom indicator (static preview) */}
        <View style={styles.zoomPill}>
          <Ionicons name="search" size={16} color={'rgba(17,24,39,0.35)'} />
          <Text style={styles.zoomPillText}>100%</Text>
        </View>

        {/* Stage */}
        <View style={styles.stagePill}>
          <View style={styles.stageIcon}>
            <Ionicons name="sparkles" size={14} color={'rgba(43,140,238,0.95)'} />
          </View>
          <Text style={styles.stagePillText}>במה</Text>
        </View>

        <ScrollView
          horizontal
          style={styles.tablesAreaContainer}
          contentContainerStyle={[styles.tablesAreaContent, { width: totalWidth }]}
          showsHorizontalScrollIndicator={false}
          decelerationRate="normal"
          bounces={false}
        >
          <View style={[styles.tablesArea, { width: totalWidth, height: PREVIEW_MAP_HEIGHT }]}>
            {/* Render tables (same map logic, updated visuals) */}
            {tables.map((table) => {
              const adjustedX = ((table.x ?? 0) - minX) * scale + H_PADDING;
              const isSelected = selectedTableId === table.id;

              // A tiny "seat dots" row just for visual hint (kept light)
              const dotsCount = Math.max(0, Math.min(4, Math.round((table.seats ?? 0) / 3)));
              const dots = Array.from({ length: dotsCount });

              return (
                <TouchableOpacity
                  key={table.id}
                  onPress={() => toggleTableType(table.id)}
                  activeOpacity={0.9}
                  style={[
                    styles.tableCard,
                    table.isReserve && styles.tableCardReserve,
                    table.isKnight && styles.tableCardKnight,
                    isSelected && styles.tableCardSelected,
                    {
                      left: adjustedX,
                      top: ((table.y ?? 0) - minY) * scale + V_PADDING,
                    },
                  ]}
                >
                  {isSelected ? <View style={styles.selectedDot} /> : null}

                  <Text
                    style={[
                      styles.tableLabel,
                      isSelected && styles.tableLabelSelected,
                      table.isReserve && styles.tableLabelOnDark,
                    ]}
                    numberOfLines={1}
                  >
                    שולחן {table.id}
                  </Text>

                  <View style={[styles.seatDotsRow, !isSelected && styles.seatDotsRowMuted]}>
                    {dots.map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.seatDot,
                          isSelected ? styles.seatDotSelected : null,
                          table.isReserve ? styles.seatDotOnDark : null,
                        ]}
                      />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  const updateTablePosition = useCallback((tableId: number, x: number, y: number) => {
    setBaseTables(prev =>
      prev.some(t => t.id === tableId) ? prev.map(t => (t.id === tableId ? { ...t, x, y } : t)) : prev
    );
    setManualTables(prev =>
      prev.some(t => t.id === tableId) ? prev.map(t => (t.id === tableId ? { ...t, x, y } : t)) : prev
    );
  }, []);

  const addManualTableAt = useCallback(
    (kind: 'regular' | 'knight' | 'reserve', x: number, y: number) => {
      const maxId = tablesForEdit.reduce((m, t) => Math.max(m, t.id), 0);
      const nextId = maxId + 1;
      const isKnight = kind === 'knight';
      const isReserve = kind === 'reserve';
      const seats = isKnight ? 20 : isReserve ? 8 : 12;

      const newTable: BuiltTable = {
        id: nextId,
        x,
        y,
        isKnight,
        isReserve,
        rotation: 0,
        seats,
        seated_guests: 0,
      };

      setManualTables(prev => [...prev, newTable]);
    },
    [tablesForEdit]
  );

  const addManualTablesBatchAt = useCallback(
    (
      kind: 'regular' | 'knight' | 'reserve',
      count: number,
      layout: 'row' | 'column',
      x: number,
      y: number
    ) => {
      const safeCount = Math.max(1, Math.min(200, Math.floor(count || 1)));
      const isKnight = kind === 'knight';
      const isReserve = kind === 'reserve';
      const seats = isKnight ? 20 : isReserve ? 8 : 12;

      // spacing in world units (snapped feel)
      const w = isKnight ? 68 : 78;
      const h = isKnight ? 130 : 78;
      const gap = 26;
      const stepX = layout === 'row' ? w + gap : 0;
      const stepY = layout === 'column' ? h + gap : 0;

      setManualTables(prev => {
        const maxBase = baseTables.reduce((m, t) => Math.max(m, t.id), 0);
        const maxManual = prev.reduce((m, t) => Math.max(m, t.id), 0);
        const startId = Math.max(maxBase, maxManual) + 1;

        const newTables: BuiltTable[] = Array.from({ length: safeCount }).map((_, i) => ({
          id: startId + i,
          x: x + i * stepX,
          y: y + i * stepY,
          isKnight,
          isReserve,
          rotation: 0,
          seats,
          seated_guests: 0,
        }));

        return [...prev, ...newTables];
      });
    },
    [baseTables]
  );

  const handleTableTypePress = useCallback(
    (tableId: number) => {
      const manual = manualTables.find(t => t.id === tableId);
      if (!manual) {
        toggleTableType(tableId);
        return;
      }

      let currentType = 'רגיל';
      if (manual.isKnight) currentType = 'אביר';
      if (manual.isReserve) currentType = 'רזרבה';

      Alert.alert('בחר סוג שולחן', `שולחן ${tableId} כרגע הוא: ${currentType}`, [
        {
          text: 'שולחן רגיל',
          onPress: () =>
            setManualTables(prev =>
              prev.map(t =>
                t.id === tableId ? { ...t, isKnight: false, isReserve: false, seats: 12 } : t
              )
            ),
        },
        {
          text: 'שולחן אביר',
          onPress: () =>
            setManualTables(prev =>
              prev.map(t =>
                t.id === tableId ? { ...t, isKnight: true, isReserve: false, seats: 20 } : t
              )
            ),
        },
        {
          text: 'שולחן רזרבה',
          onPress: () =>
            setManualTables(prev =>
              prev.map(t =>
                t.id === tableId ? { ...t, isKnight: false, isReserve: true, seats: 8 } : t
              )
            ),
        },
        { text: 'ביטול', style: 'cancel' },
      ]);
    },
    [manualTables, toggleTableType]
  );

  const handleRequestDeleteTable = useCallback((tableId: number) => {
    Alert.alert('מחיקת שולחן', `האם אתה בטוח שברצונך למחוק את שולחן ${tableId}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: () => {
          setHiddenTableIds(prev => {
            const next = new Set(prev);
            next.add(tableId);
            return next;
          });
          setBaseTables(prev => prev.filter(t => t.id !== tableId));
          setManualTables(prev => prev.filter(t => t.id !== tableId));
        },
      },
    ]);
  }, []);

  if (mode === 'map') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: ui.bg }}>
        <SeatingFreeformMap
          ui={ui}
          tables={tablesForEdit}
          loading={loading}
          onBack={() => setMode('builder')}
          onSave={handleCreateMap}
          onAddTable={addManualTableAt}
          onAddTablesBatch={addManualTablesBatchAt}
          onMoveTable={updateTablePosition}
          onPressTable={handleTableTypePress}
          onRequestDeleteTable={handleRequestDeleteTable}
          setTabBarVisible={setTabBarVisible}
        />
      </GestureHandlerRootView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ui.bg }]}>
      {/* Header (glass) */}
      <View style={styles.header}>
        <BlurView intensity={26} tint="light" style={styles.headerBlur}>
          <View style={[styles.headerInner, { borderBottomColor: ui.borderGlass }]}>
            <TouchableOpacity
              style={[styles.headerIconBtn, { borderColor: ui.borderSoft }]}
              onPress={() => router.back()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              {/* RTL back arrow points right */}
              <Ionicons name="chevron-forward" size={24} color={ui.primary} />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: ui.text }]}>בונה מפת הושבה</Text>
              {existingMap ? (
                <Text style={[styles.headerSubtitle, { color: ui.muted }]}>עריכה של תבנית קיימת</Text>
              ) : (
                <Text style={[styles.headerSubtitle, { color: ui.muted }]}>יצירת תבנית חדשה</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.headerIconBtn, { borderColor: ui.borderSoft }]}
              onPress={() => setMode('map')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="מצב מפה"
            >
              <Ionicons name="map-outline" size={22} color={ui.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.headerSaveBtn,
                {
                  backgroundColor: ui.primary,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleCreateMap}
              disabled={loading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="שמור"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.headerSaveText}>שמור</Text>
              )}
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Add Column (modern controls) */}
        <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.borderSoft }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: ui.text }]}>הוספה מהירה</Text>
            <View style={[styles.pillChip, { backgroundColor: 'rgba(43, 140, 238, 0.10)' }]}>
              <Text style={[styles.pillChipText, { color: ui.primary }]}>
                {columns.length ? `${getTotalTables()} שולחנות` : 'אין שולחנות'}
              </Text>
            </View>
          </View>

          {/* Floating toolbar look (inside card) */}
          <View style={[styles.toolbarPill, { borderColor: 'rgba(255,255,255,0.6)' }]}>
            <TouchableOpacity
              style={styles.toolbarIconBtn}
              activeOpacity={0.85}
              onPress={() => {
                // small helper: jump to columns list by just doing nothing special for now
                // (kept simple: no scroll refs to avoid behavior changes)
              }}
              accessibilityRole="button"
              accessibilityLabel="פריסה"
            >
              <Ionicons name="grid-outline" size={20} color={'rgba(17,24,39,0.62)'} />
            </TouchableOpacity>

            <View style={styles.toolbarDivider} />

            <View style={styles.counterPill}>
              <TouchableOpacity
                style={styles.counterPillBtn}
                activeOpacity={0.85}
                onPress={() => setNewColumnTablesCount(Math.max(1, newColumnTablesCount - 1))}
                accessibilityRole="button"
                accessibilityLabel="הפחת שולחנות"
              >
                <Ionicons name="add" size={18} color={'rgba(17,24,39,0.45)'} style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>

              <Text style={[styles.counterPillValue, { color: ui.text }]}>{newColumnTablesCount}</Text>

              <TouchableOpacity
                style={styles.counterPillBtn}
                activeOpacity={0.85}
                onPress={() => setNewColumnTablesCount(Math.min(10, newColumnTablesCount + 1))}
                accessibilityRole="button"
                accessibilityLabel="הוסף שולחנות"
              >
                <Ionicons name="add" size={18} color={'rgba(17,24,39,0.45)'} />
              </TouchableOpacity>
            </View>

            <View style={styles.toolbarDivider} />

            <TouchableOpacity
              style={[styles.toolbarFab, { backgroundColor: ui.primary }]}
              activeOpacity={0.9}
              onPress={addColumn}
              accessibilityRole="button"
              accessibilityLabel="הוסף עמודה"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Spacing segmented control */}
          <View style={styles.spacer12} />
          <Text style={[styles.fieldLabel, { color: ui.muted }]}>מרווח לעמודה הבאה</Text>
          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                newColumnAisle === 'normal' && styles.segmentBtnActive,
              ]}
              onPress={() => setNewColumnAisle('normal')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentText, newColumnAisle === 'normal' && styles.segmentTextActive]}>
                רגיל
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                newColumnAisle === 'wide' && styles.segmentBtnActive,
              ]}
              onPress={() => setNewColumnAisle('wide')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segmentText, newColumnAisle === 'wide' && styles.segmentTextActive]}>
                רחב
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Current Columns */}
        {columns.length > 0 && (
          <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.borderSoft }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: ui.text }]}>עמודות</Text>
              <TouchableOpacity onPress={clearAll} style={styles.linkDanger} activeOpacity={0.8}>
                <Text style={styles.linkDangerText}>מחק הכל</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.listWrap}>
              {columns.map((column, index) => (
                <View key={column.id} style={[styles.listItem, { borderColor: 'rgba(17,24,39,0.06)' }]}>
                  <View style={[styles.listIcon, { backgroundColor: 'rgba(43,140,238,0.10)' }]}>
                    <Ionicons name="restaurant-outline" size={18} color={ui.primary} />
                  </View>

                  <View style={styles.listBody}>
                    <Text style={[styles.listTitle, { color: ui.text }]}>עמודה {index + 1}</Text>
                    <Text style={[styles.listSubtitle, { color: ui.muted }]}>
                      {column.tablesCount} שולחנות • מרווח {column.aisle === 'wide' ? 'רחב' : 'רגיל'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => removeColumn(column.id)}
                    style={styles.trashCircle}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`מחק עמודה ${index + 1}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={'rgba(239,68,68,0.95)'} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryTextModern, { color: ui.muted }]}>סה״כ</Text>
              <Text style={[styles.summaryTextModernStrong, { color: ui.text }]}>
                {getTotalTables()} שולחנות • {getTotalSeats()} מקומות
              </Text>
            </View>
          </View>
        )}

        {/* Horizontal Gaps */}
        {columns.length > 0 && (
          <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.borderSoft }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: ui.text }]}>מרווחים בין שורות</Text>
              <TouchableOpacity
                style={[styles.smallPrimaryBtn, { backgroundColor: ui.primary }]}
                activeOpacity={0.9}
                onPress={() => {
                  const maxRows = Math.max(...columns.map(col => col.tablesCount));
                  Alert.alert(
                    'הוסף מרווח',
                    'בחר איפה להוסיף מרווח:',
                    [
                      {
                        text: 'לפני שורה 1',
                        onPress: () => {
                          showColumnSelectionDialog('before-0', 'before', 0);
                        }
                      },
                      ...Array.from({length: maxRows - 1}, (_, i) => ({
                        text: `אחרי שורה ${i + 1}`,
                        onPress: () => {
                          showColumnSelectionDialog(`after-${i}`, 'after', i);
                        }
                      })),
                      { text: 'ביטול', style: 'cancel' as const }
                    ]
                  );
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.helpText, { color: ui.muted }]}>
              הוסף מרווחים בין שורות שולחנות (למשל, מעבר לשירותים)
            </Text>

            {Array.from(horizontalGaps.entries()).length > 0 ? (
              <View style={styles.gapsList}>
                {Array.from(horizontalGaps.entries()).map(([gapKey, gapInfo]) => (
                  <View key={gapKey} style={styles.gapBlock}>
                    <View style={[styles.gapRowModern, { borderColor: 'rgba(17,24,39,0.06)' }]}>
                      <View style={styles.gapMain}>
                        <Text style={[styles.gapTitleModern, { color: ui.text }]}>
                          {gapInfo.position === 'before' ? 'לפני' : 'אחרי'} שורה {gapInfo.rowIndex + 1}
                        </Text>
                        <Text style={[styles.gapSubModern, { color: ui.muted }]}>
                          {gapInfo.size}px • עמודות: {Array.from(gapInfo.columns).map(c => c + 1).join(', ')}
                        </Text>
                      </View>

                      <View style={styles.gapActionsModern}>
                        <TouchableOpacity
                          style={styles.iconChip}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            const currentGap = newGaps.get(gapKey);
                            if (currentGap) {
                              newGaps.set(gapKey, {
                                ...currentGap,
                                size: Math.max(20, currentGap.size - 20)
                              });
                              setHorizontalGaps(newGaps);
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="remove" size={16} color={'rgba(17,24,39,0.65)'} />
                        </TouchableOpacity>

                        <View style={styles.sizeChip}>
                          <Text style={[styles.sizeChipText, { color: ui.text }]}>{gapInfo.size}</Text>
                        </View>

                        <TouchableOpacity
                          style={styles.iconChip}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            const currentGap = newGaps.get(gapKey);
                            if (currentGap) {
                              newGaps.set(gapKey, {
                                ...currentGap,
                                size: Math.min(200, currentGap.size + 20)
                              });
                              setHorizontalGaps(newGaps);
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="add" size={16} color={'rgba(17,24,39,0.65)'} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.iconChip,
                            editingGap === gapKey && { backgroundColor: ui.primary }
                          ]}
                          onPress={() => setEditingGap(editingGap === gapKey ? null : gapKey)}
                          activeOpacity={0.88}
                        >
                          <Ionicons
                            name={editingGap === gapKey ? 'checkmark' : 'create-outline'}
                            size={16}
                            color={editingGap === gapKey ? '#fff' : 'rgba(17,24,39,0.65)'}
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconChip}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            newGaps.delete(gapKey);
                            setHorizontalGaps(newGaps);
                            setEditingGap(null);
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="trash-outline" size={16} color={'rgba(239,68,68,0.95)'} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Column selection when editing (kept same logic, improved styling) */}
                    {editingGap === gapKey && (
                      <View style={[styles.columnSelectionContainer, { borderColor: ui.borderSoft, backgroundColor: '#fafafa' }]}>
                        <Text style={[styles.columnSelectionTitle, { color: ui.text }]}>בחר עמודות למרווח</Text>
                        <View style={styles.columnCheckboxes}>
                          {columns.map((_, columnIndex) => {
                            const isSelected = gapInfo.columns.has(columnIndex);
                            return (
                              <TouchableOpacity
                                key={columnIndex}
                                style={[
                                  styles.columnCheckbox,
                                  { borderColor: 'rgba(17,24,39,0.12)', backgroundColor: '#fff' },
                                  isSelected && { backgroundColor: ui.primary, borderColor: ui.primary }
                                ]}
                                onPress={() => {
                                  const newGaps = new Map(horizontalGaps);
                                  const currentGap = newGaps.get(gapKey)!;
                                  const newColumns = new Set(currentGap.columns);
                                  if (isSelected) newColumns.delete(columnIndex);
                                  else newColumns.add(columnIndex);
                                  if (newColumns.size > 0) {
                                    newGaps.set(gapKey, { ...currentGap, columns: newColumns });
                                    setHorizontalGaps(newGaps);
                                  }
                                }}
                                activeOpacity={0.9}
                              >
                                <Text
                                  style={[
                                    styles.columnCheckboxText,
                                    { color: isSelected ? '#fff' : ui.text }
                                  ]}
                                >
                                  {isSelected ? '✓ ' : ''}עמודה {columnIndex + 1}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <TouchableOpacity
                          style={[styles.selectAllButton, { backgroundColor: ui.primary }]}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            const currentGap = newGaps.get(gapKey)!;
                            const allSelected = columns.length === gapInfo.columns.size;
                            newGaps.set(gapKey, {
                              ...currentGap,
                              columns: allSelected ? new Set([0]) : new Set(columns.map((_, idx) => idx))
                            });
                            setHorizontalGaps(newGaps);
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.selectAllButtonText}>
                            {columns.length === gapInfo.columns.size ? 'בטל הכל' : 'בחר הכל'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyRow}>
                <Ionicons name="walk-outline" size={22} color={'rgba(17,24,39,0.35)'} />
                <Text style={[styles.emptyRowText, { color: ui.muted }]}>אין מרווחים עדיין</Text>
              </View>
            )}
          </View>
        )}

        {/* Preview (do not change the sketch/map) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תצוגה מקדימה</Text>
          {renderPreview()}
        </View>

        {/* Secondary create/update button (kept for accessibility; header is primary) */}
        {tablesForEdit.length > 0 && (
          <View style={[styles.card, { backgroundColor: ui.card, borderColor: ui.borderSoft }]}>
            <TouchableOpacity
              style={[styles.primaryCta, { backgroundColor: ui.primary }, loading && { opacity: 0.7 }]}
              onPress={handleCreateMap}
              disabled={loading}
              activeOpacity={0.92}
            >
              <Ionicons name={existingMap ? 'refresh' : 'checkmark'} size={20} color="#fff" style={{ marginLeft: 10 }} />
              <Text style={styles.primaryCtaText}>
                {loading ? 'שומר...' : existingMap ? 'עדכן מפת הושבה' : 'צור מפת הושבה'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

type UiPalette = {
  primary: string;
  bg: string;
  card: string;
  canvas: string;
  text: string;
  muted: string;
  borderSoft: string;
  borderGlass: string;
  glassFill: string;
};

type SeatingFreeformMapProps = {
  ui: UiPalette;
  tables: BuiltTable[];
  loading: boolean;
  onBack: () => void;
  onSave: () => void;
  onAddTable: (kind: 'regular' | 'knight' | 'reserve', x: number, y: number) => void;
  onAddTablesBatch: (
    kind: 'regular' | 'knight' | 'reserve',
    count: number,
    layout: 'row' | 'column',
    x: number,
    y: number
  ) => void;
  onMoveTable: (tableId: number, x: number, y: number) => void;
  onPressTable: (tableId: number) => void;
  onRequestDeleteTable: (tableId: number) => void;
  setTabBarVisible: (isVisible: boolean) => void;
};

function SeatingFreeformMap({
  ui,
  tables,
  loading,
  onBack,
  onSave,
  onAddTable,
  onAddTablesBatch,
  onMoveTable,
  onPressTable,
  onRequestDeleteTable,
  setTabBarVisible,
}: SeatingFreeformMapProps) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const insets = useSafeAreaInsets();

  // Camera transform (screen space)
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraScale = useSharedValue(0.75);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(0.75);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchAnchorX = useSharedValue(0);
  const pinchAnchorY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Keep a JS snapshot of camera so "add table" uses latest view
  const cameraJsRef = useRef({ x: 0, y: 0, scale: 0.75 });
  const updateCameraSnapshot = useCallback((x: number, y: number, scale: number) => {
    cameraJsRef.current = { x, y, scale };
  }, []);

  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const [primarySelectedId, setPrimarySelectedId] = useState<number | null>(null);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    if (selectedIds.size === 0) setPrimarySelectedId(null);
  }, [selectedIds]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPrimarySelectedId(id);
  }, []);

  const selectSingle = useCallback((id: number) => {
    setSelectedIds(new Set([id]));
    setPrimarySelectedId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setPrimarySelectedId(null);
  }, []);

  // Hide tab bar while in full-screen map mode
  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  // Keep per-table mutable positions (not React state, for smooth drag).
  const posByIdRef = useRef(
    new Map<number, { x: SharedValue<number>; y: SharedValue<number> }>()
  );

  // Alignment guides (world-space). Visible only while dragging near alignment.
  const vGuideX = useSharedValue(0);
  const vGuideOpacity = useSharedValue(0);
  const hGuideY = useSharedValue(0);
  const hGuideOpacity = useSharedValue(0);

  const vGuideStyle = useAnimatedStyle(() => ({
    opacity: vGuideOpacity.value,
    transform: [{ translateX: vGuideX.value }],
  }));

  const hGuideStyle = useAnimatedStyle(() => ({
    opacity: hGuideOpacity.value,
    transform: [{ translateY: hGuideY.value }],
  }));

  const sizeById = useMemo(() => {
    const map = new Map<number, { w: number; h: number }>();
    for (const t of tables) {
      if (t.isKnight) map.set(t.id, { w: 68, h: 130 });
      else map.set(t.id, { w: 78, h: 78 });
    }
    return map;
  }, [tables]);

  // Group drag state (JS thread)
  const SNAP = 10;
  const groupAnchorIdRef = useRef<number | null>(null);
  const groupAnchorStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const groupStartByIdRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const beginDrag = useCallback(
    (anchorId: number) => {
      // Ensure anchor is selected
      if (multiSelect) {
        if (!selectedIdsRef.current.has(anchorId)) {
          setSelectedIds(prev => new Set(prev).add(anchorId));
        }
      } else {
        // Single selection mode: dragging selects only this table
        setSelectedIds(new Set([anchorId]));
      }
      setPrimarySelectedId(anchorId);

      const ids = Array.from(selectedIdsRef.current.size ? selectedIdsRef.current : new Set([anchorId]));
      // If selection hasn't updated yet (due to state async), force include anchor
      if (!ids.includes(anchorId)) ids.push(anchorId);

      groupAnchorIdRef.current = anchorId;
      groupStartByIdRef.current = new Map();

      // Snap starting positions and store them
      for (const id of ids) {
        const pos = posByIdRef.current.get(id);
        if (!pos) continue;
        const sx = Math.round(pos.x.value / SNAP) * SNAP;
        const sy = Math.round(pos.y.value / SNAP) * SNAP;
        pos.x.value = sx;
        pos.y.value = sy;
        groupStartByIdRef.current.set(id, { x: sx, y: sy });
      }

      const anchorPos = posByIdRef.current.get(anchorId);
      groupAnchorStartRef.current = {
        x: anchorPos ? Math.round(anchorPos.x.value / SNAP) * SNAP : 0,
        y: anchorPos ? Math.round(anchorPos.y.value / SNAP) * SNAP : 0,
      };
    },
    [multiSelect]
  );

  const bounds = useMemo(() => {
    if (!tables.length) {
      return { minX: 0, minY: 0, maxX: 1200, maxY: 800 };
    }
    const xs = tables.map(t => t.x);
    const ys = tables.map(t => t.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [tables]);

  const worldSize = useMemo(() => {
    const pad = 360;
    const w = Math.max(1400, bounds.maxX - bounds.minX + pad * 2);
    const h = Math.max(1000, bounds.maxY - bounds.minY + pad * 2);
    return { w, h, pad };
  }, [bounds]);

  // Shift world coordinates into stage space so negative X/Y remain visible.
  // StageSpace = WorldSpace + origin
  const origin = useMemo(() => {
    return {
      x: -bounds.minX + worldSize.pad,
      y: -bounds.minY + worldSize.pad,
    };
  }, [bounds.minX, bounds.minY, worldSize.pad]);

  const centerOnTables = useCallback(() => {
    const baseScale = 0.75;
    cameraScale.value = withTiming(baseScale, { duration: 180 });
    const centerWorldX = (bounds.minX + bounds.maxX) / 2;
    const centerWorldY = (bounds.minY + bounds.maxY) / 2;
    const tx = screenW / 2 - (centerWorldX + origin.x) * baseScale;
    const ty = screenH / 2 - (centerWorldY + origin.y) * baseScale;
    cameraX.value = withTiming(tx, { duration: 180 });
    cameraY.value = withTiming(ty, { duration: 180 });
    updateCameraSnapshot(tx, ty, baseScale);
  }, [
    bounds.maxX,
    bounds.maxY,
    bounds.minX,
    bounds.minY,
    cameraScale,
    cameraX,
    cameraY,
    origin.x,
    origin.y,
    screenH,
    screenW,
  ]);

  const focusWorldPoint = useCallback(
    (wx: number, wy: number) => {
      const s = cameraJsRef.current.scale || 0.75;
      const tx = screenW / 2 - (wx + origin.x) * s;
      const ty = screenH / 2 - (wy + origin.y) * s;
      cameraX.value = withTiming(tx, { duration: 180 });
      cameraY.value = withTiming(ty, { duration: 180 });
      updateCameraSnapshot(tx, ty, s);
    },
    [cameraX, cameraY, origin.x, origin.y, screenH, screenW, updateCameraSnapshot]
  );

  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    if (!tables.length) return;
    didInitRef.current = true;
    centerOnTables();
  }, [tables.length, centerOnTables]);

  // Sync mutable positions with latest prop values.
  useEffect(() => {
    const map = posByIdRef.current;
    const ids = new Set<number>(tables.map(t => t.id));

    for (const t of tables) {
      const existing = map.get(t.id);
      if (!existing) {
        map.set(t.id, { x: makeMutable(t.x), y: makeMutable(t.y) });
      } else {
        existing.x.value = t.x;
        existing.y.value = t.y;
      }
    }

    for (const id of Array.from(map.keys())) {
      if (!ids.has(id)) map.delete(id);
    }
  }, [tables]);

  const clearGuides = useCallback(() => {
    vGuideOpacity.value = withTiming(0, { duration: 90 });
    hGuideOpacity.value = withTiming(0, { duration: 90 });
  }, [hGuideOpacity, vGuideOpacity]);

  const updateGuides = useCallback(
    (dragId: number, x: number, y: number) => {
      const TOL = 8; // alignment tolerance in world-units
      const dragSize = sizeById.get(dragId) ?? { w: 78, h: 78 };

      const dragLeft = x;
      const dragRight = x + dragSize.w;
      const dragCx = x + dragSize.w / 2;
      const dragTop = y;
      const dragBottom = y + dragSize.h;
      const dragCy = y + dragSize.h / 2;

      let bestV: { diff: number; x: number } | null = null;
      let bestH: { diff: number; y: number } | null = null;

      for (const t of tables) {
        if (t.id === dragId) continue;

        const pos = posByIdRef.current.get(t.id);
        const ox = pos?.x.value ?? t.x ?? 0;
        const oy = pos?.y.value ?? t.y ?? 0;
        const sz = sizeById.get(t.id) ?? { w: 78, h: 78 };

        const left = ox;
        const right = ox + sz.w;
        const cx = ox + sz.w / 2;
        const top = oy;
        const bottom = oy + sz.h;
        const cy = oy + sz.h / 2;

        const vTargets = [left, cx, right];
        const vSources = [dragLeft, dragCx, dragRight];
        for (const s of vSources) {
          for (const target of vTargets) {
            const diff = Math.abs(s - target);
            if (diff <= TOL && (!bestV || diff < bestV.diff)) bestV = { diff, x: target };
          }
        }

        const hTargets = [top, cy, bottom];
        const hSources = [dragTop, dragCy, dragBottom];
        for (const s of hSources) {
          for (const target of hTargets) {
            const diff = Math.abs(s - target);
            if (diff <= TOL && (!bestH || diff < bestH.diff)) bestH = { diff, y: target };
          }
        }
      }

      if (bestV) {
        // Store stage-space coordinate so the guide aligns with shifted content.
        vGuideX.value = bestV.x + origin.x;
        vGuideOpacity.value = withTiming(1, { duration: 60 });
      } else {
        vGuideOpacity.value = withTiming(0, { duration: 90 });
      }

      if (bestH) {
        // Store stage-space coordinate so the guide aligns with shifted content.
        hGuideY.value = bestH.y + origin.y;
        hGuideOpacity.value = withTiming(1, { duration: 60 });
      } else {
        hGuideOpacity.value = withTiming(0, { duration: 90 });
      }
    },
    [hGuideOpacity, hGuideY, origin.x, origin.y, sizeById, tables, vGuideOpacity, vGuideX]
  );

  const updateGroupDrag = useCallback(
    (anchorId: number, anchorX: number, anchorY: number) => {
      const selected = selectedIdsRef.current;
      const anchorStart = groupAnchorStartRef.current;
      const dx = anchorX - anchorStart.x;
      const dy = anchorY - anchorStart.y;

      const ids = selected.size ? Array.from(selected) : [anchorId];

      // Move other selected tables by same delta
      for (const id of ids) {
        if (id === anchorId) continue;
        const start = groupStartByIdRef.current.get(id);
        const pos = posByIdRef.current.get(id);
        if (!start || !pos) continue;
        pos.x.value = start.x + dx;
        pos.y.value = start.y + dy;
      }

      updateGuides(anchorId, anchorX, anchorY);
    },
    [updateGuides]
  );

  const commitGroupDrag = useCallback(
    (anchorId: number, anchorX: number, anchorY: number) => {
      const selected = selectedIdsRef.current;
      const ids = selected.size ? Array.from(selected) : [anchorId];

      // Commit all selected positions to React state (via onMoveTable)
      for (const id of ids) {
        const pos = posByIdRef.current.get(id);
        const x = id === anchorId ? anchorX : Math.round((pos?.x.value ?? 0) / SNAP) * SNAP;
        const y = id === anchorId ? anchorY : Math.round((pos?.y.value ?? 0) / SNAP) * SNAP;
        onMoveTable(id, x, y);
      }

      clearGuides();
    },
    [clearGuides, onMoveTable]
  );

  const clampCameraToWorld = useCallback(
    (tx: number, ty: number, s: number) => {
      'worklet';
      const margin = 80; // small breathing room so it doesn't feel "stuck"
      const scaledW = worldSize.w * s;
      const scaledH = worldSize.h * s;

      let minTx = screenW - scaledW - margin;
      let maxTx = margin;
      if (minTx > maxTx) {
        const mid = (minTx + maxTx) / 2;
        minTx = mid;
        maxTx = mid;
      }

      let minTy = screenH - scaledH - margin;
      let maxTy = margin;
      if (minTy > maxTy) {
        const mid = (minTy + maxTy) / 2;
        minTy = mid;
        maxTy = mid;
      }

      return {
        x: clamp(tx, minTx, maxTx),
        y: clamp(ty, minTy, maxTy),
      };
    },
    [screenH, screenW, worldSize.h, worldSize.w]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Don't allow 2-finger pan to fight with pinch-zoom.
        .maxPointers(1)
        .onBegin(() => {
          panStartX.value = cameraX.value;
          panStartY.value = cameraY.value;
        })
        .onUpdate(e => {
          if (isDragging.value) return;
          const nextX = panStartX.value + e.translationX;
          const nextY = panStartY.value + e.translationY;
          const s = cameraScale.value || 1;
          const clamped = clampCameraToWorld(nextX, nextY, s);
          cameraX.value = clamped.x;
          cameraY.value = clamped.y;
        })
        .onEnd(() => {
          const s = cameraScale.value || 1;
          const clamped = clampCameraToWorld(cameraX.value, cameraY.value, s);
          cameraX.value = withTiming(clamped.x, { duration: 140 });
          cameraY.value = withTiming(clamped.y, { duration: 140 });
          runOnJS(updateCameraSnapshot)(clamped.x, clamped.y, s);
        })
        .onFinalize(() => {
          const s = cameraScale.value || 1;
          const clamped = clampCameraToWorld(cameraX.value, cameraY.value, s);
          cameraX.value = withTiming(clamped.x, { duration: 140 });
          cameraY.value = withTiming(clamped.y, { duration: 140 });
          runOnJS(updateCameraSnapshot)(clamped.x, clamped.y, s);
        }),
    [cameraScale, cameraX, cameraY, clampCameraToWorld, isDragging, panStartX, panStartY, updateCameraSnapshot]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin((e) => {
          pinchStartScale.value = cameraScale.value;
          pinchStartX.value = cameraX.value;
          pinchStartY.value = cameraY.value;
          // Center-zoom: keep the screen center stable (no left/right drift).
          // We intentionally ignore focalX/focalY for a "straight line" zoom.
          pinchAnchorX.value = screenW / 2;
          pinchAnchorY.value = screenH / 2;
        })
        .onUpdate(e => {
          if (isDragging.value) return;
          const startScale = pinchStartScale.value || 1;
          const nextScale = clamp(startScale * e.scale, 0.4, 3);

          // Zoom around a fixed anchor captured onBegin.
          const ax = pinchAnchorX.value || screenW / 2;
          const ay = pinchAnchorY.value || screenH / 2;
          const ratio = nextScale / startScale;

          const nextX = ax - (ax - pinchStartX.value) * ratio;
          const nextY = ay - (ay - pinchStartY.value) * ratio;

          cameraScale.value = nextScale;
          // Don't clamp during pinch updates (it feels like "side drift").
          // We'll clamp onEnd/onFinalize instead.
          cameraX.value = nextX;
          cameraY.value = nextY;
        })
        .onEnd(() => {
          const s = cameraScale.value || 1;
          const clamped = clampCameraToWorld(cameraX.value, cameraY.value, s);
          cameraX.value = withTiming(clamped.x, { duration: 140 });
          cameraY.value = withTiming(clamped.y, { duration: 140 });
          runOnJS(updateCameraSnapshot)(clamped.x, clamped.y, s);
        })
        .onFinalize(() => {
          const s = cameraScale.value || 1;
          const clamped = clampCameraToWorld(cameraX.value, cameraY.value, s);
          cameraX.value = withTiming(clamped.x, { duration: 140 });
          cameraY.value = withTiming(clamped.y, { duration: 140 });
          runOnJS(updateCameraSnapshot)(clamped.x, clamped.y, s);
        }),
    [
      cameraScale,
      cameraX,
      cameraY,
      clampCameraToWorld,
      isDragging,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      screenH,
      screenW,
      updateCameraSnapshot,
    ]
  );

  const canvasGesture = useMemo(() => Gesture.Simultaneous(panGesture, pinchGesture), [panGesture, pinchGesture]);

  const stageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        // IMPORTANT: scale first, then translate.
        // This keeps screen<->world math consistent: world = (screen - translate) / scale
        { scale: cameraScale.value },
        { translateX: cameraX.value },
        { translateY: cameraY.value },
      ],
    };
  });

  const addAtCenter = useCallback(
    (kind: 'regular' | 'knight' | 'reserve') => {
      const s = cameraScale.value || 1;
      // Convert screen-center -> world, then remove origin shift.
      const worldX = (screenW / 2 - cameraX.value) / s - origin.x;
      const worldY = (screenH / 2 - cameraY.value) / s - origin.y;
      onAddTable(kind, Math.round(worldX), Math.round(worldY));
    },
    // Do not include `.value` in deps; it triggers Reanimated strict-mode warnings.
    [cameraScale, cameraX, cameraY, onAddTable, origin.x, origin.y, screenH, screenW]
  );

  // Add flow modal (count -> layout if needed)
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<'count' | 'layout'>('count');
  const [addKind, setAddKind] = useState<'regular' | 'knight' | 'reserve'>('regular');
  const [addCount, setAddCount] = useState(1);
  const [addLayout, setAddLayout] = useState<'row' | 'column'>('row');

  const openAddFlow = useCallback((kind: 'regular' | 'knight' | 'reserve') => {
    setAddKind(kind);
    setAddCount(1);
    setAddLayout('row');
    setAddStep('count');
    setAddOpen(true);
  }, []);

  const confirmAddFlow = useCallback(() => {
    const count = Math.max(1, Math.min(200, addCount || 1));
    // Use JS camera snapshot so we don't accidentally add to (0,0) if shared values are stale on JS thread.
    const { x: cx, y: cy, scale: cs } = cameraJsRef.current;
    // Convert screen-center -> world, then remove origin shift. Snap to 10 world-units.
    const baseX = Math.round((((screenW / 2 - cx) / cs - origin.x) / 10)) * 10;
    const baseY = Math.round((((screenH / 2 - cy) / cs - origin.y) / 10)) * 10;

    if (count <= 1) {
      onAddTable(addKind, baseX, baseY);
      focusWorldPoint(baseX, baseY);
      setAddOpen(false);
      return;
    }

    // If we are at count step, move to layout step first
    if (addStep === 'count') {
      setAddStep('layout');
      return;
    }

    onAddTablesBatch(addKind, count, addLayout, baseX, baseY);
    // Focus on center of the new group so it's obvious where it was added
    const isKnight = addKind === 'knight';
    const w = isKnight ? 68 : 78;
    const h = isKnight ? 130 : 78;
    const gap = 26;
    const stepX = addLayout === 'row' ? w + gap : 0;
    const stepY = addLayout === 'column' ? h + gap : 0;
    focusWorldPoint(baseX + ((count - 1) * stepX) / 2, baseY + ((count - 1) * stepY) / 2);
    setAddOpen(false);
  }, [addCount, addKind, addLayout, addStep, focusWorldPoint, onAddTable, onAddTablesBatch, origin.x, origin.y, screenH, screenW]);

  const cancelAddFlow = useCallback(() => {
    if (addStep === 'layout') {
      setAddStep('count');
      return;
    }
    setAddOpen(false);
  }, [addStep]);

  type FabItem = {
    key:
      | 'add-regular'
      | 'add-reserve'
      | 'add-knight'
      | 'multi'
      ;
    color: string;
  };

  const [fabOpen, setFabOpen] = useState(false);

  const menuItems: FabItem[] = useMemo(
    () => [
      // Only the requested options
      { key: 'add-regular', color: '#2b8cee' }, // שולחן (מרובע)
      { key: 'add-knight', color: '#111827' }, // אביר (מלבני)
      { key: 'add-reserve', color: '#7c3aed' }, // רזרבה (מרובע + ?)
      { key: 'multi', color: '#0ea5e9' }, // בחירה מרובה (checkbox)
    ],
    [multiSelect]
  );

  const renderFabItemIcon = useCallback(
    (item: FabItem, size: number) => {
      const stroke = Math.max(2, Math.round(size * 0.11));
      const sq = Math.round(size * 0.86);
      const rectW = Math.round(size * 1.08);
      const rectH = Math.round(size * 0.64);
      const badge = Math.round(size * 0.46);

      const SquareIcon = ({ withBadge }: { withBadge?: boolean }) => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: sq,
              height: sq,
              borderRadius: 10,
              borderWidth: stroke,
              borderColor: '#fff',
              opacity: 0.95,
            }}
          />
          {withBadge ? (
            <View
              style={{
                position: 'absolute',
                // Place the "?" badge centered inside the table icon
                top: (size - sq) / 2 + (sq - badge) / 2,
                left: (size - sq) / 2 + (sq - badge) / 2,
                width: badge,
                height: badge,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.92)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: '#111827',
                  fontWeight: '900',
                  // Make the glyph center reliably: fill the circle with lineHeight == height
                  width: badge,
                  height: badge,
                  fontSize: Math.round(badge * 0.62),
                  lineHeight: badge,
                  textAlign: 'center',
                  includeFontPadding: false,
                }}
              >
                ?
              </Text>
            </View>
          ) : null}
        </View>
      );

      const RectIcon = () => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: rectW,
              height: rectH,
              borderRadius: 12,
              borderWidth: stroke,
              borderColor: '#fff',
              opacity: 0.95,
            }}
          />
        </View>
      );

      const MultiSelectIcon = ({ active }: { active: boolean }) => (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: sq,
              height: sq,
              borderRadius: 10,
              borderWidth: stroke,
              borderColor: '#fff',
              opacity: 0.95,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Check mark (always visible for "multi select" icon; dim when inactive) */}
            <View
              style={{
                width: sq * 0.34,
                height: sq * 0.20,
                borderLeftWidth: stroke,
                borderBottomWidth: stroke,
                borderColor: '#fff',
                transform: [{ rotate: '-45deg' }],
                opacity: active ? 1 : 0.7,
                marginTop: sq * 0.02,
              }}
            />
          </View>
        </View>
      );

      switch (item.key) {
        case 'add-regular':
          return <SquareIcon />;
        case 'add-knight':
          return <RectIcon />;
        case 'add-reserve':
          return <SquareIcon withBadge />;
        case 'multi':
          return <MultiSelectIcon active={multiSelect} />;
      }
    },
    [multiSelect]
  );

  const fabItemLabel = useCallback((item: FabItem) => {
    switch (item.key) {
      case 'add-regular':
        return 'שולחן';
      case 'add-knight':
        return 'אביר';
      case 'add-reserve':
        return 'רזרבה';
      case 'multi':
        return 'בחירה';
    }
  }, []);

  const onFabPress = useCallback(
    (item: FabItem) => {
      setFabOpen(false);
      switch (item.key) {
        case 'add-regular':
          openAddFlow('regular');
          break;
        case 'add-knight':
          openAddFlow('knight');
          break;
        case 'add-reserve':
          openAddFlow('reserve');
          break;
        case 'multi':
          setMultiSelect(v => !v);
          clearSelection();
          break;
      }
    },
    [clearSelection, openAddFlow]
  );

  const FAB_SIZE = 62;
  const FAB_OFFSET = 4;

  const header = (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: Math.max(8, insets.top + 8),
        zIndex: 50,
      }}
    >
      <View style={{ paddingHorizontal: 14 }}>
        <View
          style={{
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: ui.borderSoft,
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.85}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderWidth: 1,
              borderColor: ui.borderSoft,
            }}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <Ionicons name="chevron-forward" size={22} color={ui.primary} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: ui.text }}>מצב מפה</Text>
            <Text style={{ fontSize: 12, color: ui.muted, marginTop: 2 }}>לחיצה ארוכה על שולחן ואז גרירה</Text>
          </View>

          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={centerOnTables}
              activeOpacity={0.85}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderWidth: 1,
                borderColor: ui.borderSoft,
              }}
              accessibilityRole="button"
              accessibilityLabel="מרכז מפה"
            >
              <Ionicons name="locate" size={20} color={ui.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSave}
              disabled={loading}
              activeOpacity={0.9}
              style={{
                paddingHorizontal: 14,
                height: 40,
                borderRadius: 12,
                backgroundColor: ui.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel="שמור"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>שמור</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  const fabMenu = (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: 80,
      }}
    >
      <View style={{ paddingBottom: Math.max(insets.bottom + 16, 16), alignItems: 'center' }}>
      {/* menu items open above the FAB */}
      <View style={{ position: 'absolute' }}>
        {menuItems.map((menuItem, index) => {
          // Even, symmetric spread (works for even/odd counts)
          const n = menuItems.length;
          const totalAngle = Math.PI * 0.75; // overall arc (≈135deg)
          const offsetAngle = totalAngle / Math.max(1, n - 1);
          const radius = FAB_SIZE * 1.35;
          const midPoint = (n - 1) / 2; // fractional midpoint for even counts
          const reflectedIndex = index - midPoint; // 4 => [-1.5,-0.5,0.5,1.5]
          const iconSize = FAB_SIZE * 0.40;
          const webTranslateX =
            Math.sin(reflectedIndex * offsetAngle) * (fabOpen ? radius : FAB_OFFSET);
          const webTranslateY =
            -Math.cos(reflectedIndex * offsetAngle) * (fabOpen ? radius : FAB_OFFSET);
          return (
            Platform.OS === 'web' ? (
              <Pressable
                key={menuItem.key}
                onPress={() => onFabPress(menuItem)}
                style={{
                  position: 'absolute',
                  left: -FAB_SIZE / 2,
                  top: -FAB_SIZE / 2,
                  width: FAB_SIZE,
                  height: FAB_SIZE,
                  borderRadius: FAB_SIZE / 2,
                  backgroundColor: menuItem.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.16,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 8,
                  opacity: fabOpen ? 1 : 0,
                  transform: [
                    { translateX: webTranslateX },
                    { translateY: webTranslateY },
                    { scale: fabOpen ? 1 : 0.6 },
                  ],
                }}
                accessibilityRole="button"
                accessibilityLabel={fabItemLabel(menuItem)}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {renderFabItemIcon(menuItem, iconSize)}
                  <Text
                    style={{
                      marginTop: 4,
                      color: 'rgba(255,255,255,0.92)',
                      fontWeight: '700',
                      fontSize: 10,
                      letterSpacing: -0.2,
                    }}
                    numberOfLines={1}
                  >
                    {fabItemLabel(menuItem)}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <MotiPressable
                key={menuItem.key}
                onPress={() => onFabPress(menuItem)}
                animate={{
                  translateX:
                    Math.sin(reflectedIndex * offsetAngle) * (fabOpen ? radius : FAB_OFFSET),
                  translateY:
                    -Math.cos(reflectedIndex * offsetAngle) * (fabOpen ? radius : FAB_OFFSET),
                  opacity: fabOpen ? 1 : 0,
                  scale: fabOpen ? 1 : 0.6,
                }}
                style={{
                  position: 'absolute',
                  left: -FAB_SIZE / 2,
                  top: -FAB_SIZE / 2,
                  width: FAB_SIZE,
                  height: FAB_SIZE,
                  borderRadius: FAB_SIZE / 2,
                  backgroundColor: menuItem.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.16,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 8,
                }}
                transition={{
                  delay: index * 60,
                  type: 'timing',
                  duration: 320,
                }}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {renderFabItemIcon(menuItem, iconSize)}
                  <Text
                    style={{
                      marginTop: 4,
                      color: 'rgba(255,255,255,0.92)',
                      fontWeight: '700',
                      fontSize: 10,
                      letterSpacing: -0.2,
                    }}
                    numberOfLines={1}
                  >
                    {fabItemLabel(menuItem)}
                  </Text>
                </View>
              </MotiPressable>
            )
          );
        })}
      </View>

      {Platform.OS === 'web' ? (
        <Pressable
          onPress={() => setFabOpen(v => !v)}
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: '#1D1520',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
            transform: [{ rotate: fabOpen ? '0deg' : '-45deg' }],
          }}
          accessibilityRole="button"
          accessibilityLabel="פעולות"
        >
          <Feather name="x" size={FAB_SIZE * 0.42} color="#fff" />
        </Pressable>
      ) : (
        <MotiPressable
          onPress={() => setFabOpen(v => !v)}
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: '#1D1520',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
          }}
          animate={{
            rotate: fabOpen ? '0deg' : '-45deg',
          }}
          transition={{ type: 'timing', duration: 260 }}
        >
          <Feather name="x" size={FAB_SIZE * 0.42} color="#fff" />
        </MotiPressable>
      )}
      </View>
    </View>
  );

  const stage = (
    <Animated.View
      style={[
        {
          width: worldSize.w,
          height: worldSize.h,
          backgroundColor: ui.canvas,
        },
        stageStyle,
      ]}
    >
      {/* Dot-grid background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="dotGridMap" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <Circle cx="1.6" cy="1.6" r="1.6" fill="#cbd5e1" opacity={0.7} />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dotGridMap)" opacity={0.55} />
        </Svg>
      </View>

      {/* Alignment guides (appear only near other tables while dragging) */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: 'rgba(43,140,238,0.95)',
            borderRadius: 2,
          },
          vGuideStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: 'rgba(43,140,238,0.95)',
            borderRadius: 2,
          },
          hGuideStyle,
        ]}
      />

      {tables.map(t => {
        const map = posByIdRef.current;
        const pos = map.get(t.id) ?? (() => {
          const created = { x: makeMutable(t.x), y: makeMutable(t.y) };
          map.set(t.id, created);
          return created;
        })();

        const kind: 'square' | 'knight' | 'reserve' = t.isReserve ? 'reserve' : t.isKnight ? 'knight' : 'square';
        const isSelected = selectedIds.has(t.id);

        return (
          <DraggableTableNode
            key={t.id}
            id={t.id}
            kind={kind}
            seats={t.seats}
            selected={selectedIds.has(t.id)}
            ui={ui}
            originX={origin.x}
            originY={origin.y}
            posX={pos.x}
            posY={pos.y}
            cameraScale={cameraScale}
            isDragging={isDragging}
            multiSelect={multiSelect}
            onTap={(id) => {
              if (multiSelect) toggleSelected(id);
              else {
                // Tap selects only; type selection is done via the blue button below
                selectSingle(id);
              }
            }}
            onDragBegin={beginDrag}
            onDragUpdate={updateGroupDrag}
            onDragCommit={commitGroupDrag}
            onDragEnd={clearGuides}
            onDoubleTap={onRequestDeleteTable}
          />
        );
      })}
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: ui.bg }}>
      {header}
      <GestureDetector gesture={canvasGesture}>
        <View style={{ flex: 1, overflow: 'hidden', backgroundColor: ui.canvas }}>
          {stage}
        </View>
      </GestureDetector>
      {fabMenu}

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 }}>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: ui.borderSoft,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '900', color: ui.text, textAlign: 'right' }}>
              {addStep === 'count' ? 'כמה שולחנות להוסיף?' : 'איך להוסיף את השולחנות?'}
            </Text>

            {addStep === 'count' ? (
              <>
                <Text style={{ marginTop: 10, color: ui.muted, textAlign: 'right' }}>
                  בחר כמות ואז המשך.
                </Text>
                <View
                  style={{
                    marginTop: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row-reverse',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 16,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      backgroundColor: 'rgba(17,24,39,0.04)',
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setAddCount(c => Math.max(1, c - 1))}
                      onLongPress={() => setAddCount(c => Math.max(1, c - 5))}
                      activeOpacity={0.9}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: ui.borderSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="הפחת כמות"
                    >
                      <Ionicons name="remove" size={22} color={ui.text} />
                    </TouchableOpacity>

                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 34, fontWeight: '900', color: ui.text, letterSpacing: -0.6 }}>
                        {addCount}
                      </Text>
                      <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: ui.muted }}>
                        שולחנות
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => setAddCount(c => Math.min(200, c + 1))}
                      onLongPress={() => setAddCount(c => Math.min(200, c + 5))}
                      activeOpacity={0.9}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: ui.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף כמות"
                    >
                      <Ionicons name="add" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ marginTop: 8, color: ui.muted, fontSize: 12, textAlign: 'right' }}>
                    לחיצה ארוכה על +/− משנה ב־5
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={{ marginTop: 10, color: ui.muted, textAlign: 'right' }}>
                  אם בחרת יותר מאחד—אפשר להוסיף אותם בשורה או בטור.
                </Text>
                <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => setAddLayout('row')}
                    activeOpacity={0.9}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: addLayout === 'row' ? ui.primary : ui.borderSoft,
                      backgroundColor: addLayout === 'row' ? 'rgba(43,140,238,0.12)' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontWeight: '900', color: ui.text }}>שורה</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAddLayout('column')}
                    activeOpacity={0.9}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: addLayout === 'column' ? ui.primary : ui.borderSoft,
                      backgroundColor: addLayout === 'column' ? 'rgba(43,140,238,0.12)' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontWeight: '900', color: ui.text }}>טור</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={confirmAddFlow}
                activeOpacity={0.9}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: ui.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '900', color: '#fff' }}>
                  {addStep === 'count' && addCount > 1 ? 'המשך' : 'הוסף'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={cancelAddFlow}
                activeOpacity={0.9}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: 'rgba(17,24,39,0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '900', color: ui.text }}>
                  {addStep === 'layout' ? 'חזרה' : 'ביטול'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const miniBtnText = { color: '#fff', fontWeight: '800', fontSize: 12, marginRight: 6 } as const;
function miniBtn(bg: string) {
  return {
    flexDirection: 'row-reverse' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: bg,
  };
}

function iconOnlyBtn(border: string) {
  return {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: border,
  };
}

type DraggableTableNodeProps = {
  id: number;
  kind: 'square' | 'knight' | 'reserve';
  seats: number;
  selected: boolean;
  ui: UiPalette;
  originX: number;
  originY: number;
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  multiSelect: boolean;
  onTap: (id: number) => void;
  onDragBegin: (id: number) => void;
  onDragUpdate: (id: number, x: number, y: number) => void;
  onDragCommit: (id: number, x: number, y: number) => void;
  onDragEnd: () => void;
  onDoubleTap: (id: number) => void;
};

function DraggableTableNode({
  id,
  kind,
  seats,
  selected,
  ui,
  originX,
  originY,
  posX,
  posY,
  cameraScale,
  isDragging,
  multiSelect,
  onTap,
  onDragBegin,
  onDragUpdate,
  onDragCommit,
  onDragEnd,
  onDoubleTap,
}: DraggableTableNodeProps) {
  const SNAP = 10; // "ריבועים" בלתי נראים: הצמדה כל 10px במרחב המפה
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const lastGuideX = useSharedValue(0);
  const lastGuideY = useSharedValue(0);

  const tableSize = useMemo(() => {
    if (kind === 'knight') return { w: 68, h: 130 };
    return { w: 78, h: 78 };
  }, [kind]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(260)
        // Use onStart (ACTIVE) instead of onBegin (BEGAN) so taps won't "flash select".
        .onStart(() => {
          isDragging.value = true;
          dragStartX.value = posX.value;
          dragStartY.value = posY.value;
          lastGuideX.value = posX.value;
          lastGuideY.value = posY.value;
          runOnJS(onDragBegin)(id);
        })
        .onUpdate(e => {
          const s = cameraScale.value || 1;
          const rawX = dragStartX.value + e.translationX / s;
          const rawY = dragStartY.value + e.translationY / s;
          // Snap-to-grid ("pixels") in world-space so alignment is exact
          posX.value = Math.round(rawX / SNAP) * SNAP;
          posY.value = Math.round(rawY / SNAP) * SNAP;

          // Update alignment guides, but don't spam JS every tiny move
          if (Math.abs(posX.value - lastGuideX.value) >= 2 || Math.abs(posY.value - lastGuideY.value) >= 2) {
            lastGuideX.value = posX.value;
            lastGuideY.value = posY.value;
            runOnJS(onDragUpdate)(id, posX.value, posY.value);
          }
        })
        .onEnd(() => {
          isDragging.value = false;
          // Ensure final position is snapped and persisted
          const snappedX = Math.round(posX.value / SNAP) * SNAP;
          const snappedY = Math.round(posY.value / SNAP) * SNAP;
          posX.value = snappedX;
          posY.value = snappedY;
          runOnJS(onDragUpdate)(id, snappedX, snappedY);
          runOnJS(onDragCommit)(id, snappedX, snappedY);
          runOnJS(onDragEnd)();
        })
        .onFinalize(() => {
          isDragging.value = false;
          runOnJS(onDragEnd)();
        }),
    [cameraScale, dragStartX, dragStartY, id, isDragging, lastGuideX, lastGuideY, onDragBegin, onDragCommit, onDragEnd, onDragUpdate, posX, posY]
  );

  // Use a native Tap gesture for reliable multi-select (Pressable can be swallowed by Pan handlers)
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(220) // must be shorter than long-press activation
        .maxDistance(12)
        .onEnd(() => {
          runOnJS(onTap)(id);
        }),
    [id, onTap]
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(220)
        .maxDistance(16)
        .onEnd(() => {
          runOnJS(onDoubleTap)(id);
        }),
    [id, onDoubleTap]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(dragGesture, Gesture.Exclusive(doubleTapGesture, tapGesture)),
    [doubleTapGesture, dragGesture, tapGesture]
  );

  const nodeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: posX.value + originX }, { translateY: posY.value + originY }],
    };
  });

  const bg =
    kind === 'reserve' ? '#7c3aed' : kind === 'knight' ? '#111827' : 'rgba(255,255,255,0.92)';
  const borderColor = selected ? ui.primary : kind === 'reserve' ? 'rgba(124,58,237,0.25)' : ui.borderSoft;
  const textColor = kind === 'reserve' || kind === 'knight' ? '#fff' : ui.text;
  const subTextColor = kind === 'reserve' || kind === 'knight' ? 'rgba(255,255,255,0.85)' : ui.muted;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: tableSize.w,
            height: tableSize.h,
            borderRadius: 14,
            backgroundColor: bg,
            borderWidth: selected ? 2 : 1,
            borderColor,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          },
          nodeStyle,
        ]}
      >
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: textColor, fontWeight: '900', fontSize: 16 }}>#{id}</Text>
          <Text style={{ color: subTextColor, fontWeight: '800', fontSize: 12, marginTop: 2 }}>
            {seats} מקומות
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.5)',
  },
  headerBlur: {
    width: '100%',
  },
  headerInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSaveBtn: {
    height: 40,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b8cee',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  headerSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },

  // New modern cards (do not reuse for preview section)
  card: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  pillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillChipText: {
    fontSize: 12,
    fontWeight: '800',
  },

  toolbarPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  toolbarIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(17,24,39,0.10)',
    marginHorizontal: 8,
  },
  counterPill: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  counterPillBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.06)',
  },
  counterPillValue: {
    width: 34,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
  },
  toolbarFab: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b8cee',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  spacer12: { height: 12 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 10,
  },
  segmentWrap: {
    flexDirection: 'row-reverse',
    padding: 6,
    borderRadius: 18,
    backgroundColor: '#f0f2f4',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.55)',
  },
  segmentTextActive: {
    color: '#111418',
    fontWeight: '900',
  },

  linkDanger: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  linkDangerText: {
    color: 'rgba(239,68,68,0.95)',
    fontSize: 12,
    fontWeight: '900',
  },

  listWrap: { gap: 10 },
  listItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(249,250,251,0.70)',
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1 },
  listTitle: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  listSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  trashCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  summaryRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTextModern: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryTextModernStrong: {
    fontSize: 13,
    fontWeight: '900',
  },

  smallPrimaryBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b8cee',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  helpText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 10,
  },
  gapsList: { gap: 10 },
  gapBlock: {},
  gapRowModern: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(249,250,251,0.70)',
  },
  gapMain: { flex: 1, paddingLeft: 10 },
  gapTitleModern: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  gapSubModern: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  gapActionsModern: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(17,24,39,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeChip: {
    minWidth: 42,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  emptyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 8,
  },
  emptyRowText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },

  primaryCta: {
    height: 56,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2b8cee',
    shadowOpacity: 0.20,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  primaryCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  // Legacy section (used by the preview area; keep its look stable)
  section: {
    backgroundColor: colors.white,
    marginHorizontal: 4,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  emptyPreview: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyPreviewText: {
    marginTop: 10,
    fontSize: 16,
    color: colors.textLight,
  },
  hallVisualization: {
    backgroundColor: '#f2f2f7',
    borderRadius: 24,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.10)',
    minHeight: PREVIEW_MAP_HEIGHT + 50,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  tablesAreaContainer: {
    flex: 1,
    minHeight: PREVIEW_MAP_HEIGHT,
  },
  tablesAreaContent: {
    flexGrow: 1,
  },
  tablesArea: {
    position: 'relative',
    minHeight: PREVIEW_MAP_HEIGHT - 40,
    padding: 24,
  },

  // Map preview chrome (inspired by mock)
  zoomPill: {
    position: 'absolute',
    left: 14,
    top: 14,
    zIndex: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  zoomPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.62)',
  },
  stagePill: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  stageIcon: {
    width: 22,
    height: 22,
    borderRadius: 10,
    backgroundColor: 'rgba(43,140,238,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagePillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111418',
  },

  // Table cards (keeps the same absolute positioning logic)
  tableCard: {
    position: 'absolute',
    width: 44,
    height: 44, // default: square
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tableCardKnight: {
    backgroundColor: 'rgba(204,160,0,0.08)',
    borderColor: 'rgba(204,160,0,0.35)',
    // Knight table: vertical rectangle
    width: 38,
    height: 58,
  },
  tableCardReserve: {
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderColor: 'rgba(17,24,39,0.35)',
  },
  tableCardSelected: {
    borderWidth: 2,
    borderColor: 'rgba(43,140,238,0.95)',
    backgroundColor: 'rgba(43,140,238,0.08)',
    transform: [{ scale: 1.06 }],
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  selectedDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(43,140,238,0.95)',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tableLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.45)',
    textAlign: 'center',
  },
  tableLabelSelected: {
    color: 'rgba(43,140,238,0.95)',
  },
  tableLabelOnDark: {
    color: 'rgba(255,255,255,0.80)',
  },
  seatDotsRow: {
    marginTop: 3,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatDotsRowMuted: {
    opacity: 0.35,
  },
  seatDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.70)',
  },
  seatDotSelected: {
    backgroundColor: 'rgba(43,140,238,0.55)',
  },
  seatDotOnDark: {
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  centerAisle: {},
  aisleLabel: {},
  columnSelectionContainer: {
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
  },
  columnSelectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 12,
  },
  columnCheckboxes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginBottom: 15,
  },
  columnCheckbox: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 4,
    minWidth: 80,
  },
  columnCheckboxText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectAllButton: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignSelf: 'center',
  },
  selectAllButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // kept placeholders referenced by renderPreview
}); 