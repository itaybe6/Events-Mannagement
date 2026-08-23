import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { ROW_DIR } from '@/lib/rtl';

export type TableNumberFilterOption = {
  id: string;
  label: string;
  meta?: string;
};

function optionMatchesQuery(opt: TableNumberFilterOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (opt.label.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (!digits) return false;
  return opt.label.replace(/\D/g, '').includes(digits);
}

export function TableNumberFilter({
  options,
  selectedId,
  onSelect,
  compact,
}: {
  options: TableNumberFilterOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => (selectedId ? options.find((opt) => opt.id === selectedId) ?? null : null),
    [options, selectedId]
  );

  const visibleOptions = useMemo(() => {
    const matched = options.filter((opt) => optionMatchesQuery(opt, query));
    const digits = query.trim().replace(/\D/g, '');
    if (!digits) return matched;
    return [...matched].sort((a, b) => {
      const aExact = a.label.replace(/\D/g, '') === digits ? 0 : 1;
      const bExact = b.label.replace(/\D/g, '') === digits ? 0 : 1;
      return aExact - bExact;
    });
  }, [options, query]);

  const triggerLabel = selected?.label ?? (selectedId ? 'שולחן' : 'כל השולחנות');
  const isActive = Boolean(selectedId);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (id: string | null) => {
    onSelect(id);
    close();
  };

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={isActive ? `סינון לפי ${triggerLabel}` : 'סינון לפי מספר שולחן'}
        style={({ pressed }) => [
          styles.trigger,
          compact ? styles.triggerCompact : null,
          isActive ? styles.triggerActive : null,
          pressed ? { opacity: 0.92 } : null,
        ]}
      >
        <Ionicons name="chevron-down" size={compact ? 16 : 18} color={isActive ? colors.primary : colors.gray[500]} />
        {isActive ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onSelect(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="נקה סינון שולחן"
            style={({ pressed }) => [styles.clearBtn, pressed ? { opacity: 0.8 } : null]}
          >
            <Ionicons name="close" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
        <Text
          style={[styles.triggerText, compact ? styles.triggerTextCompact : null, isActive ? styles.triggerTextActive : null]}
          numberOfLines={1}
        >
          {triggerLabel}
        </Text>
        <View style={[styles.triggerIcon, compact ? styles.triggerIconCompact : null]}>
          <Ionicons name="restaurant" size={compact ? 14 : 16} color={colors.primary} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={[styles.sheet, compact ? styles.sheetCompact : null]} onPress={() => null}>
            <View style={styles.sheetHeader}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.sheetClose, pressed ? { opacity: 0.85 } : null]}
                accessibilityRole="button"
                accessibilityLabel="סגירה"
              >
                <Ionicons name="close" size={18} color="rgba(17,24,39,0.7)" />
              </Pressable>
              <Text style={styles.sheetTitle}>בחירת שולחן</Text>
              <View style={{ width: 36 }} />
            </View>

            <View style={[styles.searchBox, compact ? styles.searchBoxCompact : null]}>
              <Ionicons name="search" size={18} color={colors.gray[500]} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש מספר שולחן..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
                textAlign="right"
                autoCapitalize="none"
                keyboardType="number-pad"
                autoFocus
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="נקה חיפוש שולחן">
                  <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => pick(null)}
                style={({ pressed }) => [
                  styles.option,
                  !selectedId ? styles.optionSelected : null,
                  pressed ? { opacity: 0.9 } : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="הצג את כל השולחנות"
              >
                <Ionicons
                  name={!selectedId ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={!selectedId ? colors.primary : 'rgba(156,163,175,0.9)'}
                />
                <Text style={styles.optionText}>כל השולחנות</Text>
              </Pressable>

              {visibleOptions.map((opt) => {
                const selectedRow = selectedId === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => pick(opt.id)}
                    style={({ pressed }) => [
                      styles.option,
                      selectedRow ? styles.optionSelected : null,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`הצג אורחים ב${opt.label}`}
                  >
                    <Ionicons
                      name={selectedRow ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selectedRow ? colors.primary : 'rgba(156,163,175,0.9)'}
                    />
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionText} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {opt.meta ? (
                        <Text style={styles.optionMeta} numberOfLines={1}>
                          {opt.meta}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {visibleOptions.length === 0 ? (
                <Text style={styles.emptyText}>
                  {options.length === 0 ? 'לא הוגדרו שולחנות לאירוע.' : 'לא נמצאו שולחנות מתאימים לחיפוש.'}
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  wrapCompact: { marginTop: 8 },
  trigger: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  triggerCompact: { minHeight: 42, borderRadius: 14, paddingVertical: 8 },
  triggerActive: {
    backgroundColor: 'rgba(17, 82, 212, 0.08)',
    borderColor: 'rgba(17, 82, 212, 0.22)',
  },
  triggerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
  },
  triggerIconCompact: { width: 26, height: 26, borderRadius: 8 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'right' },
  triggerTextCompact: { fontSize: 13 },
  triggerTextActive: { color: colors.primary, fontWeight: '900' },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 82, 212, 0.10)',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    ...(Platform.OS === 'web' ? ({ zIndex: 80 } as object) : null),
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    borderRadius: 22,
    backgroundColor: colors.white,
    padding: 14,
    gap: 10,
  },
  sheetCompact: { maxWidth: 460 },
  sheetHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.06)',
  },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'center' },
  searchBox: {
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  searchBoxCompact: { height: 42, borderRadius: 14 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  list: { maxHeight: 360 },
  option: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  optionSelected: {
    backgroundColor: 'rgba(17, 82, 212, 0.07)',
    borderColor: 'rgba(17, 82, 212, 0.45)',
    borderWidth: 2,
  },
  optionInfo: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  optionText: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right' },
  optionMeta: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  emptyText: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
});
