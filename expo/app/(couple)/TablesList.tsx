import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Ionicons } from '@expo/vector-icons';
import { Table } from '@/types';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { useLayoutStore } from '@/store/layoutStore';
import { colors } from '@/constants/colors';
import { EventSwitcher } from '@/components/EventSwitcher';
import BackSwipe from '@/components/BackSwipe';
import { AppLoader, AppLoaderScreen } from '@/components/AppLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALIGN_LEFT, ALIGN_RIGHT, IS_RTL, ROW_DIR, ROW_REVERSE_DIR } from '@/lib/rtl';

export default function TablesList() {
  const userData = useUserStore((s) => s.userData);
  const router = useRouter();
  const segments = useSegments();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const { setTabBarVisible } = useLayoutStore();
  const insets = useSafeAreaInsets();
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
  const [editingTableName, setEditingTableName] = useState('');
  const [savingTableName, setSavingTableName] = useState(false);
  const [moveGuestsOpen, setMoveGuestsOpen] = useState(false);
  const [moveGuestsSaving, setMoveGuestsSaving] = useState(false);
  const [addingGuestsToTable, setAddingGuestsToTable] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);
  const categoryScrollRef = useRef<ScrollView | null>(null);

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const isAdminContext = useMemo(() => segments.includes('(admin)'), [segments]);
  const backHref = useMemo(() => {
    if (resolvedEventId) {
      return isAdminContext ? `/(admin)/admin-event-details?id=${resolvedEventId}` : `/(couple)?eventId=${resolvedEventId}`;
    }
    return isAdminContext ? '/(admin)/admin-events' : '/(couple)';
  }, [isAdminContext, resolvedEventId]);

  const handleBack = useCallback(() => {
    router.replace(backHref as any);
  }, [backHref, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

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

  useEffect(() => {
    if (!modalVisible || !IS_RTL) return;
    const timer = setTimeout(() => {
      categoryScrollRef.current?.scrollToEnd({ animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [modalVisible, categories.length]);

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
    return guests.filter(guest => !guest.table_id);
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
    if (selectedGuestsToAdd.size === 0 || !selectedTable || addingGuestsToTable) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const tableId = selectedTable.id;

    setAddingGuestsToTable(true);
    try {
      // חישוב סכום האנשים שמתווספים
      const guestsToAdd = guests.filter(g => guestIds.includes(g.id));
      const totalPeopleToAdd = guestsToAdd.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

      const { error: guestUpdateError } = await supabase
        .from('guests')
        .update({ table_id: tableId })
        .in('id', guestIds);

      if (guestUpdateError) {
        console.error("Error updating guests:", guestUpdateError);
        Alert.alert('שגיאה', 'לא ניתן להוסיף את האורחים לשולחן');
        return;
      }

      const currentGuestsAtTable = guests.filter(g => g.table_id === tableId);
      const currentTotalPeople = currentGuestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
      const newTotalPeople = currentTotalPeople + totalPeopleToAdd;

      const { error: tableUpdateError } = await supabase
        .from('tables')
        .update({ seated_guests: newTotalPeople })
        .eq('id', tableId);

      if (tableUpdateError) {
        console.error("Error updating table count:", tableUpdateError);
        Alert.alert('שגיאה', 'לא ניתן לעדכן את מספר היושבים בשולחן');
        return;
      }

      await fetchGuests();
      await fetchTables();

      setModalVisible(false);
      setTabBarVisible(true);
      setSelectedGuestsToAdd(new Set());
    } finally {
      setAddingGuestsToTable(false);
    }
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
    if (addingGuestsToTable) return;
    setModalVisible(false);
    setTabBarVisible(true);
  };

  const handleEditPress = async (tableId: string) => {
    if (editingTableId === tableId) {
      const currentTable = tables.find((x) => String(x.id) === String(tableId));
      const currentName = String((currentTable as any)?.name ?? '').trim();
      const nextName = String(editingTableName ?? '').trim();

      if (nextName !== currentName) {
        await handleSaveTableName(tableId);
        return;
      }

      setEditingTableId(null);
      setSelectedGuestsToDelete(new Set());
      setEditingTableName('');
    } else {
      setEditingTableId(tableId);
      setSelectedGuestsToDelete(new Set());
      const t = tables.find((x) => String(x.id) === String(tableId));
      setEditingTableName(String((t as any)?.name ?? '').trim());
    }
  };

  const handleSaveTableName = async (tableId: string) => {
    const next = String(editingTableName ?? '').trim();
    setSavingTableName(true);
    try {
      const { error } = await supabase
        .from('tables')
        .update({ name: next || null })
        .eq('id', tableId);
      if (error) throw error;
      await fetchTables();
      Alert.alert('נשמר', 'שם השולחן עודכן');
      // Exit edit mode after saving (as requested)
      setEditingTableId(null);
      setSelectedGuestsToDelete(new Set());
      setEditingTableName('');
    } catch (e) {
      console.error('Error updating table name:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את שם השולחן');
    } finally {
      setSavingTableName(false);
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
      <BackSwipe fallbackHref={backHref} onBack={handleBack}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppLoaderScreen variant="default" title="טוען שולחנות" subtitle="מעדכן את רשימת השולחנות" />
      </BackSwipe>
    );
  }

  if (!resolvedEventId) {
    return (
      <BackSwipe fallbackHref={backHref} onBack={handleBack}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>אין אירוע זמין</Text>
        </View>
      </BackSwipe>
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
  const scrollTopPad = Math.max(14, (insets.top || 0) + 14);

  return (
    <BackSwipe fallbackHref={backHref} onBack={handleBack}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.scrollFill}>
          <AppKeyboardAwareScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollViewContent, { paddingTop: scrollTopPad }]}
          >
          <View style={styles.statsBar}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Ionicons name="grid-outline" size={18} color="#3B82F6" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue}>{totalTables}</Text>
                  <Text style={styles.statLabel}>שולחנות</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={styles.statIconContainer}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue}>{fullTables}</Text>
                  <Text style={styles.statLabel}>מלאים</Text>
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

          {hasMultipleEvents ? (
            <View style={styles.eventSwitcherWrap}>
              <EventSwitcher
                userId={userData?.id}
                selectedEventId={resolvedEventId}
                onSelectEventId={handleSelectEventId}
                label="אירוע פעיל"
                onHasMultipleChange={setHasMultipleEvents}
              />
            </View>
          ) : (
            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע פעיל"
              onHasMultipleChange={setHasMultipleEvents}
            />
          )}

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
                      {!isEditing && (
                        <Text style={[styles.tableTitle, isTableFull && styles.tableTitleFull]}>
                          שולחן {table.number}
                        </Text>
                      )}
                      {isEditing ? (
                        <View style={styles.tableNameEditWrap}>
                          <TextInput
                            value={editingTableName}
                            onChangeText={(t) => setEditingTableName(String(t || '').slice(0, 20))}
                            onSubmitEditing={() => void handleSaveTableName(String(table.id))}
                            onBlur={() => {
                              const currentName = String((table as any)?.name ?? '').trim();
                              const nextName = String(editingTableName ?? '').trim();
                              if (nextName !== currentName) {
                                void handleSaveTableName(String(table.id));
                              }
                            }}
                            placeholder="שם שולחן"
                            placeholderTextColor="#9CA3AF"
                            style={styles.tableNameInput}
                            textAlign="right"
                            maxLength={20}
                            returnKeyType="done"
                          />
                        </View>
                      ) : null}
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
                      onPress={() => void handleEditPress(table.id)}
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
                                  <Text style={styles.guestChipName} numberOfLines={2}>
                                    {guest.name}
                                  </Text>
                                  <View style={styles.peopleCountMini}>
                                    <Text style={styles.peopleCountMiniText}>{Number(guest.numberOfPeople ?? 1) || 1}</Text>
                                  </View>
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
                          <TouchableOpacity style={styles.deleteButton} onPress={handleRemoveGuestsFromTable} activeOpacity={0.8}>
                            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.deleteButtonText}>הסר {selectedGuestsToDelete.size}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={openMoveGuests}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="swap-horizontal-outline" size={16} color="#111827" />
                            <Text style={styles.secondaryActionBtnText}>העבר לשולחן</Text>
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
        </AppKeyboardAwareScrollView>
        </View>
      </View>

      {/* Add Guests Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AppLoader
              visible={addingGuestsToTable}
              variant="seating"
              count={selectedGuestsToAdd.size}
              tableNumber={selectedTable?.number}
            />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={closeModal}
                activeOpacity={0.85}
                disabled={addingGuestsToTable}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>
                  הוסף אורחים לשולחן {selectedTable?.number}
                </Text>
                <Text style={styles.modalSubtitle}>
                  בחר אורחים פנויים לשיוך מהיר לשולחן הנוכחי
                </Text>
              </View>
            </View>

            <View style={styles.filterContainer}>
              <View style={styles.searchBox}>
                <View style={styles.searchIconWrap}>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                </View>
                <TextInput
                  style={styles.searchInput}
                  placeholder="חיפוש לפי שם..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={colors.gray[500]}
                  textAlign="right"
                />
              </View>
              <ScrollView
                ref={categoryScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScrollView}
                contentContainerStyle={[styles.categoryScrollContent, IS_RTL && styles.categoryScrollContentRtl]}
              >
                <View style={[styles.categoryContainer, IS_RTL && styles.categoryContainerRtl]}>
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

            <View style={styles.modalListMeta}>
              <Text style={styles.modalListMetaText}>
                {`${filteredUnseatedGuests.length} אורחים זמינים`}
              </Text>
              <View style={styles.selectedCountPill}>
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                <Text style={styles.selectedCountPillText}>{`${selectedGuestsToAdd.size} נבחרו`}</Text>
              </View>
            </View>

            <FlatList
              data={filteredUnseatedGuests}
              keyExtractor={(item) => item.id.toString()}
              numColumns={2}
              columnWrapperStyle={styles.selectableGuestRow}
              renderItem={({ item }) => {
                const status = item.status || 'ממתין';
                const statusConfig = status === 'מגיע'
                  ? { icon: 'checkmark-circle' as const, color: '#4CAF50', label: 'מגיע' }
                  : status === 'לא מגיע'
                    ? { icon: 'close-circle' as const, color: '#F44336', label: 'לא מגיע' }
                    : { icon: 'time-outline' as const, color: '#F59E0B', label: 'ממתין' };
                return (
                <TouchableOpacity
                  style={styles.selectableGuestItem}
                  onPress={() => handleToggleGuestSelection(item.id)}
                  activeOpacity={0.7}
                  disabled={addingGuestsToTable}
                >
                  {/* Top row: status icon (left) + checkbox (right) */}
                  <View style={styles.guestCardTop}>
                    <View style={[styles.statusIconWrap, { backgroundColor: statusConfig.color + '18' }]}>
                      <Ionicons name={statusConfig.icon} size={13} color={statusConfig.color} />
                    </View>
                    <View style={[styles.checkbox, selectedGuestsToAdd.has(item.id) && styles.checkboxChecked]}>
                      {selectedGuestsToAdd.has(item.id) && (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                  {/* Name */}
                  <Text style={styles.selectableGuestName} numberOfLines={2}>{item.name}</Text>
                  {/* Footer: category + people count */}
                  <View style={styles.guestCardFooter}>
                    {item.guest_categories?.name && (
                      <Text style={styles.selectableGuestCategory} numberOfLines={1}>
                        {item.guest_categories.name}
                      </Text>
                    )}
                    <View style={styles.peopleCountBadge}>
                      <Ionicons name="people" size={11} color="#6B7280" />
                      <Text style={styles.peopleCountText}>{Number(item.numberOfPeople ?? 1) || 1}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                );
              }}
              style={styles.selectableGuestsList}
              contentContainerStyle={styles.selectableGuestsListContent}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  אין אורחים ללא שולחן
                </Text>
              }
            />

            <TouchableOpacity
              style={[
                styles.finalAddButton,
                (selectedGuestsToAdd.size === 0 || addingGuestsToTable) && styles.disabledButton,
              ]}
              onPress={handleAddGuestsToTable}
              disabled={selectedGuestsToAdd.size === 0 || addingGuestsToTable}
              activeOpacity={0.8}
            >
              {addingGuestsToTable ? (
                <View style={styles.buttonLoaderWrap}>
                  <View style={styles.buttonLoaderDot} />
                  <View style={[styles.buttonLoaderDot, styles.buttonLoaderDotMid]} />
                  <View style={styles.buttonLoaderDot} />
                </View>
              ) : (
                <Ionicons
                  name="add-circle"
                  size={20}
                  color={selectedGuestsToAdd.size === 0 ? '#9CA3AF' : '#FFFFFF'}
                />
              )}
              <Text style={styles.finalAddButtonText}>
                {addingGuestsToTable
                  ? 'מושיב...'
                  : selectedGuestsToAdd.size > 0
                    ? `הוסף ${selectedGuestsToAdd.size}`
                    : 'בחר אורחים'}
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

            <AppKeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {tables
                .filter((t) => String(t.id) !== String(editingTableId))
                .map((t) => {
                  const tid = String(t.id);
                  const seatedPeople = (guests || [])
                    .filter((g: any) => String(g?.table_id || '') === tid)
                    .reduce((sum: number, g: any) => sum + (Number(g?.numberOfPeople) || 1), 0);
                  const cap = Number((t as any)?.capacity ?? 0) || 0;
                  const ratio = cap > 0 ? `${seatedPeople}/${cap}` : `${seatedPeople}`;
                  const active = moveTargetTableId === tid;
                  return (
                <TouchableOpacity
                  key={String(t.id)}
                  style={[styles.categoryPickRow, active && styles.categoryPickRowActive]}
                  onPress={() => setMoveTargetTableId(tid)}
                  activeOpacity={0.85}
                >
                  <View style={styles.tablePickTextWrap}>
                    <Text style={[styles.categoryPickText, active && styles.categoryPickTextActive]}>
                        {`שולחן ${(t as any).number ?? t.number ?? ''}`}
                    </Text>
                    <Text style={styles.tablePickMetaText}>{`יושבים: ${ratio}`}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={active ? '#3B82F6' : '#D1D5DB'}
                  />
                </TouchableOpacity>
                  );
                })}
            </AppKeyboardAwareScrollView>

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
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    fontSize: 17,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  statsBar: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statsGrid: {
    flexDirection: ROW_DIR,
    gap: 12,
  },
  statCard: {
    flex: 1,
    flexDirection: ROW_DIR,
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
    alignItems: ALIGN_RIGHT,
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
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  scrollFill: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: 16,
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
    flexDirection: ROW_DIR,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableLeft: {
    flexDirection: ROW_DIR,
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
    alignItems: ALIGN_RIGHT,
    maxWidth: '70%',
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
  tableNameEditWrap: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    width: 'auto',
    maxWidth: 160,
    alignSelf: ALIGN_RIGHT,
  },
  tableNameInput: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 112,
    maxWidth: 160,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  tableNameCharCountFloating: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  saveNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saveNameBtnFloating: {},
  tableRight: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    marginStart: 10,
  },
  capacityBadge: {
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  guestChip: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexBasis: '48%',
    maxWidth: '48%',
    alignSelf: 'flex-start',
  },
  guestChipEditing: {
    borderColor: '#D1D5DB',
  },
  guestChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  guestChipContent: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
  },
  guestChipName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
    // RN mirrors layout in RTL builds; this keeps the name visually right-aligned.
    textAlign: IS_RTL ? 'left' : 'right',
    writingDirection: IS_RTL ? 'rtl' : 'ltr',
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    gap: 10,
    marginTop: 12,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
  tablePickTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  tablePickMetaText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 34, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'web' ? 28 : 20,
    paddingHorizontal: 18,
    minHeight: Platform.OS === 'web' ? undefined : '80%',
    maxHeight: Platform.OS === 'web' ? '92%' : undefined,
    width: '100%',
    overflow: 'hidden',
  },
  modalHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  closeModalButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
    gap: 6,
  },
  modalTitle: {
    width: '100%',
    fontSize: 22,
    fontWeight: '800',
    textAlign: IS_RTL ? 'left' : 'right',
    color: '#111827',
  },
  modalSubtitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: IS_RTL ? 'left' : 'right',
    lineHeight: 20,
  },
  filterContainer: {
    marginBottom: 16,
    alignItems: ALIGN_RIGHT,
    width: '100%',
  },
  searchBox: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
    color: '#111827',
  },
  categoryScrollView: {
    width: '100%',
    marginHorizontal: -18,
  },
  categoryScrollContent: {
    paddingHorizontal: 18,
  },
  categoryScrollContentRtl: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  categoryContainer: {
    flexDirection: ROW_DIR,
    justifyContent: 'flex-start',
    paddingEnd: 0,
    gap: 8,
  },
  categoryContainerRtl: {
    minWidth: '100%',
    justifyContent: 'flex-start',
    alignSelf: ALIGN_RIGHT,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
  modalListMeta: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
    gap: 12,
  },
  modalListMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textAlign: IS_RTL ? 'left' : 'right',
  },
  selectedCountPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.16)',
  },
  selectedCountPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  selectableGuestRow: {
    flexDirection: ROW_DIR,
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  selectableGuestItem: {
    flexDirection: 'column',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
    gap: 6,
  },
  guestCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestCardFooter: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: 2,
  },
  selectableGuestsList: { flex: 1 },
  selectableGuestsListContent: {
    paddingBottom: Platform.OS === 'web' ? 96 : 24,
    alignItems: 'stretch',
  },
  selectableGuestName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: IS_RTL ? 'left' : 'right',
    lineHeight: 18,
    width: '100%',
  },
  selectableGuestCategory: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: IS_RTL ? 'left' : 'right',
    flex: 1,
    minWidth: 0,
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
    flexDirection: ROW_DIR,
    justifyContent: 'center',
    gap: 8,
  },
  finalAddButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLoaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
  },
  buttonLoaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    opacity: 0.55,
  },
  buttonLoaderDotMid: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  peopleCountBadge: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 3,
  },
  peopleCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
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
    flexDirection: ROW_DIR, 
    alignItems: 'flex-start', 
    gap: 10, 
    marginBottom: 10 
  },
  orphanTextWrap: { 
    flex: 1, 
    alignItems: ALIGN_RIGHT,
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
    alignSelf: ALIGN_LEFT,
    flexDirection: ROW_DIR,
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
