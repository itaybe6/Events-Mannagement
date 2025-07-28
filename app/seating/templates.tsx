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

interface TableRow {
  id: number;
  tablesCount: number;
  tableType: 'regular' | 'knight';
  spacing: 'normal' | 'wide';
}

interface BuiltTable {
  id: number;
  x: number;
  y: number;
  isKnight: boolean;
  rotation: number;
  seats: number;
}

export default function SeatingTemplatesScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  // Row builder state
  const [rows, setRows] = useState<TableRow[]>([]);
  const [newRowTablesCount, setNewRowTablesCount] = useState(6);
  const [newRowType, setNewRowType] = useState<'regular' | 'knight'>('regular');
  const [newRowSpacing, setNewRowSpacing] = useState<'normal' | 'wide'>('normal');

  // Generate tables from rows
  const generateTablesFromRows = (): BuiltTable[] => {
    const tables: BuiltTable[] = [];
    let tableId = 1;
    let currentY = 80; // Start after stage
    
    rows.forEach((row) => {
      const tableSpacing = row.spacing === 'wide' ? 180 : 140;
      const rowHeight = row.tableType === 'knight' ? 200 : 180;
      
      // Calculate center alignment
      const totalWidth = (row.tablesCount - 1) * tableSpacing;
      const startX = (1200 - totalWidth) / 2; // Center in 1200px hall
      
      for (let i = 0; i < row.tablesCount; i++) {
        const x = startX + i * tableSpacing;
        
        tables.push({
          id: tableId++,
          x,
          y: currentY,
          isKnight: row.tableType === 'knight',
          rotation: 0,
          seats: row.tableType === 'knight' ? 20 : 12,
        });
      }
      
      currentY += rowHeight;
    });
    
    return tables;
  };

  const addRow = () => {
    const newRow: TableRow = {
      id: Date.now(),
      tablesCount: newRowTablesCount,
      tableType: newRowType,
      spacing: newRowSpacing,
    };
    
    setRows([...rows, newRow]);
  };

  const removeRow = (rowId: number) => {
    setRows(rows.filter(row => row.id !== rowId));
  };

  const clearAll = () => {
    Alert.alert(
      'מחק הכל',
      'האם אתה בטוח שברצונך למחוק את כל השורות?',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחק', style: 'destructive', onPress: () => setRows([]) }
      ]
    );
  };

  const getTotalTables = () => {
    return rows.reduce((total, row) => total + row.tablesCount, 0);
  };

  const getTotalSeats = () => {
    return rows.reduce((total, row) => {
      const seatsPerTable = row.tableType === 'knight' ? 20 : 12;
      return total + (row.tablesCount * seatsPerTable);
    }, 0);
  };

  const handleCreateMap = async () => {
    if (rows.length === 0) {
      Alert.alert('שגיאה', 'נא להוסיף לפחות שורה אחת של שולחנות');
      return;
    }

    setLoading(true);
    try {
      const tables = generateTablesFromRows();
      
      // Check if seating map already exists
      const { data: existingMap } = await supabase
        .from('seating_maps')
        .select('*')
        .eq('event_id', eventId)
        .single();
      
      if (existingMap) {
        Alert.alert(
          'מפת הושבה קיימת',
          'כבר קיימת מפת הושבה לאירוע זה. האם ברצונך להחליף אותה?',
          [
            { text: 'ביטול', style: 'cancel' },
            {
              text: 'החלף',
              style: 'destructive',
              onPress: () => updateSeatingMap(tables)
            }
          ]
        );
      } else {
        await createSeatingMap(tables);
      }
    } catch (error) {
      console.error('Error creating map:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה ביצירת המפה');
    } finally {
      setLoading(false);
    }
  };

  const createSeatingMap = async (tables: BuiltTable[]) => {
    const { error } = await supabase
      .from('seating_maps')
      .insert({
        event_id: eventId,
        num_tables: tables.length,
        tables: tables,
        annotations: [],
      });

    if (error) throw error;
    showSuccessAlert(tables.length);
  };

  const updateSeatingMap = async (tables: BuiltTable[]) => {
    const { error } = await supabase
      .from('seating_maps')
      .update({
        num_tables: tables.length,
        tables: tables,
        annotations: [],
      })
      .eq('event_id', eventId);

    if (error) throw error;
    showSuccessAlert(tables.length);
  };

  const showSuccessAlert = (totalTables: number) => {
    Alert.alert(
      'הצלחה!',
      `נוצרה מפת הושבה עם ${totalTables} שולחנות ו-${getTotalSeats()} מקומות ישיבה`,
      [
        {
          text: 'חזור',
          style: 'cancel',
          onPress: () => router.back()
        },
        {
          text: 'עבור למפה',
          onPress: () => router.push(`/seating/SeatingMapEditor?eventId=${eventId}`)
        }
      ]
    );
  };

  const renderPreview = () => {
    const tables = generateTablesFromRows();
    
    if (tables.length === 0) {
      return (
        <View style={styles.emptyPreview}>
          <Ionicons name="restaurant-outline" size={48} color={colors.gray[400]} />
          <Text style={styles.emptyPreviewText}>הוסף שורות כדי לראות תצוגה מקדימה</Text>
        </View>
      );
    }

    return (
      <View style={styles.hallVisualization}>
        <View style={styles.stageArea}>
          <Text style={styles.stageText}>במה</Text>
        </View>
        
        <View style={styles.tablesArea}>
          {tables.map((table) => (
            <View
              key={table.id}
              style={[
                table.isKnight ? styles.knightTable : styles.regularTable,
                {
                  left: (table.x / 1200) * 280 + 20,
                  top: (table.y / 1000) * 400 + 20,
                }
              ]}
            >
              <Text style={styles.tableNumber}>
                {table.id}
              </Text>
            </View>
          ))}
        </View>
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
        {/* Row Builder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הוסף שורת שולחנות</Text>
          
          {/* Tables Count */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>מספר שולחנות בשורה:</Text>
            <View style={styles.counterContainer}>
              <TouchableOpacity 
                style={styles.counterButton}
                onPress={() => setNewRowTablesCount(Math.max(1, newRowTablesCount - 1))}
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.counterValue}>{newRowTablesCount}</Text>
              <TouchableOpacity 
                style={styles.counterButton}
                onPress={() => setNewRowTablesCount(Math.min(10, newRowTablesCount + 1))}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Table Type */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>סוג שולחן:</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newRowType === 'regular' && styles.toggleButtonActive
                ]}
                onPress={() => setNewRowType('regular')}
              >
                <Text style={[
                  styles.toggleText,
                  newRowType === 'regular' && styles.toggleTextActive
                ]}>רגיל (12)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newRowType === 'knight' && styles.toggleButtonActive
                ]}
                onPress={() => setNewRowType('knight')}
              >
                <Text style={[
                  styles.toggleText,
                  newRowType === 'knight' && styles.toggleTextActive
                ]}>אביר (20)</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Spacing */}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>מרווח בין שולחנות:</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newRowSpacing === 'normal' && styles.toggleButtonActive
                ]}
                onPress={() => setNewRowSpacing('normal')}
              >
                <Text style={[
                  styles.toggleText,
                  newRowSpacing === 'normal' && styles.toggleTextActive
                ]}>רגיל</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  newRowSpacing === 'wide' && styles.toggleButtonActive
                ]}
                onPress={() => setNewRowSpacing('wide')}
              >
                <Text style={[
                  styles.toggleText,
                  newRowSpacing === 'wide' && styles.toggleTextActive
                ]}>רחב</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Add Row Button */}
          <TouchableOpacity
            style={styles.addRowButton}
            onPress={addRow}
          >
            <Ionicons name="add-circle" size={24} color={colors.white} style={{ marginLeft: 8 }} />
            <Text style={styles.addRowButtonText}>הוסף שורה</Text>
          </TouchableOpacity>
        </View>

        {/* Current Rows */}
        {rows.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>שורות נוכחיות</Text>
              <TouchableOpacity onPress={clearAll} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>מחק הכל</Text>
              </TouchableOpacity>
            </View>
            
            {rows.map((row, index) => (
              <View key={row.id} style={styles.rowItem}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>שורה {index + 1}</Text>
                  <Text style={styles.rowDetails}>
                    {row.tablesCount} שולחנות {row.tableType === 'knight' ? 'אביר' : 'רגילים'} • 
                    מרווח {row.spacing === 'wide' ? 'רחב' : 'רגיל'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeRow(row.id)}
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

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תצוגה מקדימה</Text>
          {renderPreview()}
        </View>

        {/* Create Button */}
        {rows.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.createButton, loading && styles.createButtonDisabled]}
              onPress={handleCreateMap}
              disabled={loading}
            >
              <Ionicons 
                name="checkmark-circle" 
                size={24} 
                color={colors.white} 
                style={{ marginLeft: 8 }} 
              />
              <Text style={styles.createButtonText}>
                {loading ? 'יוצר מפה...' : 'צור מפת הושבה'}
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  guestCountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestCountButton: {
    width: '30%',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  guestCountButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  guestCountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  guestCountTextSelected: {
    color: colors.white,
  },
  previewContainer: {
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
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginBottom: 16,
  },
  previewStats: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  previewStat: {
    alignItems: 'center',
  },
  previewStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  previewStatLabel: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 4,
  },
  miniVisualization: {
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    height: 120,
    position: 'relative',
    marginTop: 10,
  },
  miniTable: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
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
  hallVisualization: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gray[200],
    minHeight: 8750,
    maxHeight: 1750,
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
  tablesArea: {
    position: 'relative',
    minHeight: 650,
    width: '100%',
    padding: 15,
    paddingBottom: 30,
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
    zIndex: 2,
  },
  knightTable: {
    position: 'absolute',
    width: 18,
    height: 32,
    backgroundColor: colors.orange,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 2,
  },
  tableNumber: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.white,
  },
  legend: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-evenly',
    backgroundColor: colors.white,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.gray[200],
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  legendIcon: {
    marginLeft: 8,
  },
  regularTableLegend: {
    width: 18,
    height: 18,
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  knightTableLegend: {
    width: 16,
    height: 28,
    backgroundColor: colors.orange,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  centerAisle: {
    position: 'absolute',
    left: '42%',
    top: 80,
    bottom: 30,
    width: '16%',
    backgroundColor: 'rgba(180, 180, 180, 0.15)',
    borderRadius: 4,
    zIndex: 0,
  },
  aisleLabel: {
    position: 'absolute',
    top: 90,
    left: '45%',
    fontSize: 11,
    color: colors.textLight,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    zIndex: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
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
    borderColor: colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.white,
  },
  addRowButton: {
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
  addRowButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  rowItem: {
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
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
  },
  rowDetails: {
    fontSize: 14,
    color: colors.textLight,
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
}); 