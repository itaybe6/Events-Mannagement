import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Ionicons } from '@expo/vector-icons';
import { Table } from '@/types';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutStore } from '@/store/layoutStore';
import { colors } from '@/constants/colors';
import { EventSwitcher } from '@/components/EventSwitcher';

export default function TablesList() {
  const userData = useUserStore((s) => s.userData);
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
  const [moveGuestsOpen, setMoveGuestsOpen] = useState(false);
  const [moveGuestsSaving, setMoveGuestsSaving] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);

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

  const refresh = useCallback(async () => {
    if (!resolvedEventId) return;
    setLoading(true);
    try {
      await Promise.all([fetchTables(), fetchGuests()]);
    } finally {
      setLoading(false);
    }
  }, [resolvedEventId]);

  useEffect(() => {
    if (userData?.id && resolvedEventId) setActiveEvent(userData.id, resolvedEventId);
  }, [resolvedEventId, setActiveEvent, userData?.id]);

  // Refresh whenever you return to this screen (e.g. after seating changes elsewhere)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
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
        supabase
          .from('guests')
          .select('*')
          .eq('event_id', resolvedEventId),
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
      console.error('Error fetching guests:', error);
    }
  };

  const orphanedGuests = useMemo(() => {
    const tableIds = new Set((tables || []).map((t) => t.id));
    return (guests || []).filter((g) => g?.table_id && !tableIds.has(g.table_id));
  }, [guests, tables]);

  const clearOrphanedSeating = useCallback(async () => {
    const ids = orphanedGuests.map((g) => g.id).filter(Boolean);
    if (!ids.length) return;
    const { error } = await supabase.from('guests').update({ table_id: null }).in('id', ids);
    if (error) {
      console.error('Error clearing orphaned seating:', error);
      return;
    }
    await refresh();
  }, [orphanedGuests, refresh]);

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

  const openMoveGuests = () => {
    setMoveTargetTableId(null);
    setMoveGuestsOpen(true);
    setTabBarVisible(false);
  };

  const closeMoveGuests = () => {
    setMoveGuestsOpen(false);
    setTabBarVisible(true);
  };

  const handleMoveGuestsToTable = async () => {
    if (!editingTableId) return;
    if (!moveTargetTableId) return;
    if (selectedGuestsToDelete.size === 0) return;

    const ids = Array.from(selectedGuestsToDelete);
    const idsSet = new Set(ids.map((x) => String(x)));

    setMoveGuestsSaving(true);
    try {
      const { error } = await supabase
        .from('guests')
        .update({ table_id: moveTargetTableId })
        .in('id', ids);
      if (error) throw error;

      // Update seated counts (best-effort)
      const movedGuests = (guests || []).filter((g: any) => idsSet.has(String(g?.id)));
      const movedPeople = movedGuests.reduce((sum: number, g: any) => sum + (Number(g?.numberOfPeople) || 1), 0);

      const remainingAtSource = (guests || []).filter(
        (g: any) => String(g?.table_id || '') === String(editingTableId) && !idsSet.has(String(g?.id))
      );
      const currentAtTarget = (guests || []).filter(
        (g: any) => String(g?.table_id || '') === String(moveTargetTableId)
      );

      const nextSourcePeople = remainingAtSource.reduce((sum: number, g: any) => sum + (Number(g?.numberOfPeople) || 1), 0);
      const nextTargetPeople =
        currentAtTarget.reduce((sum: number, g: any) => sum + (Number(g?.numberOfPeople) || 1), 0) + movedPeople;

      await Promise.all([
        supabase.from('tables').update({ seated_guests: nextSourcePeople }).eq('id', editingTableId),
        supabase.from('tables').update({ seated_guests: nextTargetPeople }).eq('id', moveTargetTableId),
      ]);

      await fetchGuests();
      await fetchTables();

      setSelectedGuestsToDelete(new Set());
      setMoveGuestsOpen(false);
      setTabBarVisible(true);
    } catch (e) {
      console.error('Error moving guests to another table:', e);
    } finally {
      setMoveGuestsSaving(false);
    }
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
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>{fullTables}</Text>
              <Text style={styles.statLabel}>מלאים</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="grid-outline" size={18} color="#3B82F6" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>{totalTables}</Text>
              <Text style={styles.statLabel}>שולחנות</Text>
            </View>
          </View>
        </View>
      </View>

      {orphanedGuests.length > 0 && (
        <View style={styles.orphanCard}>
          <View style={styles.orphanContent}>
            <Ionicons name="alert-circle" size={20} color="#F59E0B" />
            <View style={styles.orphanTextWrap}>
              <Text style={styles.orphanTitle}>אורחים ללא שולחן</Text>
              <Text style={styles.orphanText}>
                {`${orphanedGuests.length} אורחים משויכים לשולחנות שלא קיימים`}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.orphanBtn} onPress={clearOrphanedSeating}>
            <Ionicons name="refresh" size={16} color="#1F2937" />
            <Text style={styles.orphanBtnText}>אפס שיוך</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.eventSwitcherWrap}>
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
                <View style={styles.tableLeft}>
                  <View style={[styles.tableNumberBadge, isTableFull && styles.tableNumberBadgeFull]}>
                    <Text style={[styles.tableNumberText, isTableFull && styles.tableNumberTextFull]}>
                      {table.number}
                    </Text>
                  </View>
                  <View style={styles.tableTitleWrap}>
                    <Text style={[styles.tableTitle, isTableFull && styles.tableTitleFull]}>
                      שולחן {table.number}
                    </Text>
                    {table.name && (
                      <Text style={styles.tableSubtitle}>{table.name}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.tableRight}>
                  <View style={[styles.capacityBadge, isTableFull && styles.capacityBadgeFull]}>
                    <Ionicons 
                      name="person" 
                      size={14} 
                      color={isTableFull ? "#10B981" : "#6B7280"} 
                    />
                    <Text style={[styles.capacityText, isTableFull && styles.capacityTextFull]}>
                      {totalPeopleSeated}/{table.capacity}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.actionButton} 
                    onPress={() => openAddGuestsModal(table)}
                  >
                    <Ionicons name="add-circle-outline" size={22} color="#3B82F6" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.actionButton} 
                    onPress={() => handleEditPress(table.id)}
                  >
                    <Ionicons 
                      name={isEditing ? "close-circle-outline" : "create-outline"} 
                      size={22} 
                      color={isEditing ? "#EF4444" : "#6B7280"} 
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.guestsContainer}>
                {tableGuests.length > 0 ? (
                  <>
                    <ScrollView style={styles.guestsListScrollView} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      <View style={styles.guestsList}>
                        {tableGuests.map((guest) => {
                          const isSelected = selectedGuestsToDelete.has(guest.id);
                          return (
                            <TouchableOpacity 
                              key={guest.id} 
                              style={[
                                styles.guestChip, 
                                isEditing && styles.guestChipEditing, 
                                isSelected && styles.guestChipSelected
                              ]}
                              onPress={isEditing ? () => handleToggleGuestDeletionSelection(guest.id) : undefined}
                              disabled={!isEditing}
                              activeOpacity={0.7}
                            >
                              <View style={styles.guestChipContent}>
                                {guest.numberOfPeople > 1 && (
                                  <View style={styles.peopleCountMini}>
                                    <Text style={styles.peopleCountMiniText}>{guest.numberOfPeople}</Text>
                                  </View>
                                )}
                                <Text style={styles.guestChipName} numberOfLines={2}>
                                  {guest.name}
                                </Text>
                                {isEditing && isSelected && (
                                  <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                                )}
                              </View>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    </ScrollView>
                    {isEditing && selectedGuestsToDelete.size > 0 && (
                      <View style={styles.editActionsRow}>
                        <TouchableOpacity
                          style={styles.secondaryActionBtn}
                          onPress={openMoveGuests}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="swap-horizontal-outline" size={16} color="#111827" />
                          <Text style={styles.secondaryActionBtnText}>העבר לשולחן</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteButton} onPress={handleRemoveGuestsFromTable} activeOpacity={0.8}>
                          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.deleteButtonText}>הסר {selectedGuestsToDelete.size}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyTable}>
                    <Ionicons name="cafe-outline" size={28} color="#D1D5DB" />
                    <Text style={styles.emptyTableText}>שולחן ריק</Text>
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
            <View style={styles.modalHandle} />
            <TouchableOpacity style={styles.closeModalButton} onPress={closeModal}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              הוסף אורחים לשולחן {selectedTable?.number}
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
                  activeOpacity={0.7}
                >
                  <View style={styles.guestInfo}>
                    <Text style={styles.selectableGuestName} numberOfLines={2}>{item.name}</Text>
                    {item.guest_categories?.name && (
                      <Text style={styles.selectableGuestCategory} numberOfLines={1}>
                        {item.guest_categories.name}
                      </Text>
                    )}
                    {item.numberOfPeople > 1 && (
                      <View style={styles.peopleCountBadge}>
                        <Ionicons name="people" size={12} color="#6B7280" />
                        <Text style={styles.peopleCountText}>{item.numberOfPeople}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[
                    styles.checkbox,
                    selectedGuestsToAdd.has(item.id) && styles.checkboxChecked
                  ]}>
                    {selectedGuestsToAdd.has(item.id) && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </View>
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
              activeOpacity={0.8}
            >
              <Ionicons 
                name="add-circle" 
                size={20} 
                color={selectedGuestsToAdd.size === 0 ? '#9CA3AF' : '#FFFFFF'} 
              />
              <Text style={styles.finalAddButtonText}>
                {selectedGuestsToAdd.size > 0 ? `הוסף ${selectedGuestsToAdd.size}` : 'בחר אורחים'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Move guests to another table (edit mode) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={moveGuestsOpen}
        onRequestClose={closeMoveGuests}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <TouchableOpacity style={styles.closeModalButton} onPress={closeMoveGuests}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>העברה לשולחן אחר</Text>

            <Text style={styles.changeCategoryHint}>
              {`נבחרו ${selectedGuestsToDelete.size} אורחים. בחר שולחן יעד:`}
            </Text>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {tables
                .filter((t) => String(t.id) !== String(editingTableId))
                .map((t) => (
                <TouchableOpacity
                  key={String(t.id)}
                  style={[styles.categoryPickRow, moveTargetTableId === String(t.id) && styles.categoryPickRowActive]}
                  onPress={() => setMoveTargetTableId(String(t.id))}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.categoryPickText, moveTargetTableId === String(t.id) && styles.categoryPickTextActive]}>
                    {`שולחן ${(t as any).number ?? t.number ?? ''}${t.name ? ` · ${t.name}` : ''}`}
                  </Text>
                  <Ionicons
                    name={moveTargetTableId === String(t.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={moveTargetTableId === String(t.id) ? '#3B82F6' : '#D1D5DB'}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.finalAddButton,
                (!moveTargetTableId || moveGuestsSaving) ? styles.disabledButton : null
              ]}
              onPress={handleMoveGuestsToTable}
              disabled={!moveTargetTableId || moveGuestsSaving || selectedGuestsToDelete.size === 0}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={20} color="#FFFFFF" />
              <Text style={styles.finalAddButtonText}>{moveGuestsSaving ? 'מעביר...' : 'העבר לשולחן'}</Text>
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
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 17,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  statsBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statsGrid: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 24,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  eventSwitcherWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  tableCardFull: {
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  tableHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  tableNumberBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableNumberBadgeFull: {
    backgroundColor: '#D1FAE5',
  },
  tableNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  tableNumberTextFull: {
    color: '#10B981',
  },
  tableTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tableTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  tableTitleFull: {
    color: '#10B981',
  },
  tableSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  tableRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  capacityBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  capacityBadgeFull: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  capacityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  capacityTextFull: {
    color: '#10B981',
  },
  actionButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  guestsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guestsListScrollView: {
    maxHeight: 240,
  },
  guestsList: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestChip: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '49%',
    minWidth: 140,
  },
  guestChipEditing: {
    borderColor: '#D1D5DB',
  },
  guestChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  guestChipContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  guestChipName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
    textAlign: 'right',
    lineHeight: 18,
  },
  peopleCountMini: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleCountMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyTable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyTableText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    gap: 6,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  editActionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 12,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  secondaryActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  changeCategoryHint: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
    marginBottom: 12,
  },
  categoryPickRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  categoryPickRowActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  categoryPickText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
  },
  categoryPickTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 16,
    height: '80%',
    width: '100%',
  },
  modalHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  closeModalButton: {
    position: 'absolute',
    top: 20,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
    color: '#111827',
  },
  filterContainer: {
    marginBottom: 16,
    alignItems: 'flex-end',
    width: '100%',
  },
  searchInput: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    textAlign: 'right',
    marginBottom: 12,
    width: '100%',
    color: '#111827',
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginLeft: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  selectableGuestItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '47%',
  },
  guestInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  selectableGuestName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
    lineHeight: 19,
  },
  selectableGuestCategory: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'right',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  finalAddButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 8,
  },
  finalAddButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  peopleCountBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  peopleCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginRight: 4,
  },
  orphanCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  orphanContent: { 
    flexDirection: 'row-reverse', 
    alignItems: 'flex-start', 
    gap: 10, 
    marginBottom: 10 
  },
  orphanTextWrap: { 
    flex: 1, 
    alignItems: 'flex-end' 
  },
  orphanTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  orphanText: { 
    fontSize: 13, 
    fontWeight: '500',
    color: '#78350F', 
    textAlign: 'right',
  },
  orphanBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  orphanBtnText: { 
    color: '#1F2937', 
    fontWeight: '600',
    fontSize: 13,
  },
});
