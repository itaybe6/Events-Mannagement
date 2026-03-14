import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FIXED_SEATS,
  TABLE_LABELS,
  type Orientation,
  type TableConfig,
  type TableType,
} from './_types';

type TabKey = 'tables' | 'zones' | 'text' | 'map';

type Props = {
  onBack: () => void;
  onAddTable: (config: TableConfig) => void;
  onAddZone: (name: string, widthCells: number, heightCells: number) => void;
  onAddLabel: (text: string) => void;
  onSave: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  saving?: boolean;
  gridCols: number;
  gridRows: number;
  onSetGrid: (cols: number, rows: number) => void;
  compact?: boolean;
};

export function TableSidebar({
  onBack,
  onAddTable,
  onAddZone,
  onAddLabel,
  onSave,
  onDeleteSelected,
  hasSelection,
  saving,
  gridCols,
  gridRows,
  onSetGrid,
  compact = false,
}: Props) {
  const [tab, setTab] = useState<TabKey>('tables');

  const [tableType, setTableType] = useState<TableType>('regular');
  const [orientation, setOrientation] = useState<Orientation>('row');
  const [quantity, setQuantity] = useState(1);

  const seats = FIXED_SEATS[tableType];

  const config: TableConfig = useMemo(
    () => ({ type: tableType, seats, orientation, quantity }),
    [orientation, quantity, seats, tableType]
  );

  const [zoneName, setZoneName] = useState('');
  const [zoneW, setZoneW] = useState(8);
  const [zoneH, setZoneH] = useState(6);

  const [labelText, setLabelText] = useState('');

  // Map size (grid) controls
  const [colsDraft, setColsDraft] = useState(gridCols);
  const [rowsDraft, setRowsDraft] = useState(gridRows);
  useEffect(() => setColsDraft(gridCols), [gridCols]);
  useEffect(() => setRowsDraft(gridRows), [gridRows]);

  return (
    <View style={[styles.sidebar, compact ? styles.sidebarCompact : null]}>
      <View pointerEvents="none" style={styles.sidebarGlowPrimary} />
      <View pointerEvents="none" style={styles.sidebarGlowSecondary} />

      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Ionicons name="color-wand-outline" size={14} color="#195DE6" />
          <Text style={styles.headerBadgeText}>עיצוב סקיצה</Text>
        </View>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>מפת הושבה</Text>
            <Text style={styles.subtitle}>סדרו את מפת השולחנות של האירוע</Text>
          </View>

          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
            hitSlop={10}
          >
            <Ionicons name="chevron-forward" size={22} color="rgba(17,24,39,0.70)" />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsRow}>
        <TabButton label="שולחנות" active={tab === 'tables'} onPress={() => setTab('tables')} />
        <TabButton label="אזורים" active={tab === 'zones'} onPress={() => setTab('zones')} />
        <TabButton label="טקסט" active={tab === 'text'} onPress={() => setTab('text')} />
        <TabButton label="מפה" active={tab === 'map'} onPress={() => setTab('map')} />
      </View>

      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.body}>
          {tab === 'map' ? (
            <View style={styles.mapSizeCard}>
              <SectionTitle title="גודל מפה (משבצות)" />
              <View style={styles.rowBetween}>
                <Text style={styles.value}>{colsDraft}</Text>
                <Text style={styles.label}>רוחב</Text>
              </View>
              <Stepper value={colsDraft} onChange={setColsDraft} min={20} max={300} />
              <View style={styles.rowBetween}>
                <Text style={styles.value}>{rowsDraft}</Text>
                <Text style={styles.label}>גובה</Text>
              </View>
              <Stepper value={rowsDraft} onChange={setRowsDraft} min={20} max={300} />
              <PrimaryButton label="החל גודל מפה" onPress={() => onSetGrid(colsDraft, rowsDraft)} />
            </View>
          ) : null}

          {tab === 'tables' ? (
            <>
              <SectionTitle title="סוג שולחן" />
              <View style={styles.typeRow}>
                <TypeButton
                  label="רגיל"
                  icon={(c) => <Ionicons name="square-outline" size={18} color={c} />}
                  active={tableType === 'regular'}
                  color="#2563EB"
                  onPress={() => setTableType('regular')}
                />
                <TypeButton
                  label="רזרבה"
                  icon={(c) => (
                    <View style={styles.iconStack}>
                      <Ionicons name="square-outline" size={18} color={c} />
                      <Ionicons name="help" size={12} color={c} style={styles.iconOverlay} />
                    </View>
                  )}
                  active={tableType === 'reserve'}
                  color="#F59E0B"
                  onPress={() => setTableType('reserve')}
                />
                <TypeButton
                  label="אביר"
                  icon={(c) => <View style={[styles.iconRect, { borderColor: c }]} />}
                  active={tableType === 'knight'}
                  color="#7C3AED"
                  onPress={() => setTableType('knight')}
                />
              </View>

              <View style={styles.seatsStat}>
                <Text style={styles.seatsLabel}>מקומות בשולחן</Text>
                <Text style={styles.seatsValue}>{seats}</Text>
              </View>

              <SectionTitle title="כמות שולחנות" />
              <Stepper value={quantity} onChange={setQuantity} min={1} max={20} />

              <SectionTitle title="כיוון סידור" />
              <View style={styles.segmentRow}>
                <SegmentButton label="שורה" icon="row" active={orientation === 'row'} onPress={() => setOrientation('row')} />
                <SegmentButton label="טור" icon="column" active={orientation === 'column'} onPress={() => setOrientation('column')} />
              </View>

              <PrimaryButton label="הוסף למפה" onPress={() => onAddTable(config)} />
            </>
          ) : null}

          {tab === 'zones' ? (
            <>
              <SectionTitle title="שם אזור" />
              <TextInput
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="למשל: רחבה"
                placeholderTextColor="rgba(17,24,39,0.35)"
                style={styles.input}
              />

              <SectionTitle title="רוחב/גובה במשבצות" />
              <View style={{ gap: 10 }}>
                <RowLabel label="רוחב" value={zoneW} />
                <Stepper value={zoneW} onChange={setZoneW} min={2} max={30} />
                <RowLabel label="גובה" value={zoneH} />
                <Stepper value={zoneH} onChange={setZoneH} min={2} max={20} />
              </View>

              <PrimaryButton
                label="הוסף אזור למפה"
                onPress={() => onAddZone(zoneName.trim(), zoneW, zoneH)}
                disabled={!zoneName.trim()}
              />
            </>
          ) : null}

          {tab === 'text' ? (
            <>
              <SectionTitle title="טקסט" />
              <TextInput
                value={labelText}
                onChangeText={setLabelText}
                placeholder="למשל: מעבר"
                placeholderTextColor="rgba(17,24,39,0.35)"
                style={styles.input}
              />
              <PrimaryButton
                label="הוסף טקסט למפה"
                onPress={() => onAddLabel(labelText.trim())}
                disabled={!labelText.trim()}
              />
            </>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onSave}
            disabled={!!saving}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.92 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? 'שומר...' : 'שמור'}</Text>
          </Pressable>

          {hasSelection ? (
            <Pressable
              onPress={onDeleteSelected}
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="trash-outline" size={18} color="#B91C1C" />
              <Text style={styles.deleteBtnText}>מחק נבחרים</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* Prevent RNW warning about TextInput defaultProps styling */}
      {Platform.OS === 'web' ? <View /> : null}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabBtn,
        active ? styles.tabBtnActive : styles.tabBtnInactive,
        pressed && { opacity: 0.82 },
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TypeButton({
  label,
  icon,
  active,
  color,
  onPress,
}: {
  label: string;
  icon: (iconColor: string) => React.ReactNode;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  const iconColor = active ? color : 'rgba(17,24,39,0.55)';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.typeBtn, active && { borderColor: color }, pressed && { opacity: 0.92 }]}>
      {icon(iconColor)}
      <Text style={[styles.typeText, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: 'row' | 'column';
  onPress: () => void;
}) {
  const c = active ? '#2b8cee' : 'rgba(17,24,39,0.35)';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.segmentBtn, active && styles.segmentBtnActive, pressed && { opacity: 0.92 }]}>
      <View
        style={[
          styles.segmentIcon,
          icon === 'row' ? styles.segmentIconRow : styles.segmentIconCol,
          { backgroundColor: c },
        ]}
      />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="remove" size={18} color="rgba(17,24,39,0.75)" />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [styles.stepBtn, styles.stepBtnPrimary, pressed && { opacity: 0.92 }]}
      >
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.92 },
      ]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function RowLabel({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'relative',
    overflow: 'hidden',
    width: 356,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 26,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(17,24,39,0.06)',
    padding: 18,
    shadowColor: '#0b1c41',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle at top right, rgba(25,93,230,0.12), rgba(25,93,230,0) 34%), radial-gradient(circle at bottom left, rgba(242,224,186,0.18), rgba(242,224,186,0) 32%)',
          backdropFilter: 'blur(10px)',
        } as any)
      : null),
  },
  sidebarCompact: {
    width: 320,
    padding: 14,
  },
  panelScroll: {
    flex: 1,
    marginTop: 12,
  },
  panelScrollContent: {
    paddingBottom: 8,
  },
  sidebarGlowPrimary: {
    position: 'absolute',
    top: -70,
    right: -45,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(25,93,230,0.10)',
  },
  sidebarGlowSecondary: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 999,
    backgroundColor: 'rgba(242,224,186,0.20)',
  },
  header: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(255,255,255,0.78)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(25,93,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.12)',
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#195DE6',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    width: '100%',
    minHeight: 60,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: { flex: 1, minWidth: 0, alignItems: 'stretch', justifyContent: 'center', gap: 4 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 24, fontWeight: '900', color: '#102A56', textAlign: 'right' },
  subtitle: { fontSize: 13, fontWeight: '700', color: 'rgba(17,24,39,0.55)', textAlign: 'right', lineHeight: 19 },

  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(248,250,255,0.90)',
  },
  tabBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.14)',
    shadowColor: '#195DE6',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tabBtnInactive: {
    backgroundColor: 'transparent',
  },
  tabText: { fontWeight: '900', fontSize: 12, color: 'rgba(17,24,39,0.70)', textAlign: 'center' },
  tabTextActive: { color: '#2b8cee' },

  body: {
    marginTop: 14,
    gap: 12,
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: 14,
  },
  sectionTitle: { marginTop: 6, fontSize: 12, fontWeight: '900', color: '#102A56', textAlign: 'right' },

  mapSizeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.10)',
    backgroundColor: 'rgba(247,250,255,0.92)',
    padding: 12,
  },

  typeRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  typeBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconStack: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconOverlay: {
    position: 'absolute',
  },
  iconRect: {
    width: 20,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
  },
  typeText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)' },

  rowBetween: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)' },
  value: { fontSize: 14, fontWeight: '900', color: '#102A56' },

  seatsStat: {
    marginTop: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(248,250,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.08)',
    alignItems: 'flex-start',
  },
  seatsLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)', textAlign: 'left' },
  seatsValue: { marginTop: 6, fontSize: 24, fontWeight: '900', color: '#102A56', textAlign: 'left' },

  stepper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(248,250,255,0.88)',
    padding: 10,
    marginTop: 6,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPrimary: {
    backgroundColor: '#2b8cee',
    borderColor: 'rgba(43,140,238,0.30)',
  },
  stepValue: { fontSize: 24, fontWeight: '900', color: '#102A56', letterSpacing: -0.4 },

  segmentRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  segmentBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  segmentBtnActive: {
    borderColor: 'rgba(43,140,238,0.45)',
    backgroundColor: 'rgba(43,140,238,0.10)',
  },
  segmentIcon: {
    borderRadius: 999,
  },
  segmentIconRow: {
    width: 22,
    height: 3,
  },
  segmentIconCol: {
    width: 3,
    height: 22,
  },
  segmentText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)' },
  segmentTextActive: { color: '#2b8cee' },

  input: {
    height: 46,
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    fontWeight: '800',
    color: '#111418',
    textAlign: 'right',
  },

  primaryBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#2F80ED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F80ED',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  primaryBtnText: { fontWeight: '900', color: '#fff' },

  footer: {
    marginTop: 14,
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: 14,
  },
  saveBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#1D4ED8',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  saveBtnText: { color: '#fff', fontWeight: '900' },
  deleteBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,244,246,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: { color: '#B91C1C', fontWeight: '900' },
});

// expo-router treats files under `app/` as routes on web; provide a default export.
export default TableSidebar;
