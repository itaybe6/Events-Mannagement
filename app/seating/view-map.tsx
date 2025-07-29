import React, { useState, useEffect } from 'react';
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

interface SavedTable {
  id: number;
  x: number;
  y: number;
  isKnight: boolean;
  isReserve: boolean;
  rotation: number;
  seats: number;
}

interface SeatingMap {
  id: string;
  event_id: string;
  num_tables: number;
  tables: SavedTable[];
  annotations: any[];
  created_at: string;
  updated_at: string;
}

export default function ViewMapScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [seatingMap, setSeatingMap] = useState<SeatingMap | null>(null);
  const [tables, setTables] = useState<SavedTable[]>([]);

  useEffect(() => {
    loadSeatingMap();
  }, [eventId]);

  const loadSeatingMap = async () => {
    if (!eventId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('seating_maps')
        .select('*')
        .eq('event_id', eventId)
        .single();

      if (error) {
        console.error('Error loading seating map:', error);
        Alert.alert('שגיאה', 'לא נמצאה מפת הושבה לאירוע זה');
        router.back();
        return;
      }

      setSeatingMap(data);
      setTables(data.tables || []);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה בטעינת המפה');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const getTotalSeats = () => {
    return tables.reduce((total, table) => total + table.seats, 0);
  };

  const getTableCounts = () => {
    const regular = tables.filter(t => !t.isKnight && !t.isReserve).length;
    const knight = tables.filter(t => t.isKnight).length;
    const reserve = tables.filter(t => t.isReserve).length;
    return { regular, knight, reserve };
  };

  const renderMapView = () => {
    if (tables.length === 0) {
      return (
        <View style={styles.emptyMap}>
          <Ionicons name="restaurant-outline" size={48} color={colors.gray[400]} />
          <Text style={styles.emptyMapText}>אין שולחנות במפה</Text>
        </View>
      );
    }

    // Calculate total width needed for all tables with proper padding
    const minX = Math.min(...tables.map(t => t.x));
    const maxX = Math.max(...tables.map(t => t.x));
    const paddingPerSide = 80;
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
                  style={[
                    table.isReserve ? styles.reserveTable : 
                    table.isKnight ? styles.knightTable : styles.regularTable,
                    {
                      left: adjustedX,
                      top: (table.y / 800) * 450,
                    }
                  ]}
                  onPress={() => {
                    const tableType = table.isReserve ? 'רזרבה' : table.isKnight ? 'אביר' : 'רגיל';
                    Alert.alert(
                      `שולחן ${table.id}`,
                      `סוג: ${tableType}\nמקומות: ${table.seats}`,
                      [{ text: 'אישור', style: 'default' }]
                    );
                  }}
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>טוען מפת הושבה...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tableCounts = getTableCounts();

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
        <Text style={styles.headerTitle}>מפת הושבה</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/seating/SeatingMapEditor?eventId=${eventId}`)}
        >
          <Ionicons name="create" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Map Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי המפה</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>סה"כ שולחנות</Text>
              <Text style={styles.infoValue}>{tables.length}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>סה"כ מקומות</Text>
              <Text style={styles.infoValue}>{getTotalSeats()}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>שולחנות רגילים</Text>
              <Text style={styles.infoValue}>{tableCounts.regular}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>שולחנות אביר</Text>
              <Text style={styles.infoValue}>{tableCounts.knight}</Text>
            </View>
            {tableCounts.reserve > 0 && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>שולחנות רזרבה</Text>
                <Text style={styles.infoValue}>{tableCounts.reserve}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>נוצרה</Text>
              <Text style={styles.infoValue}>
                {seatingMap ? new Date(seatingMap.created_at).toLocaleDateString('he-IL') : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Map View */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>תצוגת המפה</Text>
          <Text style={styles.mapDescription}>
            לחץ על שולחן כדי לראות פרטים נוספים
          </Text>
          {renderMapView()}
        </View>

        {/* Legend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מקרא</Text>
          <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>שולחן רגיל (12 מקומות)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: colors.orange }]} />
              <Text style={styles.legendText}>שולחן אביר (20 מקומות)</Text>
            </View>
            {tableCounts.reserve > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: colors.black }]} />
                <Text style={styles.legendText}>שולחן רזרבה (8 מקומות)</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
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
  editButton: {
    padding: 8,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
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
    marginBottom: 15,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoItem: {
    width: '48%',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 5,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  mapDescription: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'right',
    marginBottom: 15,
  },
  emptyMap: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyMapText: {
    marginTop: 10,
    fontSize: 16,
    color: colors.textLight,
  },
  hallVisualization: {
    backgroundColor: '#F8F9FA',
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
  legendContainer: {
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendColor: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginLeft: 12,
  },
  legendText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
}); 