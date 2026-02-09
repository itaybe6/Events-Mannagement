import React, { useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/constants/colors";
import { useUserStore } from "@/store/userStore";
import { eventService } from "@/lib/services/eventService";
import { Event } from "@/types";

function formatDaysLeft(date: Date) {
  const today = new Date();
  const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "האירוע עבר";
  if (diff === 0) return "היום";
  return `עוד ${diff} ימים`;
}

export default function EmployeeEventsScreen() {
  const router = useRouter();
  const { isLoggedIn, userData } = useUserStore();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);

  const eventId = useMemo(() => String(userData?.event_id ?? "").trim() || null, [userData?.event_id]);

  const load = async () => {
    if (!isLoggedIn) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    try {
      if (!eventId) {
        setEvents([]);
        return;
      }
      const ev = await eventService.getEvent(eventId);
      setEvents(ev ? [ev] : []);
    } catch (e) {
      console.error("Employee events load error:", e);
      Alert.alert("שגיאה", "לא ניתן לטעון אירועים כרגע");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isLoggedIn]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, isLoggedIn])
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconCircle}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={styles.title}>האירועים הקרובים שלי</Text>
            <Text style={styles.subtitle}>
              {eventId ? "לחץ על אירוע כדי לנהל סטטוס אורחים" : "לא משויך אירוע לחשבון הזה"}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>טוען אירועים...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.gray[500]} />
            <Text style={styles.emptyTitle}>אין אירועים להצגה</Text>
            <Text style={styles.emptyText}>
              אם זה משתמש עובד, ודא שהוגדר לו `event_id` בטבלת `users`.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {events.map((ev) => {
              const d = new Date(ev.date);
              const when = Number.isFinite(d.getTime())
                ? d.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" })
                : "";
              return (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.eventCard}
                  activeOpacity={0.9}
                  onPress={() =>
                    router.push({ pathname: "/(employee)/employee-event-details", params: { id: ev.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`פתיחת אירוע ${ev.title}`}
                >
                  <View style={styles.eventTopRow}>
                    <View style={styles.badge}>
                      <Ionicons name="time-outline" size={14} color={colors.white} />
                      <Text style={styles.badgeText}>{formatDaysLeft(d)}</Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color={colors.gray[600]} />
                  </View>

                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {ev.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar" size={14} color={colors.gray[600]} />
                    <Text style={styles.metaText}>{when}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={14} color={colors.gray[600]} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {ev.location}
                      {ev.city ? `, ${ev.city}` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(17, 82, 212, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.14)",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[600],
    textAlign: "right",
  },
  loadingBox: {
    marginTop: 28,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[600],
  },
  emptyCard: {
    marginTop: 24,
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 18,
  },
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  eventTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
    lineHeight: 22,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    textAlign: "right",
    flex: 1,
  },
});

