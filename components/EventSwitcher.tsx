import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';

type MinimalEvent = {
  id: string;
  title: string;
  date: Date;
  location: string;
  city: string;
};

type Props = {
  userId?: string;
  selectedEventId?: string | null;
  onSelectEventId: (eventId: string) => void;
  label?: string;
};

export function EventSwitcher({ userId, selectedEventId, onSelectEventId, label = 'אירוע' }: Props) {
  const [events, setEvents] = useState<MinimalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const data = await eventService.getEventsForUser(userId);
        if (!cancelled) setEvents(data as any);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hasMultiple = events.length > 1;
  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  if (!hasMultiple) return null;

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: '2-digit' });

  return (
    <>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="בחירת אירוע"
      >
        <View style={styles.pillLeft}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-down" size={18} color={colors.primary} />
          )}
        </View>

        <View style={styles.pillTextWrap}>
          <Text style={styles.pillLabel}>{label}</Text>
          <Text style={styles.pillValue} numberOfLines={1}>
            {selectedEvent?.title ? selectedEvent.title : 'בחר אירוע'}
            {selectedEvent?.date ? ` · ${formatDate(selectedEvent.date)}` : ''}
          </Text>
        </View>

        <View style={styles.pillIconWrap}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => { /* swallow */ }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>בחר אירוע</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="סגירה"
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const active = item.id === selectedEventId;
                const subtitleParts = [
                  item.date ? formatDate(item.date) : '',
                  item.location ? item.location : '',
                  item.city ? item.city : '',
                ].filter(Boolean);

                return (
                  <TouchableOpacity
                    style={[styles.eventRow, active && styles.eventRowActive]}
                    onPress={() => {
                      onSelectEventId(item.id);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת אירוע ${item.title}`}
                  >
                    <View style={styles.eventTextWrap}>
                      <Text style={[styles.eventTitle, active && styles.eventTitleActive]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.eventSubtitle, active && styles.eventSubtitleActive]} numberOfLines={1}>
                        {subtitleParts.join(' · ')}
                      </Text>
                    </View>

                    <View style={styles.eventRight}>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={22} color={colors.gray[300]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  pillIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 53, 102, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 53, 102, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  pillValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pillLeft: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 18,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
    maxHeight: 520,
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 10,
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  eventRowActive: {
    borderColor: 'rgba(0, 53, 102, 0.35)',
    backgroundColor: 'rgba(0, 53, 102, 0.06)',
  },
  eventTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  eventTitleActive: {
    color: colors.primary,
  },
  eventSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  eventSubtitleActive: {
    color: colors.gray[700],
  },
  eventRight: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

