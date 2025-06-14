import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Link } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { CountdownTimer } from '@/components/CountdownTimer';
import { StatCard } from '@/components/StatCard';
import { Users, Gift, CalendarCheck, CreditCard } from 'lucide-react-native';

export default function HomeScreen() {
  const { currentEvent, guests, gifts } = useEventStore();

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

  const totalGifts = gifts.reduce((sum, gift) => sum + gift.amount, 0);
  const confirmedGuests = guests.filter(guest => guest.status === 'מגיע').length;
  const pendingGuests = guests.filter(guest => guest.status === 'ממתין').length;
  const completedTasks = currentEvent.tasks.filter(task => task.completed).length;

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
          value={`${confirmedGuests}/${guests.length}`}
          icon={<Users size={20} color={colors.primary} />}
        />
        <StatCard
          title="מתנות"
          value={`₪${totalGifts.toLocaleString()}`}
          icon={<Gift size={20} color={colors.secondary} />}
          color={colors.secondary}
        />
        <StatCard
          title="משימות שהושלמו"
          value={`${completedTasks}/${currentEvent.tasks.length}`}
          icon={<CalendarCheck size={20} color={colors.success} />}
          color={colors.success}
        />
        <StatCard
          title="אורחים בהמתנה"
          value={pendingGuests}
          icon={<Users size={20} color={colors.warning} />}
          color={colors.warning}
        />
      </View>

      <Text style={styles.sectionTitle}>פעולות מהירות</Text>
      <View style={styles.quickActionsContainer}>
        <Link href="/gift/payment" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.secondary}20` }]}>
              <Gift size={24} color={colors.secondary} />
            </View>
            <Text style={styles.actionText}>הוספת מתנה</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/rsvp/invite" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Users size={24} color={colors.primary} />
            </View>
            <Text style={styles.actionText}>הזמנת אורחים</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/seating/edit" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.info}20` }]}>
              <CalendarCheck size={24} color={colors.info} />
            </View>
            <Text style={styles.actionText}>סידור ישיבה</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/financing/apply" asChild>
          <TouchableOpacity style={styles.quickAction}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.success}20` }]}>
              <CreditCard size={24} color={colors.success} />
            </View>
            <Text style={styles.actionText}>מימון אירוע</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <Link href="/profile/share" asChild>
        <TouchableOpacity style={styles.shareProfileButton}>
          <Text style={styles.shareProfileText}>שיתוף פרופיל האירוע</Text>
        </TouchableOpacity>
      </Link>
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
  shareProfileButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  shareProfileText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});