import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

type MinimalEvent = {
  id: string;
  title: string;
  date: Date;
  location: string;
  city: string;
};

const EVENT_TYPE_PREFIXES = ['חתונה', 'חינה', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'אירוע חברה'] as const;

function getDisplayEventTitle(title: string) {
  const raw = String(title || '').trim();
  if (!raw) return '';

  for (const prefix of EVENT_TYPE_PREFIXES) {
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length).replace(/^[\s\-:|–—]+/, '').trim() || raw;
    }
  }

  return raw;
}

type Props = {
  userId?: string;
  selectedEventId?: string | null;
  onSelectEventId: (eventId: string) => void;
  label?: string;
  onHasMultipleChange?: (hasMultiple: boolean) => void;
  triggerMode?: 'pill' | 'none';
  pillVariant?: 'default' | 'soft';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function EventSwitcher({
  userId,
  selectedEventId,
  onSelectEventId,
  label = 'אירוע',
  onHasMultipleChange,
  triggerMode = 'pill',
  pillVariant = 'default',
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [events, setEvents] = useState<MinimalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isNative = Platform.OS !== 'web';
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

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
  const isSoftPill = pillVariant === 'soft';
  const isNativeCompactModal = isNative;
  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );
  const selectedEventTitle = useMemo(
    () => getDisplayEventTitle(String(selectedEvent?.title ?? '')),
    [selectedEvent?.title]
  );

  useEffect(() => {
    onHasMultipleChange?.(hasMultiple);
  }, [hasMultiple, onHasMultipleChange]);

  const modalCardStyle = useMemo(() => {
    // On web, the overlay defaults to "stretch" alignment which makes the card span the full width.
    // Constrain width for desktop while keeping it responsive on smaller screens.
    const overlayPadding = 18;
    const availableWidth = Math.max(0, viewportWidth - overlayPadding * 2);
    const preferredMaxWidth = Platform.OS === 'web' ? 640 : availableWidth;
    const maxWidth = Math.min(preferredMaxWidth, availableWidth || preferredMaxWidth);

    // Keep the modal usable on small viewports while allowing more space on desktop.
    const maxHeight = Math.min(720, Math.max(320, viewportHeight - 140));

    return { width: '100%', maxWidth, maxHeight };
  }, [viewportWidth, viewportHeight]);

  if (!hasMultiple) return null;

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: '2-digit' });

  return (
    <>
      {triggerMode === 'pill' ? (
        <TouchableOpacity
          style={[styles.pill, isSoftPill ? styles.pillSoft : null]}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="בחירת אירוע"
        >
          {isNative ? (
            <>
              {/* Mobile: swap calendar + chevron positions */}
              <View style={[styles.pillIconWrap, isSoftPill ? styles.pillIconWrapSoft : null]}>
                <Ionicons
                  name={isSoftPill ? 'swap-horizontal-outline' : 'calendar-outline'}
                  size={18}
                  color={isSoftPill ? colors.text : colors.primary}
                />
              </View>

              <View style={styles.pillTextWrap}>
                {isSoftPill ? null : <Text style={[styles.pillLabel, isSoftPill ? styles.pillLabelSoft : null]}>{label}</Text>}
                <Text style={[styles.pillValue, isSoftPill ? styles.pillValueSoft : null]} numberOfLines={1}>
                  {selectedEventTitle || 'בחר אירוע'}
                  {isSoftPill ? '' : selectedEvent?.date ? ` · ${formatDate(selectedEvent.date)}` : ''}
                </Text>
              </View>

              <View style={styles.pillLeft}>
                {loading ? (
                  <ActivityIndicator size="small" color={isSoftPill ? colors.text : colors.primary} />
                ) : (
                  <Ionicons name="chevron-down" size={18} color={isSoftPill ? colors.gray[500] : colors.primary} />
                )}
              </View>
            </>
          ) : (
            <>
              {/* Web: keep current order */}
              <View style={styles.pillLeft}>
                {loading ? (
                  <ActivityIndicator size="small" color={isSoftPill ? colors.text : colors.primary} />
                ) : (
                  <Ionicons name="chevron-down" size={18} color={isSoftPill ? colors.gray[500] : colors.primary} />
                )}
              </View>

              <View style={styles.pillTextWrap}>
                {isSoftPill ? null : <Text style={[styles.pillLabel, isSoftPill ? styles.pillLabelSoft : null]}>{label}</Text>}
                <Text style={[styles.pillValue, isSoftPill ? styles.pillValueSoft : null]} numberOfLines={1}>
                  {selectedEventTitle || 'בחר אירוע'}
                  {isSoftPill ? '' : selectedEvent?.date ? ` · ${formatDate(selectedEvent.date)}` : ''}
                </Text>
              </View>

              <View style={[styles.pillIconWrap, isSoftPill ? styles.pillIconWrapSoft : null]}>
                <Ionicons
                  name={isSoftPill ? 'swap-horizontal-outline' : 'calendar-outline'}
                  size={18}
                  color={isSoftPill ? colors.text : colors.primary}
                />
              </View>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.modalOverlay, isNativeCompactModal ? styles.modalOverlayNative : null]} onPress={() => setOpen(false)}>
          <Pressable style={[styles.modalCard, modalCardStyle, isNativeCompactModal ? styles.modalCardNative : null]} onPress={() => { /* swallow */ }}>
            <View style={[styles.modalHeader, isNativeCompactModal ? styles.modalHeaderNative : null]}>
              <View style={[styles.modalHeaderTextWrap, isNativeCompactModal ? styles.modalHeaderTextWrapNative : null]}>
                <View style={[styles.modalTitleRow, isNativeCompactModal ? styles.modalTitleRowNative : null]}>
                  <View style={[styles.modalTitleIconWrap, isNativeCompactModal ? styles.modalTitleIconWrapNative : null]}>
                    <Ionicons name={isNativeCompactModal ? 'sparkles' : 'sparkles-outline'} size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.modalTitle}>בחר אירוע</Text>
                </View>
                {!isNativeCompactModal ? (
                  <Text style={styles.modalSubtitle}>בחרו את האירוע שברצונכם לנהל כרגע</Text>
                ) : (
                  <Text style={[styles.modalSubtitle, styles.modalSubtitleNative]}>בחרו את האירוע שברצונכם לנהל כרגע</Text>
                )}
              </View>

              <View style={[styles.modalHeaderActions, isNativeCompactModal ? styles.modalHeaderActionsNative : null]}>
                <View style={[styles.modalCountBadge, isNativeCompactModal ? styles.modalCountBadgeNative : null]}>
                  <Text style={styles.modalCountBadgeText}>{events.length} אירועים</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setOpen(false)}
                  style={[styles.closeButton, isNativeCompactModal ? styles.closeButtonNative : null]}
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, isNativeCompactModal ? styles.listContentNative : null]}
              renderItem={({ item }) => {
                const active = item.id === selectedEventId;
                const displayTitle = getDisplayEventTitle(String(item.title ?? ''));
                const subtitleParts = [
                  item.date ? formatDate(item.date) : '',
                  item.location ? item.location : '',
                  item.city ? item.city : '',
                ].filter(Boolean);

                return (
                  <TouchableOpacity
                    style={[styles.eventRow, active && styles.eventRowActive, isNativeCompactModal ? styles.eventRowNative : null]}
                    onPress={() => {
                      onSelectEventId(item.id);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`בחירת אירוע ${item.title}`}
                  >
                    <View style={[styles.eventLeft, active ? styles.eventLeftActive : null, isNativeCompactModal ? styles.eventLeftNative : null]}>
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'calendar-outline'}
                        size={22}
                        color={active ? colors.primary : colors.gray[500]}
                      />
                    </View>

                    <View style={[styles.eventTextWrap, isNativeCompactModal ? styles.eventTextWrapNative : null]}>
                      <View style={[styles.eventTitleRow, isNativeCompactModal ? styles.eventTitleRowNative : null]}>
                        {active ? (
                          <View style={styles.eventActiveBadge}>
                            <Text style={styles.eventActiveBadgeText}>נוכחי</Text>
                          </View>
                        ) : null}

                        <Text style={[styles.eventTitle, active && styles.eventTitleActive]} numberOfLines={1}>
                          {displayTitle || item.title}
                        </Text>
                      </View>

                      {!isNativeCompactModal ? (
                        <Text style={[styles.eventSubtitle, active && styles.eventSubtitleActive]} numberOfLines={1}>
                          {subtitleParts.join(' · ')}
                        </Text>
                      ) : null}

                      <View style={[styles.eventMetaRow, isNativeCompactModal ? styles.eventMetaRowNative : null]}>
                        {item.date ? (
                          <View style={styles.eventMetaPill}>
                            <Ionicons name="calendar-clear-outline" size={13} color={colors.gray[500]} />
                            <Text style={styles.eventMetaText}>{formatDate(item.date)}</Text>
                          </View>
                        ) : null}
                        {item.location || item.city ? (
                          <View style={styles.eventMetaPill}>
                            <Ionicons name="location-outline" size={13} color={colors.gray[500]} />
                            <Text style={styles.eventMetaText}>{[item.location, item.city].filter(Boolean).join(' · ')}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <View style={[styles.eventRight, isNativeCompactModal ? styles.eventRightNative : null]}>
                      {active ? null : (
                        <Ionicons name="chevron-back" size={18} color={colors.gray[400]} />
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  pillSoft: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(11, 28, 65, 0.06)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  pillIconWrapSoft: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.045)',
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  pillTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
  },
  pillLabelSoft: {
    color: colors.gray[500],
  },
  pillValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pillValueSoft: {
    color: '#0F172A',
  },
  pillLeft: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.42)',
    padding: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayNative: {
    backgroundColor: 'rgba(15,23,42,0.34)',
    paddingHorizontal: 12,
    paddingVertical: 22,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    overflow: 'hidden',
    maxHeight: 520,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 28px 80px rgba(15,23,42,0.20)',
        } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 14 },
        }),
  },
  modalCardNative: {
    borderRadius: 26,
    borderColor: 'rgba(148,163,184,0.14)',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    backgroundColor: '#FBFDFF',
  },
  modalHeaderNative: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
  },
  modalHeaderTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 6,
  },
  modalHeaderTextWrapNative: {
    alignItems: ALIGN_RIGHT,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderActionsNative: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  modalTitleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
  },
  modalTitleRowNative: {
    justifyContent: 'flex-start',
  },
  modalTitleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(25,93,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleIconWrapNative: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalSubtitleNative: {
    fontSize: 11,
    color: colors.gray[400],
  },
  modalCountBadge: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(25,93,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCountBadgeNative: {
    minHeight: 32,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(25,93,230,0.06)',
  },
  modalCountBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#F3F6FB',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonNative: {
    width: 36,
    height: 36,
    borderRadius: 13,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },
  listContentNative: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#FCFDFE',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 24px rgba(15,23,42,0.04)',
        } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  eventRowActive: {
    borderColor: 'rgba(25,93,230,0.28)',
    backgroundColor: 'rgba(25,93,230,0.07)',
  },
  eventRowNative: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
  },
  eventLeft: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventLeftNative: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  eventLeftActive: {
    backgroundColor: 'rgba(25,93,230,0.10)',
    borderColor: 'rgba(25,93,230,0.18)',
  },
  eventTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  eventTextWrapNative: {
    alignItems: ALIGN_RIGHT,
  },
  eventTitleRow: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eventTitleRowNative: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: 8,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    flex: 1,
  },
  eventTitleActive: {
    color: colors.primary,
  },
  eventActiveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(25,93,230,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.16)',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  eventActiveBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  eventSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  eventSubtitleActive: {
    color: colors.gray[700],
  },
  eventMetaRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'nowrap',
    marginTop: 10,
  },
  eventMetaRowNative: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  eventMetaPill: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
  },
  eventMetaText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  eventRight: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventRightNative: {
    width: 18,
    paddingTop: 8,
  },
});

