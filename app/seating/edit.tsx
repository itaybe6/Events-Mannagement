import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  FlatList,
  Dimensions,
  Platform,
  TextInput as RNTextInput
} from 'react-native';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Mock component for drag and drop functionality
// In a real app, you would use a proper drag and drop library
const DraggableGuest = ({ guest, onDrop, tableId }: any) => {
  return (
    <TouchableOpacity 
      style={[
        styles.draggableGuest,
        tableId ? styles.assignedGuest : styles.unassignedGuest
      ]}
      onPress={() => onDrop(guest.id, tableId ? null : '1')}
    >
      <Text style={styles.guestName}>{guest.name}</Text>
      {tableId && (
        <TouchableOpacity 
          style={styles.removeFromTableButton}
          onPress={() => onDrop(guest.id, null)}
        >
          <Ionicons name="trash" size={12} color={colors.white} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

// Table component for map view
const TableComponent = ({ table, selected, onSelect, guestCount }: any) => {
  // Determine table style based on shape
  const tableStyle = table.shape === 'rectangle' 
    ? styles.rectangleTable 
    : styles.squareTable;
  
  return (
    <TouchableOpacity 
      style={[
        tableStyle, 
        selected === table.id && styles.selectedTable
      ]}
      onPress={() => onSelect(table.id)}
    >
      <Text style={styles.tableComponentName}>{table.name}</Text>
      <Text style={styles.tableComponentCount}>{guestCount}/{table.capacity}</Text>
    </TouchableOpacity>
  );
};

export default function SeatingEditScreen() {
  const { guests, tables, assignGuestToTable, removeGuestFromTable, addTable, updateTable, deleteTable } = useEventStore();
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Get unique areas
  const areas = Array.from(new Set(tables.map(table => table.area)));

  // Filter tables by active area
  const filteredTables = activeArea 
    ? tables.filter(table => table.area === activeArea)
    : tables;

  // Get unassigned guests
  const unassignedGuests = guests.filter(guest => !guest.tableId);

  // Get assigned guests for a table
  const getTableGuests = (tableId: string) => {
    return guests.filter(guest => guest.tableId === tableId);
  };

  const handleGuestDrop = (guestId: string, tableId: string | null) => {
    if (tableId) {
      assignGuestToTable(guestId, tableId);
    } else {
      removeGuestFromTable(guestId);
    }
  };

  const handleAddTable = () => {
    // Determine shape based on existing tables count
    // Make the 14th and 15th tables rectangular, others square
    const existingTablesCount = tables.length;
    const shape = existingTablesCount === 13 || existingTablesCount === 14 ? 'rectangle' as const : 'square' as const;
    
    const newTable = {
      id: Date.now().toString(),
      name: `שולחן ${tables.length + 1}`,
      capacity: 10,
      area: activeArea || 'אזור מרכזי',
      guests: [],
      shape: shape,
    };
    addTable(newTable);
  };

  const handleSaveTable = (tableId: string) => {
    if (newTableName.trim()) {
      updateTable(tableId, { name: newTableName });
    }
    setEditingTable(null);
    setNewTableName('');
  };

  const handleSelectTable = (tableId: string) => {
    setSelectedTable(tableId === selectedTable ? null : tableId);
  };

  const renderListView = () => (
    <View style={styles.tablesContainer}>
      {filteredTables.map(table => (
        <Card key={table.id} style={styles.tableCard}>
          <View style={styles.tableHeader}>
            {editingTable === table.id ? (
              <View style={styles.editTableNameContainer}>
                <TouchableOpacity 
                  style={styles.saveTableButton}
                  onPress={() => handleSaveTable(table.id)}
                >
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                </TouchableOpacity>
                <TextInput
                  style={styles.editTableNameInput}
                  value={newTableName}
                  onChangeText={setNewTableName}
                  placeholder={table.name}
                  autoFocus
                />
              </View>
            ) : (
              <View style={styles.tableNameContainer}>
                <TouchableOpacity 
                  style={styles.editTableButton}
                  onPress={() => {
                    setEditingTable(table.id);
                    setNewTableName(table.name);
                  }}
                >
                  <Ionicons name="create" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.tableName}>{table.name}</Text>
              </View>
            )}
            <View style={styles.tableInfo}>
              <Text style={styles.tableCapacity}>
                {getTableGuests(table.id).length}/{table.capacity} מקומות
              </Text>
              <Text style={styles.tableArea}>{table.area}</Text>
            </View>
          </View>
          
          <View style={styles.tableGuests}>
            {getTableGuests(table.id).length > 0 ? (
              getTableGuests(table.id).map(guest => (
                <DraggableGuest 
                  key={guest.id} 
                  guest={guest} 
                  onDrop={handleGuestDrop}
                  tableId={table.id}
                />
              ))
            ) : (
              <Text style={styles.emptyTableText}>גרור אורחים לכאן</Text>
            )}
          </View>
        </Card>
      ))}
    </View>
  );

  const renderMapView = () => (
    <View style={styles.mapContainer}>
      <View style={styles.venueMap}>
        <Text style={styles.venueTitle}>מפת האולם</Text>
        
        <View style={styles.entranceArea}>
          <Text style={styles.entranceText}>כניסה</Text>
        </View>
        
        <View style={styles.danceFloor}>
          <Text style={styles.danceFloorText}>רחבת ריקודים</Text>
        </View>
        
        <View style={styles.stageArea}>
          <Text style={styles.stageText}>במה</Text>
        </View>
        
        <View style={styles.tablesArea}>
          {filteredTables.map(table => (
            <TableComponent 
              key={table.id}
              table={table}
              selected={selectedTable}
              onSelect={handleSelectTable}
              guestCount={getTableGuests(table.id).length}
            />
          ))}
        </View>
      </View>
      
      {selectedTable && (
        <Card style={styles.selectedTableCard}>
          <Text style={styles.selectedTableTitle}>
            {tables.find(t => t.id === selectedTable)?.name}
          </Text>
          <Text style={styles.selectedTableSubtitle}>
            {tables.find(t => t.id === selectedTable)?.area}
          </Text>
          
          <View style={styles.selectedTableGuests}>
            {getTableGuests(selectedTable).length > 0 ? (
              getTableGuests(selectedTable).map(guest => (
                <DraggableGuest 
                  key={guest.id} 
                  guest={guest} 
                  onDrop={handleGuestDrop}
                  tableId={selectedTable}
                />
              ))
            ) : (
              <Text style={styles.emptyTableText}>אין אורחים בשולחן זה</Text>
            )}
          </View>
        </Card>
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>סידור ישיבה</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.viewModeButton}
            onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
          >
            {viewMode === 'list' ? (
              <Ionicons name="map" size={20} color={colors.primary} />
            ) : (
              <Ionicons name="list" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={handleAddTable}
          >
            <Ionicons name="add" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.areasContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity 
            style={[styles.areaButton, activeArea === null && styles.activeArea]} 
            onPress={() => setActiveArea(null)}
          >
            <Text style={[styles.areaText, activeArea === null && styles.activeAreaText]}>
              הכל
            </Text>
          </TouchableOpacity>
          {areas.map(area => (
            <TouchableOpacity 
              key={area}
              style={[styles.areaButton, activeArea === area && styles.activeArea]} 
              onPress={() => setActiveArea(area)}
            >
              <Text style={[styles.areaText, activeArea === area && styles.activeAreaText]}>
                {area}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {viewMode === 'list' ? renderListView() : renderMapView()}
      </ScrollView>

      <View style={styles.unassignedContainer}>
        <View style={styles.unassignedHeader}>
          <Text style={styles.unassignedTitle}>אורחים לא משובצים</Text>
          <Text style={styles.unassignedCount}>{unassignedGuests.length} אורחים</Text>
        </View>
        
        <FlatList
          data={unassignedGuests}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.unassignedList}
          renderItem={({ item }) => (
            <DraggableGuest 
              guest={item} 
              onDrop={handleGuestDrop}
              tableId={null}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyUnassignedText}>כל האורחים משובצים</Text>
          }
        />
      </View>
    </GestureHandlerRootView>
  );
}

// For simplicity, we're using a TextInput directly here
// In a real app, you would import it from react-native
const TextInput = ({ style, value, onChangeText, placeholder, autoFocus }: any) => {
  return (
    <View style={[{ 
      borderWidth: 1, 
      borderColor: colors.gray[300], 
      borderRadius: 4, 
      padding: 4,
      backgroundColor: colors.white
    }, style]}>
      <Text style={{ color: colors.text }}>{value || placeholder}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewModeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  areasContainer: {
    marginBottom: 16,
  },
  areaButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.gray[200],
    marginRight: 8,
  },
  activeArea: {
    backgroundColor: colors.primary,
  },
  areaText: {
    fontSize: 14,
    color: colors.gray[700],
  },
  activeAreaText: {
    color: colors.white,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  tablesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tableCard: {
    width: '48%',
    marginBottom: 16,
  },
  tableHeader: {
    marginBottom: 12,
  },
  tableNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  editTableNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  tableName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  editTableButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveTableButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  editTableNameInput: {
    flex: 1,
  },
  tableInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tableCapacity: {
    fontSize: 12,
    color: colors.gray[600],
  },
  tableArea: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  tableGuests: {
    minHeight: 100,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  emptyTableText: {
    fontSize: 12,
    color: colors.gray[500],
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    marginTop: 16,
  },
  unassignedContainer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[300],
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  unassignedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  unassignedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  unassignedCount: {
    fontSize: 14,
    color: colors.primary,
  },
  unassignedList: {
    paddingVertical: 8,
  },
  emptyUnassignedText: {
    fontSize: 14,
    color: colors.gray[500],
    fontStyle: 'italic',
    textAlign: 'center',
    width: Dimensions.get('window').width - 32,
  },
  draggableGuest: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  unassignedGuest: {
    backgroundColor: colors.gray[300],
  },
  assignedGuest: {
    backgroundColor: colors.primary,
  },
  guestName: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '500',
  },
  removeFromTableButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  // Map view styles
  mapContainer: {
    flex: 1,
    marginBottom: 16,
  },
  venueMap: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    minHeight: 300,
    position: 'relative',
    marginBottom: 16,
  },
  venueTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  entranceArea: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  entranceText: {
    fontSize: 12,
    color: colors.gray[700],
  },
  danceFloor: {
    position: 'absolute',
    top: '40%',
    left: '25%',
    right: '25%',
    height: 80,
    backgroundColor: `${colors.secondary}30`,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  danceFloorText: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '500',
  },
  stageArea: {
    position: 'absolute',
    top: 50,
    left: '30%',
    right: '30%',
    height: 40,
    backgroundColor: colors.gray[300],
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageText: {
    fontSize: 12,
    color: colors.gray[700],
  },
  tablesArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 120,
    marginBottom: 40,
  },
  // New table shapes
  squareTable: {
    width: 60,
    height: 60,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rectangleTable: {
    width: 80,
    height: 50,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTable: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}20`,
  },
  tableComponentName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  tableComponentCount: {
    fontSize: 9,
    color: colors.gray[600],
  },
  selectedTableCard: {
    marginBottom: 16,
  },
  selectedTableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  selectedTableSubtitle: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 12,
  },
  selectedTableGuests: {
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    minHeight: 80,
  },
});