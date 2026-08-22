import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { TOUCH_TARGET } from '@/lib/responsive';
import { getWebAppNav, getWebPathLeaf, type WebAppNavItem } from '@/lib/webAppNav';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';

type Props = {
  /** Compact trigger for dense toolbars like check-in. */
  compact?: boolean;
  /** Use a light trigger on dark headers. */
  tone?: 'onLight' | 'onDark';
};

export default function WebAppMenu({ compact = false, tone = 'onLight' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ id?: string | string[]; eventId?: string | string[] }>();
  const userType = useUserStore((state) => state.userType);
  const userData = useUserStore((state) => state.userData);
  const activeUserId = useEventSelectionStore((state) => state.activeUserId);
  const activeEventId = useEventSelectionStore((state) => state.activeEventId);
  const [open, setOpen] = useState(false);

  const paramEventId = useMemo(() => {
    const fromEventId = Array.isArray(globalParams.eventId) ? globalParams.eventId[0] : globalParams.eventId;
    const fromId = Array.isArray(globalParams.id) ? globalParams.id[0] : globalParams.id;
    return String(fromEventId || fromId || '').trim();
  }, [globalParams.eventId, globalParams.id]);

  const resolvedEventId = useMemo(() => {
    if (paramEventId) return paramEventId;
    if (userType === 'event_owner') {
      const stored =
        userData?.id && activeUserId === userData.id ? String(activeEventId || '').trim() : '';
      return stored || String(userData?.event_id || '').trim();
    }
    return '';
  }, [activeEventId, activeUserId, paramEventId, userData?.event_id, userData?.id, userType]);

  const { inEvent, sections } = useMemo(
    () =>
      getWebAppNav({
        userType,
        pathname: pathname || '/',
        eventId: resolvedEventId,
      }),
    [pathname, resolvedEventId, userType]
  );

  const currentLeaf = getWebPathLeaf(pathname || '/');

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleNavigate = (item: WebAppNavItem) => {
    setOpen(false);
    if (item.params) {
      router.push({ pathname: item.href as any, params: item.params as any });
      return;
    }
    router.push(item.href as any);
  };

  if (Platform.OS !== 'web') return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="פתח תפריט ניווט"
        onPress={() => setOpen(true)}
        style={({ hovered, pressed }: any) => [
          styles.trigger,
          compact ? styles.triggerCompact : null,
          tone === 'onDark' ? styles.triggerOnDark : null,
          Platform.OS === 'web' && hovered
            ? tone === 'onDark'
              ? styles.triggerOnDarkHover
              : styles.triggerHover
            : null,
          pressed ? styles.triggerPressed : null,
        ]}
      >
        <Ionicons
          name="menu"
          size={compact ? 20 : 22}
          color={tone === 'onDark' ? colors.primary : colors.white}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגור תפריט"
            onPress={() => setOpen(false)}
            style={styles.backdrop}
          />

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגור תפריט"
                onPress={() => setOpen(false)}
                style={({ hovered, pressed }: any) => [
                  styles.closeBtn,
                  Platform.OS === 'web' && hovered ? styles.closeBtnHover : null,
                  pressed ? styles.triggerPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
              <View style={styles.panelHeaderText}>
                <Text style={styles.panelEyebrow}>{inEvent ? 'ניווט באירוע' : 'תפריט'}</Text>
                <Text style={styles.panelTitle}>{inEvent ? 'מעבר מהיר באירוע' : 'מעבר מהיר'}</Text>
              </View>
            </View>

            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.panelScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {sections.map((section) => (
                <View key={section.key} style={styles.section}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View style={styles.sectionItems}>
                    {section.items.map((item) => {
                      const active =
                        item.matchLeaves.includes(currentLeaf) ||
                        (currentLeaf === '' && item.matchLeaves.includes(''));

                      return (
                        <Pressable
                          key={item.key}
                          accessibilityRole="button"
                          accessibilityLabel={`מעבר אל ${item.label}`}
                          onPress={() => handleNavigate(item)}
                          style={({ hovered, pressed }: any) => [
                            styles.item,
                            active ? styles.itemActive : null,
                            Platform.OS === 'web' && hovered && !active ? styles.itemHover : null,
                            pressed ? styles.itemPressed : null,
                          ]}
                        >
                          <Text style={[styles.itemLabel, active ? styles.itemLabelActive : null]}>{item.label}</Text>
                          <View style={[styles.itemIcon, active ? styles.itemIconActive : null]}>
                            <Ionicons
                              name={item.icon}
                              size={18}
                              color={active ? colors.white : colors.primary}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.35)',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 8px 18px rgba(6,23,62,0.18)',
        } as any)
      : {
          shadowColor: colors.primary,
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  triggerCompact: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  triggerHover: {
    backgroundColor: '#0A2458',
  },
  triggerOnDark: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(240,203,70,0.55)',
  },
  triggerOnDarkHover: {
    backgroundColor: '#F7F3E8',
  },
  triggerPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  modalRoot: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          direction: 'rtl',
        } as any)
      : null),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,23,62,0.42)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 360,
    maxWidth: '92%',
    backgroundColor: '#F8FAFD',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(6,23,62,0.06)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '-18px 0 48px rgba(6,23,62,0.16)',
        } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: -8, height: 0 },
        }),
  },
  panelHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  panelEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.secondary,
    textAlign: 'right',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F4F7FC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  closeBtnHover: {
    backgroundColor: '#EEF3FA',
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  sectionItems: {
    gap: 8,
  },
  item: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  itemHover: {
    backgroundColor: 'rgba(25,93,230,0.05)',
    borderColor: 'rgba(25,93,230,0.12)',
  },
  itemActive: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.18)',
  },
  itemPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  itemLabelActive: {
    color: colors.white,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
