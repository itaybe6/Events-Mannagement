import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  FIXED_SEATS,
  TABLE_LABELS,
  type Orientation,
  type TableConfig,
  type TableType,
} from './types';

type TabKey = 'tables' | 'zones' | 'text';

type Props = {
  onAddTable: (config: TableConfig) => void;
  onAddZone: (name: string, widthCells: number, heightCells: number) => void;
  onAddLabel: (text: string) => void;
  onSave: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  saving?: boolean;
};

export function TableSidebar({
  onAddTable,
  onAddZone,
  onAddLabel,
  onSave,
  onDeleteSelected,
  hasSelection,
  saving,
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

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.title}>מפת הושבה</Text>
        <Text style={styles.subtitle}>גרירה לפי משבצות · בחירה מרובה עם Ctrl/Cmd</Text>
      </View>

      <View style={styles.tabsRow}>
        <TabButton label="שולחנות" active={tab === 'tables'} onPress={() => setTab('tables')} />
        <TabButton label="אזורים" active={tab === 'zones'} onPress={() => setTab('zones')} />
        <TabButton label="טקסט" active={tab === 'text'} onPress={() => setTab('text')} />
      </View>

      <View style={styles.body}>
        {tab === 'tables' ? (
          <>
            <SectionTitle title="סוג שולחן" />
            <View style={styles.typeRow}>
              <TypeButton
                label="רגיל"
                icon="add-circle-outline"
                active={tableType === 'regular'}
                color="#2563EB"
                onPress={() => setTableType('regular')}
              />
              <TypeButton
                label="רזרבה"
                icon="alert-circle-outline"
                active={tableType === 'reserve'}
                color="#F59E0B"
                onPress={() => setTableType('reserve')}
              />
              <TypeButton
                label="אביר"
                icon="square-outline"
                active={tableType === 'knight'}
                color="#7C3AED"
                onPress={() => setTableType('knight')}
              />
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.label}>מקומות</Text>
              <Text style={styles.value}>{seats}</Text>
            </View>

            <SectionTitle title="כמות" />
            <Stepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={20}
            />

            <SectionTitle title="כיוון סידור" />
            <View style={styles.segmentRow}>
              <SegmentButton label="שורה" active={orientation === 'row'} onPress={() => setOrientation('row')} />
              <SegmentButton label="טור" active={orientation === 'column'} onPress={() => setOrientation('column')} />
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tabBtn, active && styles.tabBtnActive, pressed && { opacity: 0.92 }]}>
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
  icon: any;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.typeBtn, active && { borderColor: color }, pressed && { opacity: 0.92 }]}>
      <Ionicons name={icon} size={18} color={active ? color : 'rgba(17,24,39,0.55)'} />
      <Text style={[styles.typeText, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.segmentBtn, active && styles.segmentBtnActive, pressed && { opacity: 0.92 }]}>
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
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(17,24,39,0.10)',
    padding: 14,
  },
  header: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111418', textAlign: 'right' },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(17,24,39,0.55)', textAlign: 'right' },

  tabsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  tabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    borderColor: 'rgba(43,140,238,0.45)',
    backgroundColor: 'rgba(43,140,238,0.10)',
  },
  tabText: { fontWeight: '900', fontSize: 12, color: 'rgba(17,24,39,0.70)' },
  tabTextActive: { color: '#2b8cee' },

  body: { marginTop: 12, gap: 10 },
  sectionTitle: { marginTop: 6, fontSize: 12, fontWeight: '900', color: '#111418', textAlign: 'right' },

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
  typeText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)' },

  rowBetween: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)' },
  value: { fontSize: 14, fontWeight: '900', color: '#111418' },

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
  stepValue: { fontSize: 24, fontWeight: '900', color: '#111418', letterSpacing: -0.4 },

  segmentRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderColor: 'rgba(43,140,238,0.45)',
    backgroundColor: 'rgba(43,140,238,0.10)',
  },
  segmentText: { fontWeight: '900', color: 'rgba(17,24,39,0.70)' },
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
  },

  primaryBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#2b8cee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontWeight: '900', color: '#fff' },

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
  saveBtnText: { color: '#fff', fontWeight: '900' },
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
  deleteBtnText: { color: '#B91C1C', fontWeight: '900' },
});

