import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, TouchableOpacity, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase } from '@/lib/supabase';

export default function AdminEventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showSeatingMap, setShowSeatingMap] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const eventData = await eventService.getEvent(id as string);
      setEvent(eventData);
      const guestsData = await guestService.getGuests(id as string);
      setGuests(guestsData);
      
      // שליפת שם המשתמש
      if (eventData?.user_id) {
        const { data: userData, error } = await supabase
          .from('users')
          .select('name')
          .eq('id', eventData.user_id)
          .single();
        
        if (!error && userData) {
          setUserName(userData.name || '');
        }
      }
      
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading || !event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const confirmed = guests.filter(g => g.status === 'מגיע').length;
  const declined = guests.filter(g => g.status === 'לא מגיע').length;
  const pending = guests.filter(g => g.status === 'ממתין').length;
  const seated = guests.filter(g => g.tableId).length;

  // Format date: 23.10 | חמישי
  const dateObj = new Date(event.date);
  const day = dateObj.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const weekday = dateObj.toLocaleDateString('he-IL', { weekday: 'long' });

  // פונקציה חדשה: בדוק/צור מפת הושבה
  const handleSeatingMap = async () => {
    if (!event?.id) return;
    // בדוק אם קיימת מפה
    const { data, error } = await supabase
      .from('seating_maps')
      .select('*')
      .eq('event_id', event.id)
      .single();
    if (!data) {
      // צור מפה חדשה
      await supabase.from('seating_maps').insert({
        event_id: event.id,
        num_tables: 0,
        tables: [],
        annotations: [],
      });
    }
    router.push(`/(tabs)/BrideGroomSeating?eventId=${event.id}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100] }}>
      {/* Floating back button */}
      <TouchableOpacity
        style={styles.fabBack}
        onPress={() => router.replace('/(tabs)/admin-events')}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerDateBox}>
            <Text style={styles.headerDateDay}>{day}</Text>
            <Text style={styles.headerDateWeek}>{weekday}</Text>
          </View>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{String(event.title ?? '')}</Text>
            {userName && (
              <Text style={styles.headerUserName}>של {userName}</Text>
            )}
          </View>
        </View>
        {/* Main Card */}
        <View style={styles.card}>
          {/* Location */}
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color={colors.text} style={styles.infoIcon} />
            <Text style={styles.infoText}>{String(event.location ?? '')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="business" size={20} color={colors.text} style={styles.infoIcon} />
            <Text style={styles.infoText}>{String(event.city ?? '')}</Text>
          </View>
          {/* Type */}
          <View style={styles.infoRow}>
            <Ionicons name="people" size={20} color={colors.text} style={styles.infoIcon} />
            <Text style={styles.infoText}>{'סוג אירוע: ' + String(event.title ?? '')}</Text>
          </View>
          {/* Stats */}
          <View style={styles.statsRow}>
            {/* Green */}
            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#4CAF50' }]}> 
                <Ionicons name="checkmark" size={22} color={'#fff'} />
              </View>
              <Text style={styles.statValue}>{confirmed}</Text>
              <Text style={styles.statLabel}>אישרו הגעה</Text>
            </View>
            {/* Red */}
            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#F44336' }]}> 
                <Ionicons name="close" size={22} color={'#fff'} />
              </View>
              <Text style={styles.statValue}>{declined}</Text>
              <Text style={styles.statLabel}>לא אישרו</Text>
            </View>
            {/* Yellow */}
            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#FFC107' }]}> 
                <Ionicons name="time" size={22} color={'#fff'} />
              </View>
              <Text style={styles.statValue}>{pending}</Text>
              <Text style={styles.statLabel}>ממתינים</Text>
            </View>
            {/* Blue */}
            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#2196F3' }]}> 
                <Ionicons name="restaurant" size={22} color={'#fff'} />
              </View>
              <Text style={styles.statValue}>{seated}</Text>
              <Text style={styles.statLabel}>הושבו בשולחנות</Text>
            </View>
          </View>
          {/* Seating Map Button */}
          <TouchableOpacity style={styles.seatingMapButton} activeOpacity={0.85} onPress={handleSeatingMap}>
            <Ionicons name="grid" size={22} color={colors.white} style={{ marginLeft: 8 }} />
            <Text style={styles.seatingMapButtonText}>מפת הושבה</Text>
          </TouchableOpacity>

          {/* Templates Button */}
          <TouchableOpacity 
            style={styles.templatesButton} 
            activeOpacity={0.85} 
            onPress={() => router.push(`/seating/templates?eventId=${event.id}`)}
          >
            <Ionicons name="library" size={22} color={colors.primary} style={{ marginLeft: 8 }} />
            <Text style={styles.templatesButtonText}>עריכת סקיצה</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: colors.gray[100],
  },
  fabBack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    zIndex: 10,
    backgroundColor: colors.white,
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: '100%',
    marginBottom: 18,
    justifyContent: 'flex-end',
  },
  headerDateBox: {
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginLeft: 16,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerDateDay: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  headerDateWeek: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerUserName: {
    fontSize: 18,
    color: colors.textLight,
    textAlign: 'right',
    marginTop: 4,
    fontStyle: 'italic',
  },
  card: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.white,
    borderRadius: 32,
    padding: 32,
    alignItems: 'flex-end',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 14,
    width: '100%',
  },
  infoIcon: {
    marginLeft: 10,
  },
  infoText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 24,
    marginBottom: 8,
    gap: 12,
  },
  statCard: {
    backgroundColor: colors.gray[100],
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: 80,
    minWidth: 80,
    maxWidth: 90,
    marginHorizontal: 2,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statLabel: {
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: 2,
  },
  seatingMapButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 24,
    width: '100%',
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  seatingMapButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  templatesButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 12,
    width: '100%',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  templatesButtonText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
}); 