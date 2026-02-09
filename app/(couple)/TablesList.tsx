import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Ionicons } from '@expo/vector-icons';
import { Table } from '@/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutStore } from '@/store/layoutStore';
import { colors } from '@/constants/colors';
import { EventSwitcher } from '@/components/EventSwitcher';

export default function TablesList() {
  const { userData } = useUserStore();
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
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

  useEffect(() => {
    if (resolvedEventId) {
      setLoading(true);
      Promise.all([
        fetchTables(),
        fetchGuests(),
      ]).finally(() => setLoading(false));
    }
    if (userData?.id && resolvedEventId) setActiveEvent(userData.id, resolvedEventId);
  }, [resolvedEventId, userData?.id, setActiveEvent]);

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
      ] = await Promise.all([
        supabase
          .from('guests')
          .select('*')
          .eq('event_id', resolvedEventId)
          .eq('status', 'מגיע'),
        supabase.from('guest_categories').select('id,name').eq('event_id', resolvedEventId),
      ]);

      if (guestsError) throw guestsError;
      if (categoriesError) throw categoriesError;

      const categoryNameById = new Map<string, string>(
        (categoriesData || []).map((c: any) => [c.id, c.name])
      );

      const mappedGuests = (guestsData || []).map((guest: any) => ({
        ...guest,
        guest_categories: guest.category_id
          ? { name: categoryNameById.get(guest.category_id) }
          : null,
        numberOfPeople: guest.number_of_people || 1,
      }));

      setGuests(mappedGuests);
    } catch (error) {
      console.error('Error fetching guests:', error);
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

    // חישוב סכום האנשים שמתווספים
    const guestsToAdd = guests.filter(g => guestIds.includes(g.id));
    const totalPeopleToAdd = guestsToAdd.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

    // Update guests
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: tableId })
      .in('id', guestIds);
    
    if (guestUpdateError) {
      console.error("Error updating guests:", guestUpdateError);
      return;
    }
    
    // עדכון מספר המוזמנים בשולחן - חישוב מחדש של כל האנשים בשולחן
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
    if (selectedGuestsToDelete.size === 0 || !editingTableId) return

    const guestIds = Array.from(selectedGuestsToDelete);
    
    // חישוב סכום האנשים שמוסרים
    const guestsToRemove = guests.filter(g => guestIds.includes(g.id));
    const totalPeopleToRemove = guestsToRemove.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
    
    // 1. Update guests' table_id to null
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: null })
      .in('id', guestIds);

    if (guestUpdateError) {
      console.error("Error removing guests from table:", guestUpdateError);
      return;
    }

    // 2. עדכון מספר האנשים בשולחן - חישוב מחדש בלי האורחים שהוסרו
    const remainingGuestsAtTable = guests.filter(g => g.table_id === editingTableId && !guestIds.includes(g.id));
    const newTotalPeople = remainingGuestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
    
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: newTotalPeople })
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!resolvedEventId) {
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

  const fullTables = tables.filter(t => {
    const tableGuests = getGuestsForTable(t.id);
    const totalPeopleSeated = tableGuests.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
    return totalPeopleSeated >= t.capacity;
  }).length;
  const totalTables = tables.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, styles.backBtnAbs]}
          onPress={() =>
            router.push({
              pathname: '/(couple)/BrideGroomSeating',
              params: resolvedEventId ? { eventId: resolvedEventId } : {},
            })
          }
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>שולחנות</Text>
        <View style={[styles.headerStats, styles.statsAbs]}>
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.statText}>{fullTables} מלאים</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="sync-circle" size={20} color={colors.secondary} />
            <Text style={styles.statText}>{totalTables} בהושבה</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <EventSwitcher
          userId={userData?.id}
          selectedEventId={resolvedEventId}
          onSelectEventId={handleSelectEventId}
          label="אירוע פעיל"
        />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollViewContent}>
        {tables.map((table) => {
          const tableGuests = getGuestsForTable(table.id);
          const totalPeopleSeated = tableGuests.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
          const isEditing = editingTableId === table.id;
          const isTableFull = totalPeopleSeated >= table.capacity;
          
          return (
            <View key={table.id} style={[styles.tableCard, isTableFull && styles.tableCardFull]}>
              <View style={styles.tableHeader}>
                <View style={[styles.capacityInfo, isTableFull && styles.capacityInfoFull]}>
                  <Ionicons 
                    name="people" 
                    size={16} 
                    color={isTableFull ? colors.white : colors.gray[500]} 
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.capacityText, isTableFull && styles.capacityTextFull]}>
                    {totalPeopleSeated} / {table.capacity}
                  </Text>
                </View>
                <View style={styles.tableInfo}>
                  <Text style={[styles.tableNumber, isTableFull && styles.tableNumberFull]}>
                    שולחן {table.number}
                    {table.name && ` - ${table.name}`}
                  </Text>
                </View>
                <View style={styles.tableActions}>
                  <TouchableOpacity 
                    style={styles.addButton} 
                    onPress={() => openAddGuestsModal(table)}
                  >
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => handleEditPress(table.id)}
                  >
                    <Ionicons name={isEditing ? "close" : "pencil"} size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.guestsContainer, isTableFull && styles.guestsContainerFull]}>
                {tableGuests.length > 0 ? (
                  <>
                    <Text style={[styles.guestsTitle, isTableFull && styles.guestsTitleFull]}>אורחים יושבים:</Text>
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
                              <View style={{flex: 1, position: 'relative'}}>
                                <View style={styles.peopleCountBadgeTopLeft}>
                                  <Ionicons name="person" size={10} color={colors.richBlack} />
                                  <Text style={styles.peopleCountTextSmall}>{guest.numberOfPeople || 1}</Text>
                                </View>
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
                                  color={isSelected ? colors.primary : colors.gray[300]} 
                                />
                              )}
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </ScrollView>
                    {isEditing && selectedGuestsToDelete.size > 0 && (
                      <TouchableOpacity style={styles.deleteButton} onPress={handleRemoveGuestsFromTable}>
                        <Ionicons name="trash-outline" size={20} color={colors.white} />
                        <Text style={styles.deleteButtonText}>מחק {selectedGuestsToDelete.size} אורחים</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyTable}>
                    <Ionicons name="people-outline" size={24} color={colors.gray[300]} />
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
              <Ionicons name="close-circle" size={30} color={colors.gray[200]} />
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
                placeholderTextColor={colors.gray[500]}
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
              numColumns={2}
              columnWrapperStyle={{ justifyContent: 'space-between' }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.selectableGuestItem}
                  onPress={() => handleToggleGuestSelection(item.id)}
                >
                  <View style={[styles.guestInfo, {position: 'relative'}]}>
                    <View style={styles.peopleCountBadgeTopLeft}>
                      <Ionicons name="person" size={10} color={colors.richBlack} />
                      <Text style={styles.peopleCountTextSmall}>{item.numberOfPeople || 1}</Text>
                    </View>
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
                    color={selectedGuestsToAdd.has(item.id) ? colors.primary : colors.gray[300]}
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
    backgroundColor: colors.gray[50],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: colors.textLight,
    textAlign: 'center',
  },
  header: {
    position: 'relative',
    backgroundColor: colors.white,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.gray[50],
  },
  backBtnAbs: {
    position: 'absolute',
    left: 20,
    top: 20,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statsAbs: {
    position: 'absolute',
    right: 20,
    top: 24,
    zIndex: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  scrollViewContent: {
    paddingBottom: 100,
  },
  tableCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  tableCardFull: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 2,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
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
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tableNumberFull: {
    color: colors.success,
    fontWeight: '800',
  },
  capacityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  capacityText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  capacityInfoFull: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  capacityTextFull: {
    color: colors.white,
    fontWeight: '700',
  },
  guestsContainer: {
    padding: 20,
  },
  guestsContainerFull: {
    backgroundColor: colors.gray[50],
    borderTopWidth: 1,
    borderTopColor: colors.success,
  },
  guestsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestsTitleFull: {
    color: colors.success,
    fontWeight: '700',
  },
  guestsListScrollView: {
    maxHeight: 250,
  },
  guestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestItem: {
    backgroundColor: colors.gray[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderRightWidth: 3,
    borderRightColor: colors.primary,
    width: '48%',
  },
  guestItemEditing: {
    borderRightColor: colors.gray[400],
  },
  guestItemSelected: {
    borderRightColor: colors.primary,
    backgroundColor: 'rgba(0, 53, 102, 0.08)',
  },
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestCategory: {
    fontSize: 14,
    color: colors.textLight,
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
    color: colors.textLight,
    marginTop: 8,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: 'rgba(0, 53, 102, 0.08)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editButton: {
    backgroundColor: 'rgba(0, 53, 102, 0.08)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  deleteButtonText: {
    color: colors.white,
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
    backgroundColor: colors.white,
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
  selectableGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    width: '47%',
  },
  guestInfo: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: colors.textLight,
  },
  finalAddButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  finalAddButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: colors.gray[400],
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[300],
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  peopleCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.richBlack,
    marginLeft: 4,
  },
  peopleCountBadgeTopLeft: {
    position: 'absolute',
    top: -8,
    left: -8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[300],
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
    borderWidth: 1,
    borderColor: colors.white,
  },
  peopleCountTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.richBlack,
    marginLeft: 2,
  },
}); 