import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { CountdownTimer } from '@/components/CountdownTimer';
import { StatCard } from '@/components/StatCard';
import { Ionicons } from '@expo/vector-icons';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { giftService } from '@/lib/services/giftService';

export default function HomeScreen() {
  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const router = useRouter();
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    
    const loadData = async () => {
      try {
        setLoading(true);
        let eventId = userData?.event_id;
        if (!eventId) {
          // רענן את המשתמש מהשרת
          await initializeAuth();
          eventId = useUserStore.getState().userData?.event_id;
        }
        if (!eventId) {
          setCurrentEvent(null);
          setGuests([]);
          setGifts([]);
          setLoading(false);
          return;
        }
        // טען את האירוע לפי event_id של המשתמש
        const event = await eventService.getEvent(eventId);
        if (event) {
          setCurrentEvent(event);
          // טען אורחים
          const guestsData = await guestService.getGuests(event.id);
          setGuests(guestsData);
          // טען מתנות
          try {
            const giftsData = await giftService.getGifts(event.id);
            setGifts(giftsData);
          } catch (e) {
            setGifts([]);
          }
        } else {
          setCurrentEvent(null);
          setGuests([]);
          setGifts([]);
        }
      } catch (error) {
        setCurrentEvent(null);
        setGuests([]);
        setGifts([]);
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isLoggedIn, router, userData]);

  useEffect(() => {
    if (isLoggedIn && userData?.userType === 'admin' && !userData?.event_id) {
      router.replace('/(tabs)/admin-events');
      return;
    }
  }, [isLoggedIn, userData, router]);

  // טען מחדש נתונים כשהמסך חוזר למוקד
  useFocusEffect(
    React.useCallback(() => {
      if (isLoggedIn && userData?.event_id) {
        const reloadData = async () => {
          try {
            const event = await eventService.getEvent(userData.event_id);
            setCurrentEvent(event);
            if (event) {
              const guestsData = await guestService.getGuests(event.id);
              setGuests(guestsData);
              try {
                const giftsData = await giftService.getGifts(event.id);
                setGifts(giftsData);
              } catch (e) {
                setGifts([]);
              }
            } else {
              setGuests([]);
              setGifts([]);
            }
          } catch (error) {
            setGuests([]);
            setGifts([]);
          }
        };
        reloadData();
      }
    }, [isLoggedIn, userData])
  );

  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>טוען...</Text>
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // חישוב נתונים אמיתיים
  const totalGifts = gifts.reduce((sum, gift) => sum + gift.amount, 0);
  const confirmedGuests = guests.filter(guest => guest.status === 'מגיע').length;
  const pendingGuests = guests.filter(guest => guest.status === 'ממתין').length;
  const totalGuests = guests.length;
  const completedTasks = currentEvent.tasks ? currentEvent.tasks.filter((task: any) => task.completed).length : 0;
  const totalTasks = currentEvent.tasks ? currentEvent.tasks.length : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.eventInfo}>
          <Text style={styles.title}>{currentEvent.title}</Text>
          <Text style={styles.date}>{formatDate(currentEvent.date)}</Text>
          <Text style={styles.location}>{currentEvent.location}</Text>
        </View>
        <Image
          source={{ uri: currentEvent.image }}
          style={styles.eventImage}
        />
      </View>

      <Card style={styles.countdownCard}>
        <Text style={styles.countdownTitle}>זמן לאירוע</Text>
        <CountdownTimer targetDate={currentEvent.date} />
      </Card>

      <View style={styles.statsContainer}>
        <StatCard
          title="אורחים שאישרו"
          value={`${confirmedGuests}/${totalGuests}`}
          icon={<Ionicons name="people" size={20} color={colors.primary} />}
        />
        <StatCard
          title="מתנות"
          value={`₪${totalGifts}`}
          icon={<Ionicons name="gift" size={20} color={colors.secondary} />}
          color={colors.secondary}
        />
        <StatCard
          title="משימות שהושלמו"
          value={`${completedTasks}/${totalTasks}`}
          icon={<Ionicons name="calendar" size={20} color={colors.success} />}
          color={colors.success}
        />
        <StatCard
          title="אורחים בהמתנה"
          value={pendingGuests}
          icon={<Ionicons name="people" size={20} color={colors.warning} />}
          color={colors.warning}
        />
      </View>

      <Text style={styles.sectionTitle}>פעולות מהירות</Text>
      <View style={styles.quickActionsContainer}>
        <Link href="/guests" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="people" size={24} color={colors.primary} />
            </View>
            <Text style={styles.actionText}>הזמנת אורחים</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(tabs)/BrideGroomSeating" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.info}20` }]}>
              <Ionicons name="calendar" size={24} color={colors.info} />
            </View>
            <Text style={styles.actionText}>סידור ישיבה</Text>
          </TouchableOpacity>
        </Link>
      </View>


    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  contentContainer: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'right',
  },
  date: {
    fontSize: 16,
    color: colors.primary,
    marginTop: 4,
    textAlign: 'right',
  },
  location: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 2,
    textAlign: 'right',
  },
  eventImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginLeft: 16,
  },
  countdownCard: {
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'right',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quickAction: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },

});