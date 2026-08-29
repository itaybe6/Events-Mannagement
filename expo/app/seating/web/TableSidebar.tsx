import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  clampTableNumber,
  clampTableSeats,
  defaultSeatsForType,
  MAX_TABLE_NUMBER,
  MAX_TABLE_SEATS,
  MIN_TABLE_NUMBER,
  MIN_TABLE_SEATS,
  SEAT_PRESETS,
  type NumberingAnchor,
  type Orientation,
  type PlacedTable,
  type TableConfig,
  type TableType,
} from './_types';

type TabKey = 'tables' | 'zones' | 'text' | 'map';

type Props = {
  onBack: () => void;
  onAddTable: (config: TableConfig) => void;
  onAddZone: (name: string, widthCells: number, heightCells: number) => void;
  onAddLabel: (text: string) => void;
  onSave: (pendingGrid?: { cols: number; rows: number }) => void | Promise<void>;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  saving?: boolean;
  gridCols: number;
  gridRows: number;
  onSetGrid: (cols: number, rows: number) => void;
  compact?: boolean;
  hideHeader?: boolean;
  nextTableNumber?: number;
  selectedTable?: PlacedTable | null;
  selectedOccupied?: number;
  usedNumbers?: Set<number>;
  onUpdateSelectedTable?: (patch: Partial<Pick<PlacedTable, 'number' | 'seats' | 'type' | 'orientation'>>) => void;
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
  hideHeader = false,
  nextTableNumber = 1,
  selectedTable = null,
  selectedOccupied = 0,
  usedNumbers,
  onUpdateSelectedTable,
}: Props) {
  const [tab, setTab] = useState<TabKey>('tables');

  const [tableType, setTableType] = useState<TableType>('regular');
  const [orientation, setOrientation] = useState<Orientation>('row');
  const [quantity, setQuantity] = useState(1);
  const [seatCount, setSeatCount] = useState(defaultSeatsForType('regular'));
  const [startNumber, setStartNumber] = useState(nextTableNumber);
  const [startNumberTouched, setStartNumberTouched] = useState(false);
  const [numberingAnchor, setNumberingAnchor] = useState<NumberingAnchor>('start');

  useEffect(() => {
    if (selectedTable) setTab('tables');
  }, [selectedTable?.id]);

  useEffect(() => {
    setSeatCount(defaultSeatsForType(tableType));
  }, [tableType]);

  useEffect(() => {
    if (!startNumberTouched) {
      setStartNumber(nextTableNumber);
    }
  }, [nextTableNumber, startNumberTouched]);

  const seats = clampTableSeats(seatCount);
  const tableStart = clampTableNumber(startNumber);
  const tableEnd = tableStart + Math.max(0, quantity - 1);
  const numberingRange =
    quantity <= 1 ? `שולחן ${tableStart}` : `שולחנות ${tableStart}–${tableEnd}`;
  const numberingPosition =
    quantity <= 1
      ? null
      : orientation === 'column'
        ? numberingAnchor === 'start'
          ? `${tableStart} למעלה`
          : `${tableStart} למטה`
        : numberingAnchor === 'start'
          ? `${tableStart} בהתחלה`
          : `${tableStart} בסוף`;
  const numberingPreview = numberingPosition ? `${numberingRange} · ${numberingPosition}` : numberingRange;
  const selectedNumberTaken =
    typeof selectedTable?.number === 'number' && Boolean(usedNumbers?.has(selectedTable.number));

  const config: TableConfig = useMemo(
    () => ({
      type: tableType,
      seats,
      orientation,
      quantity,
      startNumber: tableStart,
      numberingAnchor,
    }),
    [numberingAnchor, orientation, quantity, seats, tableStart, tableType]
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

      {!hideHeader ? (
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
      ) : null}

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
              {selectedTable && onUpdateSelectedTable ? (
                <View style={styles.editCard}>
                  <SectionTitle title={`עריכת שולחן ${selectedTable.number ?? ''}`} />
                  <Text style={styles.editHint}>
                    אפשר לשנות מספר או גודל. המוזמנים שכבר משובצים לשולחן יישארו במקום.
                  </Text>

                  <View style={styles.customSeatsRow}>
                    <Text style={styles.customSeatsLabel}>מספר שולחן</Text>
                    <TextInput
                      value={String(selectedTable.number ?? '')}
                      onChangeText={(text) => {
                        const digits = text.replace(/[^\d]/g, '');
                        if (!digits) return;
                        onUpdateSelectedTable({ number: clampTableNumber(Number(digits)) });
                      }}
                      keyboardType="number-pad"
                      style={styles.customSeatsInput}
                      {...(Platform.OS === 'web'
                        ? ({ inputMode: 'numeric', pattern: '[0-9]*' } as any)
                        : null)}
                    />
                  </View>
                  <Stepper
                    value={typeof selectedTable.number === 'number' ? selectedTable.number : MIN_TABLE_NUMBER}
                    onChange={(v) => onUpdateSelectedTable({ number: v })}
                    min={MIN_TABLE_NUMBER}
                    max={MAX_TABLE_NUMBER}
                  />
                  {selectedNumberTaken ? (
                    <Text style={styles.editWarn}>{`המספר ${selectedTable.number} כבר בשימוש בשולחן אחר`}</Text>
                  ) : null}

                  <SectionTitle title="גודל (מקומות)" />
                  <View style={styles.presetRow}>
                    {SEAT_PRESETS.map((preset) => (
                      <Pressable
                        key={`edit-${preset}`}
                        onPress={() => onUpdateSelectedTable({ seats: preset })}
                        style={({ pressed }) => [
                          styles.presetBtn,
                          selectedTable.seats === preset ? styles.presetBtnActive : null,
                          pressed && { opacity: 0.88 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            selectedTable.seats === preset ? styles.presetTextActive : null,
                          ]}
                        >
                          {preset}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.customSeatsRow}>
                    <Text style={styles.customSeatsLabel}>מותאם אישית</Text>
                    <TextInput
                      value={String(selectedTable.seats)}
                      onChangeText={(text) => {
                        const digits = text.replace(/[^\d]/g, '');
                        if (!digits) return;
                        onUpdateSelectedTable({ seats: clampTableSeats(Number(digits)) });
                      }}
                      keyboardType="number-pad"
                      style={styles.customSeatsInput}
                      {...(Platform.OS === 'web'
                        ? ({ inputMode: 'numeric', pattern: '[0-9]*' } as any)
                        : null)}
                    />
                  </View>
                  <Stepper
                    value={selectedTable.seats}
                    onChange={(v) => onUpdateSelectedTable({ seats: v })}
                    min={MIN_TABLE_SEATS}
                    max={MAX_TABLE_SEATS}
                  />
                  {selectedOccupied > 0 ? (
                    <Text style={styles.editOccupied}>{`${selectedOccupied} מוזמנים משובצים כרגע`}</Text>
                  ) : null}
                  {selectedOccupied > selectedTable.seats ? (
                    <Text style={styles.editWarn}>
                      יש יותר מוזמנים מקיבולת השולחן. הם יישארו משובצים, אבל השולחן יהיה מעל הקיבולת.
                    </Text>
                  ) : null}

                  <SectionTitle title="סוג שולחן" />
                  <View style={styles.typeRow}>
                    <TypeButton
                      label="רגיל"
                      icon={(c) => <Ionicons name="square-outline" size={18} color={c} />}
                      active={selectedTable.type === 'regular'}
                      color="#2563EB"
                      onPress={() => onUpdateSelectedTable({ type: 'regular' })}
                    />
                    <TypeButton
                      label="רזרבה"
                      icon={(c) => (
                        <View style={styles.iconStack}>
                          <Ionicons name="square-outline" size={18} color={c} />
                          <Ionicons name="help" size={12} color={c} style={styles.iconOverlay} />
                        </View>
                      )}
                      active={selectedTable.type === 'reserve'}
                      color="#F59E0B"
                      onPress={() => onUpdateSelectedTable({ type: 'reserve' })}
                    />
                    <TypeButton
                      label="אביר"
                      icon={(c) => <View style={[styles.iconRect, { borderColor: c }]} />}
                      active={selectedTable.type === 'knight'}
                      color="#7C3AED"
                      onPress={() => onUpdateSelectedTable({ type: 'knight' })}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.editHint}>בחרו שולחן במפה כדי לערוך את המספר או הגודל שלו.</Text>
              )}

              <SectionTitle title="הוספת שולחנות" />
              <Text style={styles.editHint}>שולחנות חדשים יתווספו לסקיצה בלי לשנות שיבוץ קיים.</Text>
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

              <SectionTitle title="מקומות ישיבה" />
              <View style={styles.presetRow}>
                {SEAT_PRESETS.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => setSeatCount(preset)}
                    style={({ pressed }) => [
                      styles.presetBtn,
                      seats === preset ? styles.presetBtnActive : null,
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    <Text style={[styles.presetText, seats === preset ? styles.presetTextActive : null]}>{preset}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.customSeatsRow}>
                <Text style={styles.customSeatsLabel}>מותאם אישית</Text>
                <TextInput
                  value={String(seats)}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^\d]/g, '');
                    if (!digits) {
                      setSeatCount(MIN_TABLE_SEATS);
                      return;
                    }
                    setSeatCount(clampTableSeats(Number(digits)));
                  }}
                  keyboardType="number-pad"
                  placeholder={`${MIN_TABLE_SEATS}-${MAX_TABLE_SEATS}`}
                  placeholderTextColor="rgba(17,24,39,0.35)"
                  style={styles.customSeatsInput}
                  {...(Platform.OS === 'web'
                    ? ({ inputMode: 'numeric', pattern: '[0-9]*' } as any)
                    : null)}
                />
              </View>
              <Stepper
                value={seats}
                onChange={setSeatCount}
                min={MIN_TABLE_SEATS}
                max={MAX_TABLE_SEATS}
              />

              <SectionTitle title="כמות שולחנות" />
              <Stepper value={quantity} onChange={setQuantity} min={1} max={20} />

              <SectionTitle title="מספור שולחנות" />
              <View style={styles.customSeatsRow}>
                <Text style={styles.customSeatsLabel}>שולחן ראשון</Text>
                <TextInput
                  value={String(tableStart)}
                  onChangeText={(text) => {
                    setStartNumberTouched(true);
                    const digits = text.replace(/[^\d]/g, '');
                    if (!digits) {
                      setStartNumber(MIN_TABLE_NUMBER);
                      return;
                    }
                    setStartNumber(clampTableNumber(Number(digits)));
                  }}
                  keyboardType="number-pad"
                  placeholder={String(nextTableNumber)}
                  placeholderTextColor="rgba(17,24,39,0.35)"
                  style={styles.customSeatsInput}
                  {...(Platform.OS === 'web'
                    ? ({ inputMode: 'numeric', pattern: '[0-9]*' } as any)
                    : null)}
                />
              </View>
              <Stepper
                value={tableStart}
                onChange={(v) => {
                  setStartNumberTouched(true);
                  setStartNumber(v);
                }}
                min={MIN_TABLE_NUMBER}
                max={MAX_TABLE_NUMBER}
              />
              <Text style={styles.numberingPreview}>{numberingPreview}</Text>

              {quantity > 1 ? (
                <>
                  <SectionTitle title="כיוון מספור" />
                  <View style={styles.segmentRow}>
                    <SegmentButton
                      label={orientation === 'column' ? '1 למעלה' : '1 בהתחלה'}
                      icon="row"
                      active={numberingAnchor === 'start'}
                      onPress={() => setNumberingAnchor('start')}
                    />
                    <SegmentButton
                      label={orientation === 'column' ? '1 למטה' : '1 בסוף'}
                      icon="column"
                      active={numberingAnchor === 'end'}
                      onPress={() => setNumberingAnchor('end')}
                    />
                  </View>
                </>
              ) : null}

              <SectionTitle title="כיוון סידור" />
              <View style={styles.segmentRow}>
                <SegmentButton label="שורה" icon="row" active={orientation === 'row'} onPress={() => setOrientation('row')} />
                <SegmentButton label="טור" icon="column" active={orientation === 'column'} onPress={() => setOrientation('column')} />
              </View>

              <PrimaryButton
                label="הוסף למפה"
                onPress={() => {
                  onAddTable(config);
                  setStartNumberTouched(false);
                }}
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
            onPress={() => onSave({ cols: colsDraft, rows: rowsDraft })}
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
    width: 292,
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
    width: 272,
    padding: 10,
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
    gap: 6,
    marginTop: 10,
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.06)',
    backgroundColor: 'rgba(248,250,255,0.90)',
  },
  tabBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 10,
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
  tabText: {
    fontWeight: '900',
    fontSize: 11,
    color: 'rgba(17,24,39,0.70)',
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null),
  },
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

  presetRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  presetBtn: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    borderColor: 'rgba(43,140,238,0.45)',
    backgroundColor: 'rgba(43,140,238,0.10)',
  },
  presetText: { fontWeight: '900', fontSize: 13, color: 'rgba(17,24,39,0.70)' },
  presetTextActive: { color: '#2b8cee' },

  customSeatsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  customSeatsLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.60)',
  },
  customSeatsInput: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    fontWeight: '900',
    fontSize: 16,
    color: '#102A56',
    textAlign: 'center',
  },
  numberingPreview: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#2b8cee',
    textAlign: 'right',
  },
  editCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.16)',
    backgroundColor: 'rgba(247,250,255,0.96)',
    padding: 12,
    gap: 8,
  },
  editHint: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    color: 'rgba(17,24,39,0.58)',
    textAlign: 'right',
  },
  editOccupied: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'right',
  },
  editWarn: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    textAlign: 'right',
  },

  rowBetween: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.60)' },
  value: { fontSize: 14, fontWeight: '900', color: '#102A56' },

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
