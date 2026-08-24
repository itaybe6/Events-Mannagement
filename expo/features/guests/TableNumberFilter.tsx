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
import { ALIGN_RIGHT, ROW_DIR, TEXT_RIGHT } from '@/lib/rtl';

export type TableNumberFilterOption = {
  id: string;
  label: string;
  meta?: string;
};

const webShadow = Platform.OS === 'web'
  ? ({ boxShadow: '0 8px 28px rgba(6,23,62,0.14)' } as object)
  : null;

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
      >
        <View
          style={[
            styles.trigger,
            compact ? styles.triggerCompact : null,
            isActive ? styles.triggerActive : null,
          ]}
        >
          <View style={[styles.iconBox, compact ? styles.iconBoxCompact : null]}>
            <Ionicons name="restaurant" size={compact ? 15 : 17} color={colors.primary} />
          </View>
          <Text
            style={[styles.triggerText, compact ? styles.triggerTextCompact : null, isActive ? styles.triggerTextActive : null]}
            numberOfLines={1}
          >
            {triggerLabel}
          </Text>
          {isActive ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onSelect(null);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="נקה סינון שולחן"
              style={styles.clearBtn}
            >
              <Ionicons name="close" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <View style={styles.chevronBox}>
              <Ionicons name="chevron-down" size={18} color={colors.gray[600]} />
            </View>
          )}
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={[styles.sheet, compact ? styles.sheetCompact : null]}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={close} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="סגירה">
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
              <Text style={styles.sheetTitle}>בחירת שולחן</Text>
              <View style={styles.sheetCloseSpacer} />
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
              <OptionRow
                selected={!selectedId}
                label="כל השולחנות"
                onPress={() => pick(null)}
              />
              {visibleOptions.map((opt) => (
                <OptionRow
                  key={opt.id}
                  selected={selectedId === opt.id}
                  label={opt.label}
                  meta={opt.meta}
                  onPress={() => pick(opt.id)}
                />
              ))}
              {visibleOptions.length === 0 ? (
                <Text style={styles.emptyText}>
                  {options.length === 0 ? 'לא הוגדרו שולחנות לאירוע.' : 'לא נמצאו שולחנות מתאימים לחיפוש.'}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function OptionRow({
  selected,
  label,
  meta,
  onPress,
}: {
  selected: boolean;
  label: string;
  meta?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.option, selected ? styles.optionSelected : null]}>
        <View style={styles.radioBox}>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? colors.primary : 'rgba(156,163,175,0.95)'}
          />
        </View>
        <View style={styles.optionInfo}>
          <Text style={styles.optionText} numberOfLines={1}>
            {label}
          </Text>
          {meta ? (
            <Text style={styles.optionMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// Yoga stays LTR app-wide (see `lib/rtl.ts`). Hebrew rows are mirrored with
// `row-reverse` only - setting `direction: 'rtl'` here would inherit down and
// flip `textAlign: 'right'` to the physical left on native.
const rowRtl = {
  flexDirection: ROW_DIR,
  alignItems: 'center' as const,
};

const styles = StyleSheet.create({
  wrap: { marginTop: 10, alignSelf: 'stretch', width: '100%' },
  wrapCompact: { marginTop: 8, alignSelf: 'stretch', width: '100%' },
  trigger: {
    ...rowRtl,
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    elevation: 2,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 4px rgba(6,23,62,0.06)' } as object) : null),
  },
  triggerCompact: { minHeight: 44, borderRadius: 14 },
  triggerActive: {
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderColor: 'rgba(6,23,62,0.22)',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxCompact: { width: 28, height: 28, borderRadius: 8 },
  triggerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  triggerTextCompact: { fontSize: 13 },
  triggerTextActive: { color: colors.primary, fontWeight: '900' },
  chevronBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.08)',
    flexShrink: 0,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
    elevation: 12,
    ...(webShadow ?? {}),
  },
  sheetCompact: { maxWidth: 460 },
  sheetHeader: {
    ...rowRtl,
    justifyContent: 'space-between',
    minHeight: 36,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.06)',
    flexShrink: 0,
  },
  sheetCloseSpacer: { width: 36, height: 36 },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  searchBox: {
    ...rowRtl,
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
  },
  searchBoxCompact: { height: 44, borderRadius: 14 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: colors.text },
  list: { maxHeight: 360 },
  option: {
    ...rowRtl,
    marginTop: 8,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  optionSelected: {
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  radioBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionInfo: { flex: 1, minWidth: 0, alignItems: ALIGN_RIGHT, justifyContent: 'center', gap: 2 },
  optionText: { width: '100%', fontSize: 15, fontWeight: '900', color: colors.text, textAlign: TEXT_RIGHT },
  optionMeta: { width: '100%', fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: TEXT_RIGHT },
  emptyText: { marginTop: 14, fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },
});
