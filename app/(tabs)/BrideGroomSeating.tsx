import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, ActivityIndicator, Modal, SectionList, TextInput, FlatList } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { Ionicons } from '@expo/vector-icons';
import { useLayoutStore } from '@/store/layoutStore';
import { Table } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';

export default function BrideGroomSeating() {
  const { userData } = useUserStore();
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState<any[]>([]);
  const [modalTitle, setModalTitle] = useState('');
  const [isPositionsReady, setIsPositionsReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [textAreas, setTextAreas] = useState<any[]>([]);
  const [pressedTable, setPressedTable] = useState<string | null>(null);
  const positions = useRef<{ [id: string]: Animated.ValueXY }>({}).current;
  const scrollViewRef = useRef<ScrollView>(null);
  
  // State for filtering and searching
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('הכל');
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const [searchQueryTable, setSearchQueryTable] = useState('');
  const [categoryFilterTable, setCategoryFilterTable] = useState('הכל');
  const [categoriesForTable, setCategoriesForTable] = useState<string[]>([]);

  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [selectedTableForModal, setSelectedTableForModal] = useState<Table | null>(null);
  const [seatedGuestsForTable, setSeatedGuestsForTable] = useState<any[]>([]);
  const [selectedGuestsToAdd, setSelectedGuestsToAdd] = useState<Set<string>>(new Set());
  const [tableModalView, setTableModalView] = useState<'seated' | 'add'>('seated');
  const [tableName, setTableName] = useState('');

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
    if (selectedGuestsToAdd.size === 0) return;

    const guestIds = Array.from(selectedGuestsToAdd);
    const tableId = selectedTableForModal?.id;

    if (!tableId) return; // Ensure tableId is available

    // 1. עדכון האורחים
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: tableId })
      .in('id', guestIds);
    
    if (guestUpdateError) {
      console.error("Error updating guests:", guestUpdateError);
      return;
    }
    
    // 2. עדכון מספר המוזמנים בשולחן
    const currentSeated = seatedGuestsForTable.length;
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
    
    // Close modal and clear selection
    await closeModalAndShowTabBar();
    setSelectedGuestsToAdd(new Set());
  };

  const handleSaveTableName = async () => {
    if (!selectedTableForModal) {
      return;
    }
    
    const currentName = selectedTableForModal.name || '';
    if (tableName.trim() === currentName.trim()) {
      return; // No change, do nothing
    }
    
    const { error } = await supabase
      .from('tables')
      .update({ name: tableName.trim() || null })
      .eq('id', selectedTableForModal.id);
  
    if (error) {
      console.error('Error updating table name:', error);
    } else {
      // Update local state to reflect the change immediately
      setTables(currentTables => 
        currentTables.map(t => 
          t.id === selectedTableForModal.id ? { ...t, name: tableName.trim() || null } : t
        )
      );
      // Update the selected table for modal as well
      setSelectedTableForModal(prev => prev ? { ...prev, name: tableName.trim() || null } : null);
    }
  };

  const { setTabBarVisible } = useLayoutStore();

  const handleTablePress = (table: Table) => {
    setSelectedTableForModal(table);
    setTableName(table.name || '');
    const guestsForTable = guests.filter(g => g.table_id === table.id);
    setSeatedGuestsForTable(guestsForTable);
    
    // Reset filters and view
    setTableModalView('seated');
    setSearchQueryTable('');
    const unseated = guests.filter(g => g.status === 'מגיע' && !g.table_id);
    const categories = ['הכל', ...Array.from(new Set(unseated.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setCategoriesForTable(categories);
    setCategoryFilterTable('הכל');

    setTableModalVisible(true);
    setTabBarVisible(false);
  };

  const closeModalAndShowTabBar = async () => {
    await handleSaveTableName();
    setTableModalVisible(false);
    setTabBarVisible(true);
  };

  const handleRemoveGuestFromTable = async (guestId: string) => {
    // 1. Update guest's table_id to null
    const { error: guestUpdateError } = await supabase
      .from('guests')
      .update({ table_id: null })
      .eq('id', guestId);

    if (guestUpdateError) {
      console.error("Error removing guest from table:", guestUpdateError);
      return;
    }
    
    // 2. Decrement seated_guests count on the table
    const currentSeated = seatedGuestsForTable.length;
    const { error: tableUpdateError } = await supabase
      .from('tables')
      .update({ seated_guests: currentSeated - 1 })
      .eq('id', selectedTableForModal?.id);
      
    if (tableUpdateError) {
      console.error("Error updating table count:", tableUpdateError);
      return;
    }

    // Refresh data
    await fetchGuests();
    await fetchTables();
    
    // Refresh the modal view
    const updatedGuestsForTable = seatedGuestsForTable.filter(g => g.id !== guestId);
    setSeatedGuestsForTable(updatedGuestsForTable);
  };

  useEffect(() => {
    if (userData?.event_id) {
      setLoading(true);
      Promise.all([
        fetchTables(),
        fetchTextAreas(),
        fetchGuests(),
      ]).finally(() => setLoading(false));
    }
  }, [userData?.event_id]);

  useFocusEffect(
    useCallback(() => {
      // Fetch data every time the screen comes into focus
      if (userData?.event_id) {
        setLoading(true);
        Promise.all([
          fetchTables(),
          fetchTextAreas(),
          fetchGuests(),
        ]).finally(() => setLoading(false));
      }
    }, [userData?.event_id])
  );

  // יצירת Animated.ValueXY לכל שולחן
  useEffect(() => {
    let newPositionsCreated = false;
    tables.forEach(table => {
      if (!positions[table.id]) {
        newPositionsCreated = true;
        positions[table.id] = new Animated.ValueXY({
          x: typeof table.x === 'number' ? table.x : 40,
          y: typeof table.y === 'number' ? table.y : 60
        });
      }
    });

    // ניקוי זיכרון
    Object.keys(positions).forEach(id => {
      if (!tables.find(t => t.id === id)) {
        delete positions[id];
      }
    });

    if (newPositionsCreated) {
      setIsPositionsReady(true);
    }
  }, [tables]);

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
        guest_categories(name),
        tables(number)
      `)
      .eq('event_id', userData.event_id);
    
    if (!error) {
      // Map the data to include numberOfPeople from number_of_people column
      const mappedGuests = (data || []).map(guest => ({
        ...guest,
        numberOfPeople: guest.number_of_people || 1
      }));
      setGuests(mappedGuests);
    } else {
      console.error("Error fetching guests for stats:", error);
    }
  };

  // משיכת הערות (annotations) מה-DB
  const fetchTextAreas = async () => {
    if (!userData?.event_id) return;
    
    const { data, error } = await supabase
      .from('seating_maps')
      .select('annotations')
      .eq('event_id', userData.event_id)
      .single();
    if (!error && data && Array.isArray(data.annotations)) {
      setTextAreas(data.annotations);
    } else {
      setTextAreas([]);
    }
  };
  
  const openModalWithGuests = (title: string, guestList: any[]) => {
    setModalTitle(title);
    setSearchQuery('');
    setCategoryFilter('הכל');

    const categories = ['הכל', ...Array.from(new Set(guestList.map(g => g.guest_categories?.name || 'ללא קטגוריה')))];
    setAllCategories(categories);
    
    const groupedGuests = guestList.reduce((groups: any, guest: any) => {
      const category = guest.guest_categories?.name || 'ללא קטגוריה';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(guest);
      return groups;
    }, {});
    
    const sectionsData = Object.keys(groupedGuests).map(category => ({
      id: category,
      title: category,
      data: groupedGuests[category],
    }));
    
    setModalData(sectionsData);
    setModalVisible(true);
  };

  const resetZoom = () => setZoom(1);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }
  
  if (!userData?.event_id) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>אין אירוע זמין</Text>
      </View>
    );
  }

  const confirmedGuestsList = guests.filter(g => g.status === 'מגיע');
  const seatedGuestsList = confirmedGuestsList.filter(g => g.table_id);
  const unseatedGuestsList = confirmedGuestsList.filter(g => !g.table_id);

  const sumPeople = (guestList: any[]) => guestList.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);

  const confirmedGuestsCount = sumPeople(confirmedGuestsList);
  const seatedGuestsCount = sumPeople(seatedGuestsList);
  const unseatedGuestsCount = sumPeople(unseatedGuestsList);

  const filteredSections = modalData
    .map(section => {
      if (categoryFilter !== 'הכל' && section.title !== categoryFilter) {
        return null;
      }

      const filteredGuests = section.data.filter((guest: any) =>
        guest.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (filteredGuests.length > 0) {
        return { ...section, data: filteredGuests };
      }
      return null;
    })
    .filter(Boolean) as any[];

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsContainer}>
        <TouchableOpacity style={styles.statBox} onPress={() => openModalWithGuests('אישרו הגעה', confirmedGuestsList)}>
          <Ionicons name="checkmark-circle-outline" size={28} color="#0A84FF" />
          <Text style={styles.statValue}>{confirmedGuestsCount}</Text>
          <Text style={styles.statLabel}>אישרו הגעה</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => openModalWithGuests('הושבו', seatedGuestsList)}>
          <Ionicons name="body" size={28} color="#0A84FF" />
          <Text style={styles.statValue}>{seatedGuestsCount}</Text>
          <Text style={styles.statLabel}>הושבו</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => router.push('/(tabs)/TablesList')}>
          <Ionicons name="grid" size={28} color="#0A84FF" />
          <Text style={styles.statValue}>{tables.length}</Text>
          <Text style={styles.statLabel}>שולחנות</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statBox} onPress={() => openModalWithGuests('טרם הושבו', unseatedGuestsList)}>
          <Ionicons name="walk" size={28} color="#0A84FF" />
          <Text style={styles.statValue}>{unseatedGuestsCount}</Text>
          <Text style={styles.statLabel}>טרם הושבו</Text>
        </TouchableOpacity>
      </View>
      
      {/* Guest List Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setModalVisible(false)}>
              <Ionicons name="close-circle" size={30} color="#e9ecef" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{modalTitle}</Text>
            
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
                      {allCategories.map(category => (
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

            <SectionList
              sections={filteredSections}
              keyExtractor={(item) => item.id.toString()}
              renderSectionHeader={({ section: { title } }) => (
                <Text style={styles.sectionHeader}>{title}</Text>
              )}
              renderItem={({ item }) => {
                const tableNumber = item.tables?.number;
                
                return (
                  <View style={styles.guestItem}>
                    <View style={styles.guestMainInfo}>
                      <Text style={styles.guestName}>{item.name}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        {tableNumber && (
                          <Text style={styles.tableNumber}>שולחן {tableNumber}</Text>
                        )}
                        <View style={styles.peopleCountBadge}>
                            <Ionicons name="person" size={12} color="black" />
                            <Text style={styles.peopleCountText}>{item.numberOfPeople || 1}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
            />
          </View>
        </View>
      </Modal>

      {/* Table Guests Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={tableModalVisible}
        onRequestClose={closeModalAndShowTabBar}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeModalButton} onPress={closeModalAndShowTabBar}>
              <Ionicons name="close-circle" size={30} color="#e9ecef" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>
              שולחן {selectedTableForModal?.number}
              {selectedTableForModal?.name && ` - ${selectedTableForModal.name}`}
            </Text>
            
            <View style={styles.tableNameContainer}>
              <TextInput
                style={styles.tableNameInput}
                value={tableName}
                onChangeText={setTableName}
                placeholder="הוסף שם לשולחן (אופציונלי)"
                placeholderTextColor="#adb5bd"
                onBlur={handleSaveTableName} // Save when input loses focus
                onSubmitEditing={handleSaveTableName} // Save when pressing Enter/Done
                returnKeyType="done"
                blurOnSubmit={true}
              />
              <TouchableOpacity 
                style={styles.saveNameButton} 
                onPress={handleSaveTableName}
              >
                <Ionicons name="checkmark" size={20} color="#007aff" />
              </TouchableOpacity>
            </View>

            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, tableModalView === 'seated' && styles.toggleButtonActive]}
                onPress={() => setTableModalView('seated')}
              >
                <Text style={[styles.toggleButtonText, tableModalView === 'seated' && styles.toggleButtonTextActive]}>
                  אורחים ({seatedGuestsForTable.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, tableModalView === 'add' && styles.toggleButtonActive]}
                onPress={() => setTableModalView('add')}
              >
                <Text style={[styles.toggleButtonText, tableModalView === 'add' && styles.toggleButtonTextActive]}>
                  הוספת אורחים
                </Text>
              </TouchableOpacity>
            </View>

            {tableModalView === 'seated' && (
              <FlatList
                data={seatedGuestsForTable}
                keyExtractor={(item) => item.id.toString()}
                numColumns={2}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                renderItem={({ item }) => (
                  <View style={styles.seatedGuestItem}>
                    <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                        <Text style={[styles.guestName, {fontSize: 14, flex: 1}]} numberOfLines={1}>{item.name}</Text>
                        <View style={[styles.peopleCountBadge, {marginLeft: 4}]}>
                            <Ionicons name="person" size={10} color="black" />
                            <Text style={[styles.peopleCountText, {fontSize: 10}]}>{item.numberOfPeople || 1}</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveGuestFromTable(item.id)} style={{marginLeft: 4}}>
                      <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    </TouchableOpacity>
                  </View>
                )}
                nestedScrollEnabled
                style={{ flex: 1, marginTop: 20 }}
                ListEmptyComponent={<Text style={styles.emptyListText}>אין אורחים יושבים בשולחן זה</Text>}
              />
            )}
            
            {tableModalView === 'add' && (
              <>
                <View style={styles.filterContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="חיפוש לפי שם..."
                    value={searchQueryTable}
                    onChangeText={setSearchQueryTable}
                    placeholderTextColor="#8e8e93"
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
                      <View style={styles.categoryContainer}>
                          {categoriesForTable.map(category => (
                              <TouchableOpacity
                                  key={category}
                                  style={[
                                      styles.categoryButton,
                                      categoryFilterTable === category && styles.categoryButtonActive
                                  ]}
                                  onPress={() => setCategoryFilterTable(category)}
                              >
                                  <Text style={[
                                      styles.categoryButtonText,
                                      categoryFilterTable === category && styles.categoryButtonTextActive
                                  ]}>{category}</Text>
          </TouchableOpacity>
        ))}
                      </View>
                  </ScrollView>
                </View>

                <FlatList
                  data={unseatedGuestsList.filter(g => {
                    const categoryMatch = categoryFilterTable === 'הכל' || (g.guest_categories?.name || 'ללא קטגוריה') === categoryFilterTable;
                    const searchMatch = g.name.toLowerCase().includes(searchQueryTable.toLowerCase());
                    return categoryMatch && searchMatch;
                  })}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={2}
                  columnWrapperStyle={{ justifyContent: 'space-between' }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.selectableGuestItem}
                      onPress={() => handleToggleGuestSelection(item.id)}
                    >
                      <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                        <Text style={[styles.guestName, {fontSize: 14, flex: 1}]} numberOfLines={1}>{item.name}</Text>
                        <View style={[styles.peopleCountBadge, {marginLeft: 4}]}>
                            <Ionicons name="person" size={10} color="black" />
                            <Text style={[styles.peopleCountText, {fontSize: 10}]}>{item.numberOfPeople || 1}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={selectedGuestsToAdd.has(item.id) ? "checkbox" : "square-outline"}
                        size={20}
                        color={selectedGuestsToAdd.has(item.id) ? "#007aff" : "#ccc"}
                        style={{marginLeft: 4}}
                      />
                    </TouchableOpacity>
                  )}
                  nestedScrollEnabled
                  style={{ flex: 1 }}
                  ListEmptyComponent={<Text style={styles.emptyListText}>כל האורחים שהגיעו כבר הושבו</Text>}
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
              </>
            )}
            
          </View>
        </View>
      </Modal>

      {/* Canvas */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.canvasScroll}
        contentContainerStyle={{ minWidth: 2400, minHeight: 2000 }}
        maximumZoomScale={2}
        minimumZoomScale={0.5}
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ minWidth: 2400, minHeight: 2000 }}
          maximumZoomScale={2}
          minimumZoomScale={0.5}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.canvas, { transform: [{ scale: zoom }] }]}> 
            {/* Grid */}
            {[...Array(40)].map((_, i) => (
              <View key={i} style={[styles.gridLine, { top: i * 50 }]} />
            ))}
            {[...Array(30)].map((_, i) => (
              <View key={i} style={[styles.gridLineV, { left: i * 80 }]} />
            ))}
            
            {/* Tables */}
            {tables.map(table => {
              if (!positions[table.id]) {
                positions[table.id] = new Animated.ValueXY({
                  x: typeof table.x === 'number' ? table.x : 40,
                  y: typeof table.y === 'number' ? table.y : 60
                });
              }
              
              // Calculate total people seated at this table
              const guestsAtTable = guests.filter(g => g.table_id === table.id);
              const totalPeopleSeated = guestsAtTable.reduce((sum, guest) => sum + (guest.numberOfPeople || 1), 0);
              const isTableFull = totalPeopleSeated >= table.capacity;
              
              return (
                <Animated.View
                  key={table.id}
                  style={[
                    styles.table,
                    table.shape === 'rectangle' ? styles.tableRect : styles.tableSquare,
                    isTableFull && styles.tableFullStyle,
                    {
                      transform: positions[table.id] ? positions[table.id].getTranslateTransform() : [{ translateX: table.x || 40 }, { translateY: table.y || 60 }],
                    },
                  ]}
                >
                  <Pressable
                    onPressIn={() => setPressedTable(table.id)}
                    onPressOut={() => setPressedTable(null)}
                    onPress={() => handleTablePress(table)}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={[
                      styles.tableName,
                      isTableFull && styles.tableFullText,
                      pressedTable === table.id && { color: isTableFull ? '#2d5a3d' : '#666' }
                    ]}>{table.number}</Text>
                    <Text style={[
                      styles.tableCap,
                      isTableFull && styles.tableFullCapText,
                      pressedTable === table.id && { color: isTableFull ? '#4a7c59' : '#999' }
                    ]}>
                      {totalPeopleSeated} / {table.capacity}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
            
            {/* Text Areas */}
            {textAreas.map((t, idx) => (
              <View
                key={t.id}
                style={[styles.textArea, { top: t.y ?? 200 + idx * 40, left: t.x ?? 200 }]}
              >
                <Text style={styles.textAreaText}>{t.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1c1c1e',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#8e8e93',
    marginTop: 2,
  },
  canvasScroll: { flex: 1 },
  canvas: { 
    width: 2400, 
    height: 2000, 
    backgroundColor: '#fff', 
    overflow: 'hidden', 
  },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#eee' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#eee' },
  table: { 
    position: 'absolute', 
    alignItems: 'center', 
    justifyContent: 'center', 
    elevation: 4, 
    backgroundColor: '#fafafa', 
    borderRadius: 8, 
    shadowColor: '#000', 
    shadowOpacity: 0.08, 
    shadowRadius: 4, 
    shadowOffset: { width: 0, height: 2 }, 
    borderWidth: 1, 
    borderColor: '#ddd' 
  },
  tableSquare: { width: 70, height: 70 },
  tableRect: { width: 60, height: 110 },
  tableName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  tableCustomName: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  tableCap: { fontSize: 14, color: '#888' },
  tableFullStyle: {
    backgroundColor: '#34c759',
    borderColor: '#30d158',
    shadowColor: '#34c759',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tableFullText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  tableFullCapText: {
    color: '#e8f5e8',
    fontWeight: '600',
  },

  textArea: { 
    position: 'absolute', 
    backgroundColor: '#f5f5f5', 
    borderRadius: 8, 
    padding: 8, 
    borderWidth: 1, 
    borderColor: '#bbb', 
    minWidth: 60, 
    minHeight: 30, 
    alignItems: 'center', 
    justifyContent: 'center', 
    elevation: 2 
  },
  textAreaText: { fontSize: 16, color: '#444' },
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
    height: '75%',
    width: '100%',
  },
  modalTitle: {
    fontSize: 24,
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
  sectionHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    textAlign: 'right',
    borderRightWidth: 4,
    borderRightColor: '#007aff',
    writingDirection: 'rtl',
  },
  sectionHeaderSmall: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    marginVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5ea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '95%',
    alignSelf: 'flex-end',
  },
  guestMainInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  guestName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'right',
    color: '#000000',
    flex: 1,
    writingDirection: 'rtl',
  },
  tableNumber: {
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#007aff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    textAlign: 'center',
    minWidth: 80,
    marginLeft: 12,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#007aff',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  unseatedGuestList: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e5e5ea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
  },
  seatedGuestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff2f2',
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#ffcccc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    width: '47%',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5ea',
    marginVertical: 16,
  },
  finalAddButton: {
    backgroundColor: '#007aff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 4,
    marginBottom: 20,
  },
  finalAddButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#8e8e93',
  },
  disabledButton: {
    backgroundColor: '#a9a9a9',
  },
  toggleContainer: {
    flexDirection: 'row-reverse',
    backgroundColor: '#e9ecef',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
  },
  toggleButtonTextActive: {
    color: '#007aff',
  },
  closeModalButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  tableNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  tableNameInput: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
    textAlign: 'right',
    writingDirection: 'rtl',
    borderWidth: 1,
    borderColor: '#dee2e6',
    flex: 1,
    marginRight: 10,
  },
  saveNameButton: {
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#007aff',
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 10,
  },
  peopleCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'black',
    marginLeft: 4,
  },
}); 