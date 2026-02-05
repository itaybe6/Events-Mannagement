import React, { useState } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { BlurView } from 'expo-blur';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

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
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [existingMap, setExistingMap] = useState<any>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

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

  // Load existing seating map if available
  React.useEffect(() => {
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
    return columns.reduce((total, column) => total + column.tablesCount, 0);
  };

  const getTotalSeats = () => {
    const tables = generateTablesFromColumns();
    return tables.reduce((total, table) => total + table.seats, 0);
  };

  const handleCreateMap = async () => {
    if (columns.length === 0) {
      Alert.alert('שגיאה', 'נא להוסיף לפחות עמודה אחת של שולחנות');
      return;
    }

    setLoading(true);
    try {
      const tables = generateTablesFromColumns();
      
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
    // Create the seating map with all table details
    const { data: seatingMapData, error: seatingMapError } = await supabase
      .from('seating_maps')
      .insert({
        event_id: eventId,
        num_tables: tables.length,
        tables: tables, // This contains all the detailed table info including positions
        annotations: [],
      })
      .select('*')
      .single();

    if (seatingMapError) throw seatingMapError;

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
    // Update the seating map with all table details
    const { error: seatingMapError } = await supabase
      .from('seating_maps')
      .update({
        num_tables: tables.length,
        tables: tables, // This contains all the detailed table info including positions
        annotations: [],
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (seatingMapError) throw seatingMapError;

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
    const tables = generateTablesFromColumns();
    
    if (tables.length === 0) {
      return (
        <View style={styles.emptyPreview}>
          <Ionicons name="restaurant-outline" size={48} color={colors.gray[400]} />
          <Text style={styles.emptyPreviewText}>הוסף עמודות כדי לראות תצוגה מקדימה</Text>
        </View>
      );
    }

    // Preview layout: compute columns and give them explicit spacing,
    // so tables won't stick together horizontally on iPhone.
    const xPositions = [...new Set(tables.map(t => t.x))].sort((a, b) => b - a); // right -> left
    const columnIndexByX = new Map<number, number>(xPositions.map((x, idx) => [x, idx]));

    const BASE_COLUMN_GAP = 28; // gap between table cards (normal)
    const WIDE_COLUMN_GAP_EXTRA = 34; // extra gap when aisle === 'wide'
    const H_PADDING = 24;

    const xByColumnIndex: number[] = [];
    let nextLeft = H_PADDING;
    for (let i = 0; i < xPositions.length; i++) {
      xByColumnIndex[i] = nextLeft;
      const aisle = columns[i]?.aisle ?? 'normal';
      const gap = BASE_COLUMN_GAP + (aisle === 'wide' ? WIDE_COLUMN_GAP_EXTRA : 0);
      nextLeft += PREVIEW_TABLE_CARD_WIDTH + gap;
    }
    const totalWidth = Math.max(400, nextLeft + H_PADDING);

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
              const colIdx = columnIndexByX.get(table.x) ?? 0;
              const adjustedX = xByColumnIndex[colIdx] ?? H_PADDING;
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
                      top: (table.y / PREVIEW_MAP_Y_RANGE) * PREVIEW_MAP_HEIGHT,
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
        {columns.length > 0 && (
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