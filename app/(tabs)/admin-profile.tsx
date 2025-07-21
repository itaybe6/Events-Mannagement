import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { userService } from '@/lib/services/userService';
import { eventService } from '@/lib/services/eventService';
import { giftService } from '@/lib/services/giftService';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { useRouter } from 'expo-router';

const screenWidth = Dimensions.get('window').width;

export default function AdminProfileScreen() {
  const { userData, logout } = useUserStore();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [eventsPerMonth, setEventsPerMonth] = useState<any[]>([]);

  const router = useRouter();

  useEffect(() => {
    if (userData) {
      setForm({ name: userData.name, email: userData.email, password: '', confirmPassword: '' });
    }
    loadStats();
  }, [userData]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const users = await userService.getClients();
      const events = await eventService.getEvents();
      let allGifts: any[] = [];
      let guests = 0;
      for (const event of events) {
        guests += event.guests_count || 0;
        const gifts = await giftService.getGifts(event.id);
        allGifts = allGifts.concat(gifts.map(g => ({ ...g, eventId: event.id, eventTitle: event.title })));
      }
      const totalGifts = allGifts.reduce((sum, g) => sum + (g.amount || 0), 0);
      const giftsPerEvent = events.map(e => {
        const eventGifts = allGifts.filter(g => g.eventId === e.id);
        return { label: e.title, value: eventGifts.reduce((sum, g) => sum + (g.amount || 0), 0) };
      });
      const guestsPerEvent = events.map(e => ({ label: e.title, value: e.guests_count || 0 }));
      // אירועים לפי חודש
      const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
      const eventsByMonth = Array(12).fill(0);
      events.forEach(e => {
        const d = new Date(e.date);
        eventsByMonth[d.getMonth()]++;
      });
      setEventsPerMonth(months.map((m, i) => ({ label: m, value: eventsByMonth[i] })));
      setStats({
        clients: users.length,
        events: events.length,
      });
      setGraphData({
        guestsPerEvent,
        giftsPie: [
          { name: 'אירועים', population: events.length, color: colors.secondary, legendFontColor: colors.text, legendFontSize: 14 },
          { name: 'לקוחות', population: users.length, color: colors.info, legendFontColor: colors.text, legendFontSize: 14 },
        ],
      });
    } catch (e) {
      setStats(null);
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      Alert.alert('שגיאה', 'יש למלא שם ואימייל');
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      Alert.alert('שגיאה', 'הסיסמאות אינן תואמות');
      return;
    }
    setLoading(true);
    try {
      await userService.updateUserProfile({ name: form.name, email: form.email, password: form.password });
      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
      setEditMode(false);
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את הפרופיל');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!userData) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // Chart config
  const chartConfig = {
    backgroundGradientFrom: colors.white,
    backgroundGradientTo: colors.white,
    color: (opacity = 1) => colors.primary,
    labelColor: (opacity = 1) => colors.text,
    decimalPlaces: 0,
    barPercentage: 0.7,
    propsForBackgroundLines: { stroke: colors.gray[200] },
    propsForLabels: { fontSize: 12 },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.profileCard}>
        <Ionicons name="person-circle" size={80} color={colors.primary} style={{ marginBottom: 8 }} />
        {editMode ? (
          <>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={t => setForm(f => ({ ...f, name: t }))}
              placeholder="שם מלא"
            />
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={t => setForm(f => ({ ...f, email: t }))}
              placeholder="אימייל"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={form.password}
              onChangeText={t => setForm(f => ({ ...f, password: t }))}
              placeholder="סיסמה חדשה (לא חובה)"
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              value={form.confirmPassword}
              onChangeText={t => setForm(f => ({ ...f, confirmPassword: t }))}
              placeholder="אישור סיסמה"
              secureTextEntry
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
              <Text style={styles.saveButtonText}>{loading ? 'שומר...' : 'שמור שינויים'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setEditMode(false)}>
              <Text style={styles.cancelButtonText}>ביטול</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.profileName}>{userData.name}</Text>
            <Text style={styles.profileEmail}>{userData.email}</Text>
            <Text style={styles.profileRole}>מנהל מערכת</Text>
            <TouchableOpacity style={styles.editButton} onPress={() => setEditMode(true)}>
              <Ionicons name="create" size={20} color={colors.primary} />
              <Text style={styles.editButtonText}>ערוך פרטים</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={styles.logoutText}>התנתק</Text>
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>סטטיסטיקות עסקיות</Text>
      {loading && !stats ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : stats ? (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statValue}>{stats.clients}</Text><Text style={styles.statLabel}>לקוחות</Text></View>
            <View style={styles.statCard}><Text style={styles.statValue}>{stats.events}</Text><Text style={styles.statLabel}>אירועים</Text></View>
          </View>
          <View style={styles.graphsContainer}>
            <Text style={styles.graphTitle}>התפלגות אירועים לפי חודש</Text>
            {eventsPerMonth && eventsPerMonth.length > 0 ? (
              <BarChart
                data={{
                  labels: eventsPerMonth.map(e => e.label),
                  datasets: [{ data: eventsPerMonth.map(e => e.value) }],
                }}
                width={screenWidth - 32}
                height={220}
                yAxisLabel=""
                chartConfig={{
                  ...chartConfig,
                  color: (opacity = 1) => colors.secondary,
                  fillShadowGradient: colors.secondary,
                  fillShadowGradientOpacity: 1,
                  backgroundGradientFrom: colors.white,
                  backgroundGradientTo: colors.white,
                }}
                verticalLabelRotation={0}
                style={{ borderRadius: 16, marginVertical: 8 }}
                fromZero
                showValuesOnTopOfBars
              />
            ) : <Text style={styles.errorText}>אין נתונים</Text>}
            <Text style={styles.graphTitle}>סך הכל</Text>
            {graphData && graphData.giftsPie ? (
              <PieChart
                data={graphData.giftsPie}
                width={screenWidth - 32}
                height={220}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor={colors.white}
                paddingLeft={"15"}
                absolute
                style={{ borderRadius: 16, marginVertical: 8 }}
              />
            ) : <Text style={styles.errorText}>אין נתונים</Text>}
          </View>
        </>
      ) : (
        <Text style={styles.errorText}>לא ניתן לטעון סטטיסטיקות</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[100] },
  contentContainer: { alignItems: 'center', padding: 24 },
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  profileName: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 4 },
  profileEmail: { fontSize: 16, color: colors.textLight, marginBottom: 2 },
  profileRole: { fontSize: 15, color: colors.primary, marginBottom: 12 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  editButtonText: { color: colors.primary, fontWeight: '600', marginLeft: 6 },
  input: {
    width: '100%',
    backgroundColor: colors.gray[100],
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'right',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
    alignItems: 'center',
  },
  saveButtonText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  cancelButton: { marginTop: 8 },
  cancelButtonText: { color: colors.error, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 12, alignSelf: 'flex-end' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 24 },
  statCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    margin: 6,
    minWidth: 90,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: colors.primary },
  statLabel: { fontSize: 13, color: colors.textLight, marginTop: 4, textAlign: 'center' },
  errorText: { color: colors.error, marginTop: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  graphsContainer: { width: '100%', alignItems: 'center', marginTop: 12, marginBottom: 24 },
  graphTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginVertical: 8, alignSelf: 'flex-end' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 18,
    alignSelf: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  logoutText: { color: colors.error, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
}); 