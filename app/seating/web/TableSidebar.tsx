import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
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
  variant?: 'side' | 'top';
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
  variant = 'side',
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

  // Modern horizontal layout for 'top' variant
  if (variant === 'top') {
    return (
      <View style={styles.topBar}>
        {/* Left side: Title + Tabs */}
        <View style={styles.topLeft}>
          <Text style={styles.topTitle}>מפת הושבה</Text>
          <View style={styles.topTabs}>
            <ModernTab 
              label="שולחנות" 
              icon="grid-outline"
              active={tab === 'tables'} 
              onPress={() => setTab('tables')} 
            />
            <ModernTab 
              label="אזורים" 
              icon="apps-outline"
              active={tab === 'zones'} 
              onPress={() => setTab('zones')} 
            />
            <ModernTab 
              label="טקסט" 
              icon="text-outline"
              active={tab === 'text'} 
              onPress={() => setTab('text')} 
            />
            <ModernTab 
              label="מפה" 
              icon="map-outline"
              active={tab === 'map'} 
              onPress={() => setTab('map')} 
            />
          </View>
        </View>

        {/* Center: Controls based on active tab */}
        <View style={styles.topCenter}>
          {tab === 'tables' && (
            <View style={styles.compactControls}>
              <View style={styles.miniTypeRow}>
                <MiniTypeButton
                  label="רגיל"
                  active={tableType === 'regular'}
                  color={colors.primary}
                  onPress={() => setTableType('regular')}
                />
                <MiniTypeButton
                  label="רזרבה"
                  active={tableType === 'reserve'}
                  color={colors.yaleBlue}
                  onPress={() => setTableType('reserve')}
                />
                <MiniTypeButton
                  label="אביר"
                  active={tableType === 'knight'}
                  color={colors.gold}
                  onPress={() => setTableType('knight')}
                />
              </View>
              <View style={styles.miniDivider} />
              <MiniStepper value={quantity} onChange={setQuantity} min={1} max={20} label="כמות" />
              <View style={styles.miniDivider} />
              <View style={styles.orientationToggle}>
                <Pressable 
                  onPress={() => setOrientation('row')}
                  style={[styles.orientBtn, orientation === 'row' && styles.orientBtnActive]}
                >
                  <Ionicons name="remove" size={14} color={orientation === 'row' ? colors.primary : colors.gray[500]} />
                </Pressable>
                <Pressable 
                  onPress={() => setOrientation('column')}
                  style={[styles.orientBtn, orientation === 'column' && styles.orientBtnActive]}
                >
                  <Ionicons name="reorder-three" size={14} color={orientation === 'column' ? colors.primary : colors.gray[500]} style={{ transform: [{ rotate: '90deg' }] }} />
                </Pressable>
              </View>
            </View>
          )}

          {tab === 'zones' && (
            <View style={styles.compactControls}>
              <TextInput
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="שם אזור"
                placeholderTextColor="rgba(15,23,42,0.38)"
                style={styles.miniInput}
              />
              <View style={styles.miniDivider} />
              <MiniStepper value={zoneW} onChange={setZoneW} min={2} max={30} label="רוחב" />
              <View style={styles.miniDivider} />
              <MiniStepper value={zoneH} onChange={setZoneH} min={2} max={20} label="גובה" />
            </View>
          )}

          {tab === 'text' && (
            <View style={styles.compactControls}>
              <TextInput
                value={labelText}
                onChangeText={setLabelText}
                placeholder="הזן טקסט"
                placeholderTextColor="rgba(15,23,42,0.38)"
                style={styles.miniInput}
              />
            </View>
          )}

          {tab === 'map' && (
            <View style={styles.compactControls}>
              <MiniStepper value={colsDraft} onChange={setColsDraft} min={20} max={300} label="רוחב" />
              <View style={styles.miniDivider} />
              <MiniStepper value={rowsDraft} onChange={setRowsDraft} min={20} max={300} label="גובה" />
              <View style={styles.miniDivider} />
              <Pressable
                onPress={() => onSetGrid(colsDraft, rowsDraft)}
                style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="checkmark" size={16} color={colors.white} />
                <Text style={styles.applyBtnText}>החל</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Right side: Action buttons */}
        <View style={styles.topRight}>
          {tab === 'tables' && (
            <Pressable
              onPress={() => onAddTable(config)}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.92 }]}
            >
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.addBtnText}>הוסף</Text>
            </Pressable>
          )}
          {tab === 'zones' && (
            <Pressable
              onPress={() => onAddZone(zoneName.trim(), zoneW, zoneH)}
              disabled={!zoneName.trim()}
              style={({ pressed }) => [
                styles.addBtn, 
                !zoneName.trim() && { opacity: 0.5 },
                pressed && zoneName.trim() && { opacity: 0.92 }
              ]}
            >
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.addBtnText}>הוסף</Text>
            </Pressable>
          )}
          {tab === 'text' && (
            <Pressable
              onPress={() => onAddLabel(labelText.trim())}
              disabled={!labelText.trim()}
              style={({ pressed }) => [
                styles.addBtn, 
                !labelText.trim() && { opacity: 0.5 },
                pressed && labelText.trim() && { opacity: 0.92 }
              ]}
            >
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.addBtnText}>הוסף</Text>
            </Pressable>
          )}
          
          {hasSelection && (
            <Pressable
              onPress={onDeleteSelected}
              style={({ pressed }) => [styles.deleteSmallBtn, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="trash-outline" size={16} color="#B91C1C" />
            </Pressable>
          )}

          <Pressable
            onPress={onSave}
            disabled={!!saving}
            style={({ pressed }) => [
              styles.saveSmallBtn,
              pressed && { opacity: 0.92 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="save-outline" size={16} color={colors.white} />
            <Text style={styles.saveSmallBtnText}>{saving ? 'שומר...' : 'שמור'}</Text>
          </Pressable>

          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="close" size={20} color="rgba(15,23,42,0.75)" />
          </Pressable>
        </View>
      </View>
    );
  }

  // Original sidebar layout for non-web
  return (
    <View style={[styles.sidebar, variant === 'top' && styles.sidebarTop]}>
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
            <Ionicons name="chevron-forward" size={22} color="rgba(15,23,42,0.75)" />
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
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
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
                color={colors.primary}
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
                color={colors.yaleBlue}
                onPress={() => setTableType('reserve')}
              />
              <TypeButton
                label="אביר"
                // Ionicons doesn't reliably include a rectangle-outline glyph across builds,
                // so we render a simple rectangle ourselves.
                icon={(c) => <View style={[styles.iconRect, { borderColor: c }]} />}
                active={tableType === 'knight'}
                color={colors.gold}
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
                placeholderTextColor="rgba(15,23,42,0.38)"
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
                placeholderTextColor="rgba(15,23,42,0.38)"
              style={styles.input}
            />
            <PrimaryButton
              label="הוסף טקסט למפה"
              onPress={() => onAddLabel(labelText.trim())}
              disabled={!labelText.trim()}
            />
          </>
        ) : null}
      </ScrollView>

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
          <Ionicons name="save-outline" size={18} color={colors.white} />
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

// Modern components for top variant
function ModernTab({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modernTab,
        active && styles.modernTabActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon as any} size={16} color={active ? colors.primary : colors.gray[500]} />
      <Text style={[styles.modernTabText, active && styles.modernTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MiniTypeButton({ label, active, color, onPress }: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniTypeBtn,
        active && { backgroundColor: color + '15', borderColor: color },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={[styles.miniTypeText, active && { color }]}>{label}</Text>
    </Pressable>
  );
}

function MiniStepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <View style={styles.miniStepperWrap}>
      <Text style={styles.miniStepperLabel}>{label}</Text>
      <View style={styles.miniStepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          style={({ pressed }) => [styles.miniStepBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="remove" size={14} color={colors.gray[600]} />
        </Pressable>
        <Text style={styles.miniStepValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          style={({ pressed }) => [styles.miniStepBtn, styles.miniStepBtnPlus, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="add" size={14} color={colors.white} />
        </Pressable>
      </View>
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
  const iconColor = active ? color : 'rgba(15,23,42,0.62)';
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
  const c = active ? colors.primary : 'rgba(15,23,42,0.28)';
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
        <Ionicons name="remove" size={18} color="rgba(15,23,42,0.75)" />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [styles.stepBtn, styles.stepBtnPrimary, pressed && { opacity: 0.92 }]}
      >
        <Ionicons name="add" size={18} color={colors.white} />
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
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderRightColor: 'rgba(15,23,42,0.06)',
    padding: 14,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
  },
  sidebarTop: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.08)',
    borderRadius: 16,
    padding: 12,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    // Keep the panel compact so the map remains visible.
    ...(Platform.OS === 'web' ? ({ maxHeight: 300 } as any) : null),
  },
  
  // Modern top bar styles
  topBar: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'web' ? ({ 
      backdropFilter: 'blur(10px)',
      borderWidth: 1,
      borderColor: 'rgba(15,23,42,0.06)',
    } as any) : null),
  },
  topLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 20,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  topTabs: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderRadius: 14,
    padding: 4,
  },
  modernTab: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    ...(Platform.OS === 'web' ? ({ 
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    } as any) : null),
  },
  modernTabActive: {
    backgroundColor: colors.white,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  modernTabText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[500],
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  modernTabTextActive: {
    color: colors.primary,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderRadius: 14,
    padding: 8,
    paddingHorizontal: 14,
  },
  miniTypeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  miniTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: colors.white,
    ...(Platform.OS === 'web' ? ({ 
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    } as any) : null),
  },
  miniTypeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[600],
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  miniDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(15,23,42,0.10)',
  },
  miniStepperWrap: {
    alignItems: 'center',
    gap: 4,
  },
  miniStepperLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.gray[500],
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  miniStepperRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  miniStepBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  miniStepBtnPlus: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.20)',
  },
  miniStepValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    minWidth: 28,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  orientationToggle: {
    flexDirection: 'row-reverse',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 3,
  },
  orientBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  orientBtnActive: {
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  miniInput: {
    height: 34,
    minWidth: 140,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.white,
    fontWeight: '800',
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ 
      fontFamily: 'Rubik',
      outline: 'none',
    } as any) : null),
  },
  applyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  applyBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.white,
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  topRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.white,
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  saveSmallBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  saveSmallBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },
  deleteSmallBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
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
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'center', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

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
    borderBottomColor: 'rgba(15,23,42,0.08)',
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 3,
    marginBottom: -1, // sit on top of the row divider line
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
  },
  tabBtnInactive: {
    borderBottomColor: 'transparent',
  },
  tabText: { fontWeight: '900', fontSize: 12, color: colors.gray[700], ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  tabTextActive: { color: colors.primary },

  body: { flex: 1, marginTop: 12 },
  bodyContent: { paddingBottom: 10, gap: 10 },
  sectionTitle: { marginTop: 6, fontSize: 12, fontWeight: '900', color: colors.text, textAlign: 'right', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  mapSizeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    padding: 10,
  },

  typeRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 8 },
  typeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
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
  typeText: { fontWeight: '900', color: colors.gray[700], ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  rowBetween: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800', color: colors.gray[600], ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  value: { fontSize: 14, fontWeight: '900', color: colors.text, ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  seatsStat: { marginTop: 10, alignItems: 'flex-start' },
  seatsLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'left', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  seatsValue: { marginTop: 6, fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'left', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  stepper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    padding: 10,
    marginTop: 6,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: 'rgba(6,23,62,0.24)',
  },
  stepValue: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.4, ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  segmentRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(15,23,42,0.03)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  segmentBtnActive: {
    borderColor: 'rgba(6,23,62,0.22)',
    backgroundColor: 'rgba(6,23,62,0.06)',
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
  segmentText: { fontWeight: '900', color: colors.gray[700], ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  segmentTextActive: { color: colors.primary },

  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.white,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null),
  },

  primaryBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  primaryBtnText: { fontWeight: '900', color: colors.white, ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },

  footer: { marginTop: 14, gap: 10 },
  saveBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  saveBtnText: { color: colors.white, fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
  deleteBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(244,63,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: { color: '#B91C1C', fontWeight: '900', ...(Platform.OS === 'web' ? ({ fontFamily: 'Rubik' } as any) : null) },
});

