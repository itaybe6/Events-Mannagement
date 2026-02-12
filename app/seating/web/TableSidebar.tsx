import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FIXED_SEATS,
  TABLE_LABELS,
  type Orientation,
  type TableConfig,
  type TableType,
} from './types';

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
    <View style={styles.sidebar}>
      <View style={styles.header}>
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
                // Ionicons doesn't reliably include a rectangle-outline glyph across builds,
                // so we render a simple rectangle ourselves.
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
            <Stepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={20}
            />

            <SectionTitle title="כיוון סידור" />
            <View style={styles.segmentRow}>
              <SegmentButton label="שורה" icon="row" active={orientation === 'row'} onPress={() => setOrientation('row')} />
              <SegmentButton label="טור" icon="column" active={orientation === 'column'} onPress={() => setOrientation('column')} />
            </View>

            <PrimaryButton
              label="הוסף למפה"
              onPress={() => onAddTable(config)}
            />
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
    width: 340,
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(17,24,39,0.10)',
    padding: 14,
  },
  header: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  // Center title/subtitle, keep back button on the right (like the screenshot).
  headerRow: {
    position: 'relative',
    width: '100%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: { alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111418', textAlign: 'center', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(17,24,39,0.55)', textAlign: 'center', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  // Tabs (underline style, like the screenshot)
  tabsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,24,39,0.10)',
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 3,
    marginBottom: -1, // sit on top of the row divider line
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tabBtnActive: {
    borderBottomColor: '#2b8cee',
  },
  tabBtnInactive: {
    borderBottomColor: 'transparent',
  },
  tabText: { fontWeight: '900', fontSize: 12, color: 'rgba(17,24,39,0.70)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  tabTextActive: { color: '#2b8cee' },

  body: { marginTop: 12, gap: 10 },
  sectionTitle: { marginTop: 6, fontSize: 12, fontWeight: '900', color: '#111418', textAlign: 'right', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  mapSizeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.02)',
    padding: 10,
  },

  typeRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 8 },
  typeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
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
  typeText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  rowBetween: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  value: { fontSize: 14, fontWeight: '900', color: '#111418', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  seatsStat: { marginTop: 10, alignItems: 'flex-start' },
  seatsLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)', textAlign: 'left', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  seatsValue: { marginTop: 6, fontSize: 20, fontWeight: '900', color: '#111418', textAlign: 'left', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  stepper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
    padding: 10,
    marginTop: 6,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPrimary: {
    backgroundColor: '#2b8cee',
    borderColor: 'rgba(43,140,238,0.30)',
  },
  stepValue: { fontSize: 24, fontWeight: '900', color: '#111418', letterSpacing: -0.4, ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  segmentRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
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
  segmentText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  segmentTextActive: { color: '#2b8cee' },

  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
    fontWeight: '800',
    color: '#111418',
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },

  primaryBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#2b8cee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontWeight: '900', color: '#fff', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  footer: { marginTop: 14, gap: 10 },
  saveBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#1D4ED8',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  deleteBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: { color: '#B91C1C', fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
});

