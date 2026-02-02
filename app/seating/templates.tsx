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
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

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

export default function SeatingTemplatesScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [existingMap, setExistingMap] = useState<any>(null);
  
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
    const VERTICAL_TABLE_SPACING = 90;

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
          onPress: () => router.push(`/seating/view-map?eventId=${eventId}`)
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

    // Calculate total width needed for all tables with proper padding
    const minX = Math.min(...tables.map(t => t.x));
    const maxX = Math.max(...tables.map(t => t.x));
    const paddingPerSide = 80; // מספיק מקום משני הצדדים
    const tablesSpread = maxX - minX;
    const totalWidth = Math.max(400, ((tablesSpread + paddingPerSide * 2) * 300) / 1200);

    return (
      <View style={styles.hallVisualization}>
        <View style={styles.stageArea}>
          <Text style={styles.stageText}>במה</Text>
        </View>
        
        <ScrollView 
          horizontal 
          style={styles.tablesAreaContainer}
          contentContainerStyle={[styles.tablesAreaContent, { width: totalWidth }]}
          showsHorizontalScrollIndicator={true}
          decelerationRate="normal"
          bounces={false}
        >
          <View style={[styles.tablesArea, { width: totalWidth, height: 450 }]}>
            {/* Render tables */}
            {tables.map((table) => {
              // Position tables with proper padding on left side
              const adjustedX = ((table.x - minX + paddingPerSide) / 1200) * 300;
              return (
                <TouchableOpacity
                  key={table.id}
                  onPress={() => toggleTableType(table.id)}
                  style={[
                    table.isReserve ? styles.reserveTable : 
                    table.isKnight ? styles.knightTable : styles.regularTable,
                    {
                      left: adjustedX,
                      top: (table.y / 800) * 450,
                    }
                  ]}
                >
                  <Text style={styles.tableNumber}>
                    {table.id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>בונה מפת הושבה</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Columns - moved to top */}
        {columns.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>עמודות נוכחיות</Text>
              <TouchableOpacity onPress={clearAll} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>מחק הכל</Text>
              </TouchableOpacity>
            </View>
            
            {columns.map((column, index) => (
              <View key={column.id} style={styles.columnItem}>
                <View style={styles.columnInfo}>
                  <Text style={styles.columnTitle}>עמודה {index + 1}</Text>
                  <Text style={styles.columnDetails}>
                    {column.tablesCount} שולחנות רגילים • 
                    מרווח {column.aisle === 'wide' ? 'רחב' : 'רגיל'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeColumn(column.id)}
                  style={styles.removeButton}
                >
                  <Ionicons name="trash" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Summary */}
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                סה"כ: {getTotalTables()} שולחנות • {getTotalSeats()} מקומות
              </Text>
            </View>
          </View>
        )}

        {/* Column Builder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הוסף עמודת שולחנות</Text>
          
          {/* Tables Count */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>מספר שולחנות בעמודה:</Text>
            <View style={styles.counterContainer}>
              <TouchableOpacity 
                style={styles.counterButton}
                onPress={() => setNewColumnTablesCount(Math.max(1, newColumnTablesCount - 1))}
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.counterValue}>{newColumnTablesCount}</Text>
              <TouchableOpacity 
                style={styles.counterButton}
                onPress={() => setNewColumnTablesCount(Math.min(10, newColumnTablesCount + 1))}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Aisle Spacing */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>מרווח לעמודה הבאה:</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newColumnAisle === 'normal' && styles.toggleButtonActive
                ]}
                onPress={() => setNewColumnAisle('normal')}
              >
                <Text style={[
                  styles.toggleText,
                  newColumnAisle === 'normal' && styles.toggleTextActive
                ]}>רגיל</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newColumnAisle === 'wide' && styles.toggleButtonActive
                ]}
                onPress={() => setNewColumnAisle('wide')}
              >
                <Text style={[
                  styles.toggleText,
                  newColumnAisle === 'wide' && styles.toggleTextActive
                ]}>רחב</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Add Column Button */}
          <TouchableOpacity
            style={styles.addColumnButton}
            onPress={addColumn}
          >
            <Ionicons name="add-circle" size={24} color={colors.white} style={{ marginLeft: 8 }} />
            <Text style={styles.addColumnButtonText}>הוסף עמודה</Text>
          </TouchableOpacity>
        </View>

        {/* Horizontal Gaps Section */}
        {columns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>מרווחים אופקיים בין שורות</Text>
            <Text style={styles.gapDescription}>
              הוסף מרווחים בין שורות שולחנות (למשל, מעבר לשירותים)
            </Text>
            
            {/* Current Gaps */}
            {Array.from(horizontalGaps.entries()).length > 0 && (
              <View style={styles.gapRowsContainer}>
                {Array.from(horizontalGaps.entries()).map(([gapKey, gapInfo]) => (
                  <View key={gapKey}>
                    <View style={styles.gapRowItem}>
                      <View style={styles.gapInfo}>
                        <Text style={styles.gapRowText}>
                          מרווח {gapInfo.position === 'before' ? 'לפני' : 'אחרי'} שורה {gapInfo.rowIndex + 1}: {gapInfo.size}px
                        </Text>
                        <Text style={styles.gapColumnsText}>
                          עמודות: {Array.from(gapInfo.columns).map(c => c + 1).join(', ')}
                        </Text>
                      </View>
                      <View style={styles.gapControls}>
                        <TouchableOpacity
                          style={styles.gapSizeButton}
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
                        >
                          <Ionicons name="remove" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.gapSizeValue}>{gapInfo.size}</Text>
                        <TouchableOpacity
                          style={styles.gapSizeButton}
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
                        >
                          <Ionicons name="add" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.gapSizeButton,
                            editingGap === gapKey && styles.gapSizeButtonActive
                          ]}
                          onPress={() => {
                            setEditingGap(editingGap === gapKey ? null : gapKey);
                          }}
                        >
                          <Ionicons 
                            name={editingGap === gapKey ? "checkmark" : "create"} 
                            size={16} 
                            color={editingGap === gapKey ? colors.white : colors.primary} 
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.removeGapButton}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            newGaps.delete(gapKey);
                            setHorizontalGaps(newGaps);
                            setEditingGap(null);
                          }}
                        >
                          <Ionicons name="trash" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    {/* Column selection when editing */}
                    {editingGap === gapKey && (
                      <View style={styles.columnSelectionContainer}>
                        <Text style={styles.columnSelectionTitle}>
                          בחר עמודות למרווח:
                        </Text>
                        <View style={styles.columnCheckboxes}>
                          {columns.map((_, columnIndex) => {
                            const isSelected = gapInfo.columns.has(columnIndex);
                            return (
                              <TouchableOpacity
                                key={columnIndex}
                                style={[
                                  styles.columnCheckbox,
                                  isSelected && styles.columnCheckboxSelected
                                ]}
                                onPress={() => {
                                  const newGaps = new Map(horizontalGaps);
                                  const currentGap = newGaps.get(gapKey)!;
                                  const newColumns = new Set(currentGap.columns);
                                  
                                  if (isSelected) {
                                    newColumns.delete(columnIndex);
                                  } else {
                                    newColumns.add(columnIndex);
                                  }
                                  
                                  if (newColumns.size > 0) {
                                    newGaps.set(gapKey, {
                                      ...currentGap,
                                      columns: newColumns
                                    });
                                    setHorizontalGaps(newGaps);
                                  }
                                }}
                              >
                                <Text style={[
                                  styles.columnCheckboxText,
                                  isSelected && styles.columnCheckboxTextSelected
                                ]}>
                                  {isSelected && '✓ '}עמודה {columnIndex + 1}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <TouchableOpacity
                          style={styles.selectAllButton}
                          onPress={() => {
                            const newGaps = new Map(horizontalGaps);
                            const currentGap = newGaps.get(gapKey)!;
                            const allSelected = columns.length === gapInfo.columns.size;
                            
                            newGaps.set(gapKey, {
                              ...currentGap,
                              columns: allSelected ? 
                                new Set([0]) : // Keep at least one column
                                new Set(columns.map((_, idx) => idx))
                            });
                            setHorizontalGaps(newGaps);
                          }}
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
            )}

            {/* Add Gap */}
            <TouchableOpacity
              style={styles.addGapButton}
              onPress={() => {
                const maxRows = Math.max(...columns.map(col => col.tablesCount));
                Alert.alert(
                  'הוסף מרווח',
                  'בחר איפה להוסיף מרווח:',
                  [
                    // Before first row option only
                    {
                      text: 'לפני שורה 1',
                      onPress: () => {
                        showColumnSelectionDialog('before-0', 'before', 0);
                      }
                    },
                    // After options  
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
              <Ionicons name="add-circle" size={20} color={colors.white} style={{ marginLeft: 8 }} />
              <Text style={styles.addGapText}>הוסף מרווח</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תצוגה מקדימה</Text>
          {renderPreview()}
        </View>

        {/* Create/Update Button */}
        {columns.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.createButton, loading && styles.createButtonDisabled]}
              onPress={handleCreateMap}
              disabled={loading}
            >
              <Ionicons 
                name={existingMap ? "refresh-circle" : "checkmark-circle"} 
                size={24} 
                color={colors.white} 
                style={{ marginLeft: 8 }} 
              />
              <Text style={styles.createButtonText}>
                {loading ? 'שומר מפה...' : existingMap ? 'עדכן מפת הושבה' : 'צור מפת הושבה'}
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
    backgroundColor: colors.gray[100],
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 15,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginRight: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right'
  },
  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  counterButton: {
    padding: 5,
  },
  counterValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 10,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 5,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 10,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.white,
  },
  addColumnButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 15,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addColumnButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  columnItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  columnInfo: {
    flex: 1,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
  },
  columnDetails: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
  },
  removeButton: {
    padding: 8,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: colors.error,
    borderRadius: 12,
  },
  clearButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  summary: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: colors.gray[200],
  },
  summaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
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
    backgroundColor: colors.gray[50],
    borderRadius: 16,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gray[200],
    minHeight: 500,
  },
  stageArea: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stageText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  tablesAreaContainer: {
    flex: 1,
    minHeight: 450,
  },
  tablesAreaContent: {
    flexGrow: 1,
  },
  tablesArea: {
    position: 'relative',
    minHeight: 420,
    padding: 10,
  },
  regularTable: {
    position: 'absolute',
    width: 20,
    height: 20,
    backgroundColor: colors.primary,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  knightTable: {
    position: 'absolute',
    width: 22,
    height: 34,
    backgroundColor: colors.orange,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  reserveTable: {
    position: 'absolute',
    width: 20,
    height: 20,
    backgroundColor: colors.black,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tableNumber: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.white,
  },
  centerAisle: {},
  aisleLabel: {},
  createButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  createButtonDisabled: {
    backgroundColor: colors.gray[400],
    shadowOpacity: 0,
  },
  createButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  gapDescription: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 15,
  },
  gapRowsContainer: {
    marginTop: 10,
    marginBottom: 15,
  },
  gapRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  gapInfo: {
    flex: 1,
    marginLeft: 15,
  },
  gapRowText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 2,
  },
  gapColumnsText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'right',
  },
  gapControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gapSizeButton: {
    padding: 8,
    backgroundColor: colors.gray[200],
    borderRadius: 8,
    marginHorizontal: 5,
  },
  gapSizeValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 10,
  },
  removeGapButton: {
    padding: 8,
    marginLeft: 10,
  },
  addGapButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  addGapText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  gapSizeButtonActive: {
    backgroundColor: colors.primary,
  },
  columnSelectionContainer: {
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  columnSelectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
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
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 4,
    minWidth: 80,
  },
  columnCheckboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  columnCheckboxText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },
  columnCheckboxTextSelected: {
    color: colors.white,
  },
  selectAllButton: {
    backgroundColor: colors.secondary,
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
  existingMapInfo: {
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  existingMapText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 5,
  },
  existingMapDate: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 15,
  },
  existingMapActions: {
    alignItems: 'center',
  },
  editMapButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  editMapButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  orText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
  },
}); 