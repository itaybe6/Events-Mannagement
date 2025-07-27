import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { Ionicons } from '@expo/vector-icons';
import { Table } from '@/types';
import { useRouter } from 'expo-router';
import { useLayoutStore } from '@/store/layoutStore';

export default function TablesList() {
  const { userData } = useUserStore();
  const router = useRouter();
  const { setTabBarVisible } = useLayoutStore();
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedGuestsToAdd, setSelectedGuestsToAdd] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('הכל');
  const [categories, setCategories] = useState<string[]>([]);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [selectedGuestsToDelete, setSelectedGuestsToDelete] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (userData?.event_id) {
      setLoading(true);
      Promise.all([
        fetchTables(),
        fetchGuests(),
      ]).finally(() => setLoading(false));
    }
  }, [userData?.event_id]);

  const fetchTables = async () => {
    if (!userData?.event_id) return;
    
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('event_id', userData.event_id)
      .order('number');
    
    if (!error) setTables(data || []);
  };

  const fetchGuests = async () => {
    if (!userData?.event_id) return;
    
    const { data, error } = await supabase
      .from('guests')
      .select(`
        *,
        guest_categories(name)
      `)
      .eq('event_id', userData.event_id)
      .eq('status', 'מגיע');
    
    if (!error) {
      setGuests(data || []);
    }
  };

  const getGuestsForTable = (tableId: string) => {
    return guests.filter(guest => guest.table_id === tableId);
  };

  const getUnseatedGuests = () => {
    return guests.filter(guest => guest.status === 'מגיע' && !guest.table_id);
  };

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
    if (selectedGuestsToAdd.size === 0 || !selectedTable) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const tableId = selectedTable.id;

    // Update guests
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: tableId })
      .in('id', guestIds);
    
    if (guestUpdateError) {
      console.error("Error updating guests:", guestUpdateError);
      return;
    }
    
    // Update table seated_guests count
    const currentSeated = getGuestsForTable(tableId).length;
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: currentSeated + guestIds.length })
      .eq('id', tableId);
      
    if (tableUpdateError) {
      console.error("Error updating table count:", tableUpdateError);
      return;
    }

    // Refresh data
    await fetchGuests();
    await fetchTables();
    
    // Close modal
    setModalVisible(false);
    setTabBarVisible(true);
    setSelectedGuestsToAdd(new Set());
  };

  const openAddGuestsModal = (table: Table) => {
    setSelectedTable(table);
    setSelectedGuestsToAdd(new Set());
    setSearchQuery('');
    setCategoryFilter('הכל');
    
    const unseated = getUnseatedGuests();
    const tableCategories = ['הכל', ...Array.from(new Set(unseated.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setCategories(tableCategories);
    
    setModalVisible(true);
    setTabBarVisible(false);
  };

  const closeModal = () => {
    setModalVisible(false);
    setTabBarVisible(true);
  };

  const handleEditPress = (tableId: string) => {
    if (editingTableId === tableId) {
      setEditingTableId(null);
      setSelectedGuestsToDelete(new Set());
    } else {
      setEditingTableId(tableId);
      setSelectedGuestsToDelete(new Set());
    }
  };

  const handleToggleGuestDeletionSelection = (guestId: string) => {
    const newSelection = new Set(selectedGuestsToDelete);
    if (newSelection.has(guestId)) {
      newSelection.delete(guestId);
    } else {
      newSelection.add(guestId);
    }
    setSelectedGuestsToDelete(newSelection);
  };

  const handleRemoveGuestsFromTable = async () => {
    if (selectedGuestsToDelete.size === 0 || !editingTableId) return;

    const guestIds = Array.from(selectedGuestsToDelete);
    
    // 1. Update guests' table_id to null
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: null })
      .in('id', guestIds);

    if (guestUpdateError) {
      console.error("Error removing guests from table:", guestUpdateError);
      return;
    }

    // 2. Decrement seated_guests count on the table
    const table = tables.find(t => t.id === editingTableId);
    if (!table) return;

    const currentSeated = table.seated_guests || 0;
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: currentSeated - guestIds.length })
      .eq('id', editingTableId);
      
    if (tableUpdateError) {
      console.error("Error updating table count:", tableUpdateError);
      return;
    }

    // Refresh data
    await fetchGuests();
    await fetchTables();

    // Exit edit mode
    setEditingTableId(null);
    setSelectedGuestsToDelete(new Set());
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007aff" />
      </View>
    );
  }

  if (!userData?.event_id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>אין אירוע זמין</Text>
      </View>
    );
  }

  const unseatedGuests = getUnseatedGuests();
  const filteredUnseatedGuests = unseatedGuests.filter(g => {
    const categoryMatch = categoryFilter === 'הכל' || (g.guest_categories?.name || 'ללא קטגוריה') === categoryFilter;
    const searchMatch = g.name.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  const fullTables = tables.filter(t => t.seated_guests === t.capacity).length;
  const totalTables = tables.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(tabs)/BrideGroomSeating')}>
          <Ionicons name="chevron-back" size={24} color="#007aff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>שולחנות</Text>
        <View style={styles.headerStats}>
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34c759" />
            <Text style={styles.statText}>{fullTables} מלאים</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="sync-circle" size={20} color="#ff9500" />
            <Text style={styles.statText}>{totalTables} בהושבה</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {tables.map((table) => {
          const tableGuests = getGuestsForTable(table.id);
          const isEditing = editingTableId === table.id;
          
          return (
            <View key={table.id} style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <View style={styles.tableInfo}>
                  <Text style={styles.tableNumber}>
                    שולחן {table.number}
                    {table.name && ` - ${table.name}`}
                  </Text>
                </View>
                <View style={styles.tableActions}>
                  <View style={styles.capacityInfo}>
                    <Text style={styles.capacityText}>
                      {table.seated_guests || 0} / {table.capacity}
                    </Text>
                    <Ionicons 
                      name="people" 
                      size={16} 
                      color="#8e8e93" 
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                  <TouchableOpacity 
                    style={styles.addButton} 
                    onPress={() => openAddGuestsModal(table)}
                  >
                    <Ionicons name="add" size={20} color="#007aff" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => handleEditPress(table.id)}
                  >
                    <Ionicons name={isEditing ? "close" : "pencil"} size={20} color="#007aff" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.guestsContainer}>
                {tableGuests.length > 0 ? (
                  <>
                    <Text style={styles.guestsTitle}>אורחים יושבים:</Text>
                    <ScrollView style={styles.guestsListScrollView} nestedScrollEnabled>
                      <View style={styles.guestsList}>
                        {tableGuests.map((guest, index) => {
                          const isSelected = selectedGuestsToDelete.has(guest.id);
                          return (
                            <TouchableOpacity 
                              key={guest.id} 
                              style={[
                                styles.guestItem, 
                                isEditing && styles.guestItemEditing, 
                                isSelected && styles.guestItemSelected
                              ]}
                              onPress={isEditing ? () => handleToggleGuestDeletionSelection(guest.id) : undefined}
                              disabled={!isEditing}
                            >
                              <View style={{flex: 1}}>
                                <Text style={styles.guestName}>{guest.name}</Text>
                                {guest.guest_categories?.name && !isEditing && (
                                  <Text style={styles.guestCategory}>
                                    {guest.guest_categories.name}
                                  </Text>
                                )}
                              </View>
                              {isEditing && (
                                <Ionicons 
                                  name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
                                  size={24} 
                                  color={isSelected ? "#007aff" : "#c7c7cc"} 
                                />
                              )}
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </ScrollView>
                    {isEditing && selectedGuestsToDelete.size > 0 && (
                      <TouchableOpacity style={styles.deleteButton} onPress={handleRemoveGuestsFromTable}>
                        <Ionicons name="trash-outline" size={20} color="white" />
                        <Text style={styles.deleteButtonText}>מחק {selectedGuestsToDelete.size} אורחים</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyTable}>
                    <Ionicons name="people-outline" size={24} color="#c7c7cc" />
                    <Text style={styles.emptyTableText}>אין אורחים יושבים בשולחן זה</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Add Guests Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModalButton} onPress={closeModal}>
              <Ionicons name="close-circle" size={30} color="#e9ecef" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              הוסף אורחים לשולחן {selectedTable?.number}
              {selectedTable?.name && ` - ${selectedTable.name}`}
            </Text>

            <View style={styles.filterContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="חיפוש לפי שם..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#8e8e93"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
                <View style={styles.categoryContainer}>
                  {categories.map(category => (
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

            <FlatList
              data={filteredUnseatedGuests}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.selectableGuestItem}
                  onPress={() => handleToggleGuestSelection(item.id)}
                >
                  <View style={styles.guestInfo}>
                    <Text style={styles.guestName}>{item.name}</Text>
                    {item.guest_categories?.name && (
                      <Text style={styles.guestCategory}>
                        {item.guest_categories.name}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={selectedGuestsToAdd.has(item.id) ? "checkbox" : "square-outline"}
                    size={24}
                    color={selectedGuestsToAdd.has(item.id) ? "#007aff" : "#ccc"}
                  />
                </TouchableOpacity>
              )}
              style={{ flex: 1, marginTop: 16 }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  כל האורחים שהגיעו כבר הושבו
                </Text>
              }
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
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#8e8e93',
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f8ff',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1c1c1e',
    textAlign: 'center',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f7',
  },
  tableInfo: {
    flex: 1,
  },
  tableActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tableNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c1c1e',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  capacityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  capacityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  guestsContainer: {
    padding: 20,
  },
  guestsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
    marginBottom: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestsListScrollView: {
    maxHeight: 150,
  },
  guestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestItem: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderRightWidth: 3,
    borderRightColor: '#007aff',
    width: '48%',
  },
  guestItemEditing: {
    borderRightColor: '#adb5bd',
  },
  guestItemSelected: {
    borderRightColor: '#007aff',
    backgroundColor: '#e7f5ff',
  },
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1c1e',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestCategory: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyTable: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTableText: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 8,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#e7f5ff',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007aff',
  },
  editButton: {
    backgroundColor: '#e7f5ff',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007aff',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3b30',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '80%',
    width: '100%',
  },
  closeModalButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#1c1c1e',
    writingDirection: 'rtl',
  },
  filterContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
    width: '100%',
  },
  searchInput: {
    backgroundColor: '#f2f2f7',
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
    backgroundColor: '#f2f2f7',
    marginLeft: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#007aff',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007aff',
    textAlign: 'center',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  selectableGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f2f2f7',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  guestInfo: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#8e8e93',
  },
  finalAddButton: {
    backgroundColor: '#007aff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  finalAddButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#a9a9a9',
  },
}); 