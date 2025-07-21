import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { Event } from '@/types';

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

export default function AdminEventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterMonth, setFilterMonth] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const data = await eventService.getEvents();
    setEvents(data);
    setLoading(false);
  };

  // Filtering
  let filteredEvents: Event[] = [...events];
  if (filterDate) {
    filteredEvents = filteredEvents.filter(e => {
      const d = new Date(e.date);
      return d.toDateString() === filterDate.toDateString();
    });
  } else if (filterMonth) {
    filteredEvents = filteredEvents.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === parseInt(filterMonth);
    });
  }
  // Sorting
  filteredEvents.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    return sortOrder === 'asc' ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
  });

  // UI
  const today = new Date();
  const getDaysLeft = (date: Date | string) => {
    const d = new Date(date);
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? `עוד ${diff} ימים` : 'עבר';
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100] }}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="calendar" size={28} color={colors.primary} style={{ marginLeft: 10 }} />
        <Text style={styles.headerTitle}>אירועים עתידיים</Text>
      </View>
      {/* Filter Panel */}
      <View style={styles.filterPanel}>
        <TouchableOpacity style={styles.filterButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={18} color={colors.text} />
          <Text style={styles.filterButtonText}>{filterDate ? filterDate.toLocaleDateString('he-IL') : 'סנן לפי תאריך'}</Text>
        </TouchableOpacity>
        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          onConfirm={date => { setShowDatePicker(false); setFilterDate(date as Date); setFilterMonth(''); }}
          onCancel={() => setShowDatePicker(false)}
          minimumDate={new Date()}
          locale="he-IL"
        />
        <View style={styles.monthDropdown}>
          <Text style={styles.monthDropdownLabel}>חודש:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse', gap: 6 }}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.monthOption, filterMonth === String(i) && styles.monthOptionActive]}
                onPress={() => { setFilterMonth(String(i)); setFilterDate(null); }}
              >
                <Text style={[styles.monthOptionText, filterMonth === String(i) && styles.monthOptionTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.sortDropdown}>
          <Text style={styles.sortDropdownLabel}>מיון:</Text>
          <TouchableOpacity style={styles.sortOption} onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
            <Ionicons name={sortOrder === 'asc' ? 'arrow-down' : 'arrow-up'} size={16} color={colors.text} />
            <Text style={styles.sortOptionText}>{sortOrder === 'asc' ? 'מהקרוב לרחוק' : 'מהרחוק לקרוב'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.resetButton} onPress={() => { setFilterDate(null); setFilterMonth(''); }}>
          <Ionicons name="close-circle" size={18} color={colors.error} />
          <Text style={styles.resetButtonText}>איפוס</Text>
        </TouchableOpacity>
      </View>
      {/* Events List */}
      <ScrollView contentContainerStyle={styles.eventsList} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name="calendar-outline" size={48} color={colors.gray[400]} />
            <Text style={styles.emptyStateText}>לא נמצאו אירועים</Text>
          </View>
        ) : filteredEvents.map(event => {
          const dateObj = new Date(event.date);
          const day = dateObj.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
          const weekday = dateObj.toLocaleDateString('he-IL', { weekday: 'long' });
          return (
            <TouchableOpacity key={event.id} onPress={() => router.push({ pathname: '/(tabs)/admin-event-details', params: { id: event.id } })} style={styles.eventCard}>
              <View style={styles.eventDateBox}>
                <Text style={styles.eventDateDay}>{day}</Text>
                <Text style={styles.eventDateWeek}>{weekday}</Text>
              </View>
              <View style={styles.eventInfoBox}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={styles.eventInfoRow}>
                  <Ionicons name="location" size={16} color={colors.text} style={{ marginLeft: 4 }} />
                  <Text style={styles.eventLocation}>{event.location}</Text>
                </View>
                <Text style={styles.eventDaysLeft}>{getDaysLeft(event.date)}</Text>
              </View>
              <Ionicons name="chevron-back" size={22} color={colors.gray[400]} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* כפתור הוספת אירוע חדש */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/admin-events-create')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 32 : 18,
    paddingBottom: 10,
    backgroundColor: colors.gray[100],
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
  filterPanel: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
    backgroundColor: colors.gray[100],
  },
  filterButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginLeft: 4,
    marginBottom: 4,
  },
  filterButtonText: {
    fontSize: 15,
    color: colors.text,
    marginRight: 6,
  },
  monthDropdown: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginLeft: 4,
    marginBottom: 4,
  },
  monthDropdownLabel: {
    fontSize: 15,
    color: colors.text,
    marginLeft: 4,
  },
  monthOption: {
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginLeft: 2,
  },
  monthOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  monthOptionText: {
    fontSize: 15,
    color: colors.text,
  },
  monthOptionTextActive: {
    color: colors.white,
  },
  sortDropdown: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginLeft: 4,
    marginBottom: 4,
  },
  sortDropdownLabel: {
    fontSize: 15,
    color: colors.text,
    marginLeft: 4,
  },
  sortOption: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  sortOptionText: {
    fontSize: 15,
    color: colors.text,
    marginRight: 4,
  },
  resetButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    marginLeft: 4,
    marginBottom: 4,
  },
  resetButtonText: {
    fontSize: 15,
    color: colors.error,
    marginRight: 6,
  },
  eventsList: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: 'center',
  },
  eventCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 18,
    width: '100%',
    maxWidth: 500,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  eventDateBox: {
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginLeft: 16,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minWidth: 70,
  },
  eventDateDay: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26,
  },
  eventDateWeek: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: -2,
  },
  eventInfoBox: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 2,
    textAlign: 'right',
  },
  eventInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
  },
  eventDaysLeft: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 2,
    textAlign: 'right',
  },
  emptyStateCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyStateText: {
    fontSize: 18,
    color: colors.gray[400],
    marginTop: 12,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 32,
    backgroundColor: colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 10,
  },
}); 