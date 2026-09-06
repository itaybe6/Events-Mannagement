import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { AppKeyboardAwareScrollView } from "@/components/AppKeyboardAware";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import BackSwipe from "@/components/BackSwipe";
import AppHeader from "@/components/AppHeader";
import { CheckInStatusFilter } from "@/features/guests/CheckInStatusFilter";
import { guestArrivedPeople, guestInvitedPeople, useGuestCheckInModel } from "@/features/guests/useGuestCheckInModel";
import { TableNumberFilter } from "@/features/guests/TableNumberFilter";
import { useSeatingMapModel } from "@/features/seating/useSeatingMapModel";
import { eventService } from "@/lib/services/eventService";
import { supabase } from "@/lib/supabase";
import { ALIGN_RIGHT, ROW_DIR, ROW_REVERSE_DIR } from "@/lib/rtl";
import type { Guest } from "@/types";

type Props = { hideTopBar?: boolean };

const SCROLL_TOP_THRESHOLD = 220;
const NO_TABLE_FILTER = "__no_table__";

function ScrollToTopFab({
  bottom,
  onPress,
}: {
  bottom: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="חזרה לראש הרשימה"
      style={[styles.scrollTopFab, { bottom }]}
    >
      <Ionicons name="chevron-up" size={24} color={colors.white} />
    </TouchableOpacity>
  );
}

function CheckInToggle({
  checked,
  disabled,
  saving,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.switchWrap,
        checked ? styles.switchWrapOn : null,
        disabled ? { opacity: 0.6 } : null,
        pressed ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[styles.switchTrack, checked ? styles.switchTrackOn : null]} />
      <View style={[styles.switchThumb, checked ? styles.switchThumbOn : null]}>
        {saving ? (
          <ActivityIndicator size={12} color={colors.primary} />
        ) : (
          <Ionicons
            name={checked ? "checkmark" : "close"}
            size={14}
            color={checked ? "#10B981" : "rgba(55,65,81,0.65)"}
          />
        )}
      </View>
    </Pressable>
  );
}

function MobileCheckInButton({
  checked,
  disabled,
  saving,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      style={styles.cActionBtnTouch}
    >
      {checked ? (
        <LinearGradient
          colors={["#56C568", "#43A047", "#2E7D32"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.cActionBtn, styles.cCheckBtnOn]}
        >
          {saving ? (
            <ActivityIndicator size={16} color={colors.white} />
          ) : (
            <Ionicons name="checkmark" size={22} color={colors.white} />
          )}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.cActionBtn,
            styles.cCheckBtnOff,
            disabled ? styles.cActionBtnDisabled : null,
          ]}
        >
          {saving ? (
            <ActivityIndicator size={16} color={colors.success} />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ArrivedCountControl({
  guest,
  arrivedCount,
  invitedCount,
  isSaving,
  onSetCount,
}: {
  guest: Guest;
  arrivedCount: number;
  invitedCount: number;
  isSaving: boolean;
  onSetCount: (guest: Guest, count: number) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(arrivedCount);

  const commitDraft = useCallback(() => {
    const raw = draft ?? String(arrivedCount);
    const parsed = Math.max(0, Math.min(99, Math.floor(Number(raw) || 0)));
    setDraft(null);
    if (parsed !== arrivedCount) {
      void onSetCount(guest, parsed);
    }
  }, [arrivedCount, draft, guest, onSetCount]);

  const handleStep = useCallback(
    (next: number) => {
      setDraft(null);
      void onSetCount(guest, Math.max(0, Math.min(99, next)));
    },
    [guest, onSetCount]
  );

  return (
    <View style={styles.cStepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`הפחת כמות שהגיעה עבור ${guest.name}`}
        onPress={() => handleStep(arrivedCount - 1)}
        disabled={isSaving || arrivedCount <= 0}
        hitSlop={8}
        style={({ pressed }) => [
          styles.cStepBtn,
          (isSaving || arrivedCount <= 0) && styles.stepBtnDisabled,
          pressed ? { opacity: 0.85 } : null,
        ]}
      >
        <Ionicons name="remove" size={16} color={colors.primary} />
      </Pressable>

      <Pressable
        style={styles.cStepCountWrap}
        onPress={() => setDraft(String(arrivedCount))}
        accessibilityRole="button"
        accessibilityLabel={`ערוך כמות שהגיעה עבור ${guest.name}`}
      >
        {isSaving ? (
          <ActivityIndicator size={12} color={colors.primary} />
        ) : (
          <View style={styles.cStepCountInner}>
            <TextInput
              value={displayValue}
              onChangeText={(text) => setDraft(text.replace(/[^\d]/g, ""))}
              onFocus={() => setDraft(String(arrivedCount))}
              onBlur={commitDraft}
              onSubmitEditing={commitDraft}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              maxLength={2}
              editable={!isSaving}
              style={styles.cStepCountInput}
              textAlign="center"
              accessibilityLabel={`כמות שהגיעה עבור ${guest.name}`}
            />
            <Text style={styles.cStepCountDim}>{`/${invitedCount}`}</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`הגדל כמות שהגיעה עבור ${guest.name}`}
        onPress={() => handleStep(arrivedCount + 1)}
        disabled={isSaving}
        hitSlop={8}
        style={({ pressed }) => [
          styles.cStepBtn,
          isSaving && styles.stepBtnDisabled,
          pressed ? { opacity: 0.85 } : null,
        ]}
      >
        <Ionicons name="add" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export default function EmployeeGuestCheckInScreen({ hideTopBar }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { eventId, returnTo } = useLocalSearchParams<{ eventId?: string; returnTo?: string }>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const resolvedEventId = useMemo(() => String(eventId || "").trim(), [eventId]);
  const isAdminContext = useMemo(() => {
    const arr = segments as unknown as any[];
    return Boolean(arr?.find((s) => String(s) === "(admin)"));
  }, [segments]);
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? isAdminContext
          ? `/(admin)/admin-event-details?id=${resolvedEventId}`
          : `/(employee)/employee-event-details?id=${resolvedEventId}`
        : isAdminContext
        ? "/(admin)/admin-events"
        : "/(employee)/employee-events",
    [isAdminContext, resolvedEventId]
  );

  const backHref = useMemo(() => {
    const raw = String(returnTo || "").trim();
    return raw || fallbackToDetails;
  }, [fallbackToDetails, returnTo]);

  const handleBack = useCallback(() => {
    router.replace(backHref as any);
  }, [backHref, router]);

  /**
   * Live map, with this check-in screen as its "back" target so an usher can
   * bounce between counting heads and marking arrivals.
   */
  const liveMapHref = useMemo(() => {
    if (!resolvedEventId) return null;

    const liveBase = isAdminContext ? "/(admin)/live-seating" : "/(employee)/employee-live-seating";
    const checkInBase = isAdminContext
      ? "/(admin)/admin-guest-checkin"
      : "/(employee)/employee-guest-checkin";
    const rawReturn = String(returnTo || "").trim();
    const backToCheckIn = `${checkInBase}?eventId=${resolvedEventId}${
      rawReturn ? `&returnTo=${encodeURIComponent(rawReturn)}` : ""
    }`;

    return `${liveBase}?eventId=${resolvedEventId}&returnTo=${encodeURIComponent(backToCheckIn)}`;
  }, [isAdminContext, resolvedEventId, returnTo]);

  const openLiveMap = useCallback(() => {
    if (liveMapHref) router.push(liveMapHref as any);
  }, [liveMapHref, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const {
    loading,
    searching,
    listHint,
    guests,
    categories,
    filteredGuests,
    query,
    setQuery,
    filter,
    setFilter,
    collapsed,
    toggleCollapsed,
    counts,
    sections,
    refresh: refreshGuests,
    toggleCheckIn,
    savingId,
    setCheckedInCount,
    savingCountId,
    addWalkInGuest,
    addingWalkIn,
  } = useGuestCheckInModel({
    eventId: resolvedEventId ? resolvedEventId : null,
    errorTitle: "שגיאה",
    errorMessage: "לא ניתן לטעון את רשימת האורחים",
  });

  const {
    loading: mapLoading,
    tables: mapTables,
    annotations: mapAnnotations,
    refresh: refreshMap,
  } = useSeatingMapModel(resolvedEventId ? resolvedEventId : null, {
    // רשימת האורחים כבר נטענת דרך useGuestCheckInModel — אין צורך להוריד אותה שוב עבור המפה
    includeGuests: false,
  });

  // תיבת החיפוש לא-מבוקרת בכוונה: value={query} גרם לרינדור-מחדש של כל המסך
  // (כולל מאות כרטיסי אורחים) על כל אות שהוקלדה. עדכון ה-state נדחה מעט,
  // כך שההקלדה עצמה נשארת חלקה.
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeQuery = useCallback(
    (text: string) => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = setTimeout(() => setQuery(text), 120);
    },
    [setQuery]
  );
  useEffect(() => {
    return () => {
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    void refreshGuests();
    void refreshMap();
  }, [refreshGuests, refreshMap]);

  const isTablet = useMemo(() => {
    // iPad portrait starts at 768dp width. Keep UI tablet-only from that breakpoint.
    return (Number(windowWidth) || 0) >= 768;
  }, [windowWidth]);
  const isAdminStyledMobile = isAdminContext && Boolean(hideTopBar) && !isTablet;
  const topContentInset = Math.max(30, (insets.top || 0) + 14);

  const guestsPaneWidth = useMemo(() => {
    if (!isTablet) return null;
    const w = Number(windowWidth) || 0;
    // Make the right pane slightly narrower on iPad to give the map more space.
    const target = Math.round(w * 0.48);
    return Math.max(380, Math.min(440, target));
  }, [isTablet, windowWidth]);

  const mapViewportWidth = useMemo(() => {
    if (!isTablet) return Number(windowWidth) || 0;
    const w = Number(windowWidth) || 0;
    const right = guestsPaneWidth ?? 420;
    // Roughly account for map pane + card padding.
    const approxGutters = 60;
    return Math.max(320, Math.round(w - right - approxGutters));
  }, [guestsPaneWidth, isTablet, windowWidth]);

  const phoneToTel = (raw: string) => {
    const cleaned = String(raw || "").replace(/[^\d+]/g, "").trim();
    return cleaned || null;
  };

  const callGuest = async (rawPhone: string, guestName?: string) => {
    const tel = phoneToTel(rawPhone);
    if (!tel) return;
    const url = `tel:${tel}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("שגיאה", "המכשיר לא תומך בחיוג");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.error("Call guest error:", e);
      Alert.alert("שגיאה", `לא ניתן לפתוח שיחה${guestName ? ` ל-${guestName}` : ""}`);
    }
  };

  // Keep content above the custom tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const bottomReserve = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 18;
  const contentBottomPadding = bottomReserve + (isAdminStyledMobile ? 42 : insets.bottom);
  const pendingPeopleCount = useMemo(
    () => Math.max(0, counts.total - counts.checkedIn),
    [counts.checkedIn, counts.total]
  );
  const statusFilterCounts = useMemo(
    () => ({
      all: counts.total,
      checkedIn: counts.checkedIn,
      pending: pendingPeopleCount,
    }),
    [counts.checkedIn, counts.total, pendingPeopleCount]
  );
  const listScrollRef = useRef<any>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const onListScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const next = e.nativeEvent.contentOffset.y > SCROLL_TOP_THRESHOLD;
    setShowScrollTop((prev) => (prev === next ? prev : next));
  }, []);

  const scrollListToTop = useCallback(() => {
    const node = listScrollRef.current;
    if (!node) return;
    if (typeof node.scrollToPosition === "function") {
      node.scrollToPosition(0, 0, true);
      return;
    }
    if (typeof node.scrollTo === "function") {
      node.scrollTo({ x: 0, y: 0, animated: true });
    }
  }, []);

  const [tableFilterId, setTableFilterId] = useState<string | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  const tableById = useMemo(() => {
    return new Map(mapTables.map((t) => [String(t.id), t]));
  }, [mapTables]);

  const activeTable = useMemo(() => {
    if (!activeTableId) return null;
    return tableById.get(activeTableId) ?? null;
  }, [activeTableId, tableById]);

  const arrivedPeopleByTableId = useMemo(() => {
    const m = new Map<string, number>();
    guests.forEach((g) => {
      const key = String(g.tableId ?? "").trim();
      if (!key) return;
      if (!g.checkedIn) return;
      const people = Number(g.numberOfPeople) || 1;
      const actual = g.checkedInCount === null || g.checkedInCount === undefined ? null : Number(g.checkedInCount);
      const n = actual !== null && Number.isFinite(actual) ? actual : people;
      m.set(key, (m.get(key) || 0) + Math.max(0, n));
    });
    return m;
  }, [guests]);

  const invitedPeopleByTableId = useMemo(() => {
    const m = new Map<string, number>();
    guests.forEach((g) => {
      const key = String(g.tableId ?? "").trim();
      if (!key) return;
      const people = Number(g.numberOfPeople) || 1;
      m.set(key, (m.get(key) || 0) + Math.max(1, people));
    });
    return m;
  }, [guests]);

  // Phone (mobile) view groups guests by table instead of by category.
  const tableSections = useMemo(() => {
    const filterTid = tableFilterId ? String(tableFilterId).trim() : null;
    const sourceGuests = !filterTid
      ? filteredGuests
      : filterTid === NO_TABLE_FILTER
        ? filteredGuests.filter((g) => !String(g.tableId ?? "").trim())
        : filteredGuests.filter((g) => String(g.tableId ?? "").trim() === filterTid);
    const groups = new Map<string, { key: string; name: string; sort: number; data: Guest[] }>();
    sourceGuests.forEach((g) => {
      const tid = String(g.tableId ?? "").trim();
      const t = tid ? tableById.get(tid) : null;
      let key = NO_TABLE_FILTER;
      let name = "ללא שולחן";
      let sort = 2_000_000;
      if (t) {
        const n = typeof t.number === "number" ? t.number : null;
        key = `t:${tid}`;
        name = n !== null ? `שולחן ${n}` : t.name ? `שולחן ${t.name}` : "שולחן";
        sort = n !== null ? n : 1_000_000;
      }
      const cur = groups.get(key) || { key, name, sort, data: [] as Guest[] };
      cur.data.push(g);
      groups.set(key, cur);
    });
    return Array.from(groups.values())
      .sort((a, b) => (a.sort !== b.sort ? a.sort - b.sort : a.name.localeCompare(b.name, "he")))
      .map((sec) => ({
        ...sec,
        checkedIn: sec.data.reduce((sum, g) => sum + guestArrivedPeople(g), 0),
        total: sec.data.reduce((sum, g) => sum + guestInvitedPeople(g), 0),
      }));
  }, [filteredGuests, tableById, tableFilterId]);

  const visibleSections = useMemo(() => {
    const tid = tableFilterId ? String(tableFilterId).trim() : null;
    if (!tid) return sections;
    return sections
      .map((sec) => {
        const data =
          tid === NO_TABLE_FILTER
            ? sec.data.filter((g) => !String(g.tableId ?? "").trim())
            : sec.data.filter((g) => String(g.tableId ?? "").trim() === tid);
        const checkedIn = data.reduce((sum, g) => sum + guestArrivedPeople(g), 0);
        const total = data.reduce((sum, g) => sum + guestInvitedPeople(g), 0);
        return { ...sec, data, checkedIn, total };
      })
      .filter((sec) => sec.total > 0);
  }, [sections, tableFilterId]);

  const tableFilterLabel = useMemo(() => {
    if (!tableFilterId) return null;
    if (tableFilterId === NO_TABLE_FILTER) return "ללא שולחן";
    const t = tableById.get(String(tableFilterId).trim());
    if (!t) return "שולחן";
    const n = typeof t.number === "number" ? t.number : null;
    return n !== null ? `שולחן ${n}` : t.name ? `שולחן ${t.name}` : "שולחן";
  }, [tableById, tableFilterId]);

  // רינדור הדרגתי עם תקרה: ציור כל מאות כרטיסי האורחים בתוך ScrollView הפך כל
  // הקלדה בחיפוש לרינדור-מחדש של כל הכרטיסים (שניות של קפיאה בטלפון). מציגים
  // מנה ראשונה מיד, ממשיכים ברקע עד תקרה, והשאר נחשפים בכפתור "הצג עוד".
  const INITIAL_RENDER_ROWS = 30;
  const RENDER_ROWS_PER_BATCH = 60;
  const AUTO_RENDER_ROW_CAP = 120;
  const SHOW_MORE_STEP = 200;
  const [rowRenderLimit, setRowRenderLimit] = useState(INITIAL_RENDER_ROWS);
  const [renderCap, setRenderCap] = useState(AUTO_RENDER_ROW_CAP);

  useEffect(() => {
    setRowRenderLimit(INITIAL_RENDER_ROWS);
    setRenderCap(AUTO_RENDER_ROW_CAP);
  }, [query, filter, tableFilterId]);

  const totalListRows = useMemo(() => {
    const secs = isTablet ? visibleSections : tableSections;
    return secs.reduce((sum, sec) => sum + sec.data.length, 0);
  }, [isTablet, visibleSections, tableSections]);

  useEffect(() => {
    const target = Math.min(totalListRows, renderCap);
    if (rowRenderLimit >= target) return;
    const t = setTimeout(() => {
      setRowRenderLimit((prev) => Math.min(prev + RENDER_ROWS_PER_BATCH, target));
    }, 32);
    return () => clearTimeout(t);
  }, [renderCap, rowRenderLimit, totalListRows]);

  const hiddenListRows = Math.max(0, totalListRows - Math.min(rowRenderLimit, renderCap, totalListRows));
  const showMoreRows = useCallback(() => {
    setRenderCap((prev) => prev + SHOW_MORE_STEP);
  }, []);

  const limitSectionRows = useCallback(
    <T extends { data: Guest[] }>(secs: T[], limit: number): T[] => {
      let used = 0;
      const out: T[] = [];
      for (const sec of secs) {
        if (used >= limit) break;
        const remaining = limit - used;
        if (sec.data.length <= remaining) {
          out.push(sec);
          used += sec.data.length;
        } else {
          out.push({ ...sec, data: sec.data.slice(0, remaining) });
          used = limit;
        }
      }
      return out;
    },
    []
  );

  const renderedSections = useMemo(
    () => (rowRenderLimit >= totalListRows ? visibleSections : limitSectionRows(visibleSections, rowRenderLimit)),
    [limitSectionRows, rowRenderLimit, totalListRows, visibleSections]
  );

  const renderedTableSections = useMemo(
    () => (rowRenderLimit >= totalListRows ? tableSections : limitSectionRows(tableSections, rowRenderLimit)),
    [limitSectionRows, rowRenderLimit, tableSections, totalListRows]
  );

  const openTableDetails = useCallback((tableId: string) => {
    setActiveTableId(tableId);
    setTableModalOpen(true);
  }, []);

  const closeTableDetails = useCallback(() => {
    setTableModalOpen(false);
    setActiveTableId(null);
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addPeople, setAddPeople] = useState(1);
  const [addTableQuery, setAddTableQuery] = useState("");
  const [addTableId, setAddTableId] = useState<string | null>(null);
  const [addTablePickerExpanded, setAddTablePickerExpanded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const tableOptions = useMemo(() => {
    const sorted = [...mapTables].sort((a, b) => {
      const an = typeof a.number === "number" ? a.number : Number.POSITIVE_INFINITY;
      const bn = typeof b.number === "number" ? b.number : Number.POSITIVE_INFINITY;
      if (an !== bn) return an - bn;
      return String(a.name || "").localeCompare(String(b.name || ""), "he");
    });
    return sorted.map((t) => {
      const id = String(t.id);
      const n = typeof t.number === "number" ? t.number : null;
      return {
        id,
        label: n !== null ? `שולחן ${n}` : t.name ? `שולחן ${t.name}` : "שולחן",
        capacity: Number(t.capacity) || 0,
        seated: arrivedPeopleByTableId.get(id) || 0,
        isReserve: t.shape === "reserve",
      };
    });
  }, [arrivedPeopleByTableId, mapTables]);

  const tableFilterOptions = useMemo(
    () => [
      ...tableOptions.map((opt) => ({
        id: opt.id,
        label: opt.label,
        meta: opt.capacity > 0 ? `${opt.seated}/${opt.capacity}` : undefined,
      })),
      { id: NO_TABLE_FILTER, label: "ללא שולחן" },
    ],
    [tableOptions]
  );

  const addTableOptions = useMemo(() => {
    const q = addTableQuery.trim().toLowerCase();
    if (!q) return tableOptions;
    return tableOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [addTableQuery, tableOptions]);

  const addSelectedTableOption = useMemo(() => {
    if (!addTableId) return null;
    return tableOptions.find((opt) => opt.id === addTableId) ?? null;
  }, [addTableId, tableOptions]);

  const openAddSheet = useCallback(() => {
    setAddName("");
    setAddPhone("");
    setAddPeople(1);
    setAddTableQuery("");
    setAddError(null);
    const focused =
      tableFilterId && tableFilterId !== NO_TABLE_FILTER ? String(tableFilterId).trim() || null : null;
    setAddTableId(focused);
    setAddTablePickerExpanded(!focused);
    setAddOpen(true);
  }, [tableFilterId]);

  const handleExportArrivedExcel = useCallback(async () => {
    if (exportingExcel) return;
    const arrived = guests.filter((g) => Boolean(g.checkedIn));
    if (!arrived.length) {
      Alert.alert("אין אורחים לייצוא", "עדיין אין מוזמנים שסומנו כהגיעו לאולם.");
      return;
    }

    setExportingExcel(true);
    try {
      let eventTitle = "אירוע";
      if (resolvedEventId) {
        try {
          const ev = await eventService.getEventLite(resolvedEventId);
          if (ev?.title) eventTitle = String(ev.title).trim() || eventTitle;
        } catch {
          // Filename can fall back to a generic title.
        }
      }

      const tables = mapTables.map((t) => ({
        id: String(t.id),
        number: typeof t.number === "number" ? t.number : null,
        name: t.name,
        capacity: t.capacity,
      }));

      if (Platform.OS === "web") {
        const { exportCheckInGuestsToExcel } = await import("@/lib/exportCheckInGuestsExcel");
        exportCheckInGuestsToExcel(guests, { eventTitle, categories, tables });
        return;
      }

      const { buildCheckInGuestsCsv } = await import("@/lib/exportCheckInGuestsExcel");
      const { csv, fileName } = buildCheckInGuestsCsv(guests, { eventTitle, categories, tables });
      try {
        await Share.share({ title: fileName, message: csv });
      } catch (shareError) {
        const msg = String((shareError as any)?.message ?? "");
        if (/cancel|dismiss/i.test(msg)) return;
        throw shareError;
      }
    } catch (e) {
      console.error("Export check-in Excel error:", e);
      const message =
        e instanceof Error && e.message === "אין אורחים שהגיעו לייצוא"
          ? "עדיין אין מוזמנים שסומנו כהגיעו לאולם."
          : "אירעה תקלה בייצוא לאקסל. נסו שוב.";
      Alert.alert("שגיאה", message);
    } finally {
      setExportingExcel(false);
    }
  }, [categories, exportingExcel, guests, mapTables, resolvedEventId]);

  const closeAddSheet = useCallback(() => {
    setAddOpen(false);
    setAddError(null);
    setAddTableQuery("");
    setAddTablePickerExpanded(false);
  }, []);

  const confirmAddGuest = useCallback(async () => {
    setAddError(null);
    const result = await addWalkInGuest({
      name: addName,
      phone: addPhone,
      numberOfPeople: addPeople,
      tableId: addTableId,
    });

    if (!result.ok) {
      setAddError(result.error);
      return;
    }

    // Make sure the freshly added guest is visible in the list.
    setFilter("all");
    closeAddSheet();
  }, [addName, addPeople, addPhone, addTableId, addWalkInGuest, closeAddSheet, setFilter]);

  const hasMapData = mapTables.length > 0 || mapAnnotations.length > 0;

  const MAP_ZOOM_MIN = 0.5;
  const MAP_ZOOM_MAX = 3;
  const MAP_ZOOM_STEP = 1.2;

  const zoomInMap = useCallback(() => {
    setMapZoom((z) => Math.min(MAP_ZOOM_MAX, Number((z * MAP_ZOOM_STEP).toFixed(3))));
  }, []);

  const zoomOutMap = useCallback(() => {
    setMapZoom((z) => Math.max(MAP_ZOOM_MIN, Number((z / MAP_ZOOM_STEP).toFixed(3))));
  }, []);

  const resetMapZoom = useCallback(() => {
    setMapZoom(1);
  }, []);

  const renderNativeMapCanvas = useCallback(
    (opts?: { viewportWidth?: number; minCanvasHeight?: number; scrollStyle?: object }) => {
      if (!hasMapData) return null;

      const { width: screenW, height: screenH } = Dimensions.get("window");
      const minX =
        mapTables.length > 0
          ? Math.min(...mapTables.map((t) => (typeof t.x === "number" ? t.x : 0)))
          : 0;
      const maxX =
        mapTables.length > 0
          ? Math.max(...mapTables.map((t) => (typeof t.x === "number" ? t.x : screenW)))
          : screenW;
      const minY =
        mapTables.length > 0
          ? Math.min(...mapTables.map((t) => (typeof t.y === "number" ? t.y : 0)))
          : 0;
      const maxY =
        mapTables.length > 0
          ? Math.max(...mapTables.map((t) => (typeof t.y === "number" ? t.y : screenH)))
          : screenH;

      const padding = 120;
      const viewportWidth = opts?.viewportWidth ?? mapViewportWidth;
      const minCanvasHeight = opts?.minCanvasHeight ?? Math.round(windowHeight * 0.78);
      const canvasWidth = Math.max(viewportWidth, maxX - minX + padding * 2);
      const canvasHeight = Math.max(minCanvasHeight, maxY - minY + padding * 2, 900);

      return (
        <ScrollView
          style={[styles.canvasScroll, opts?.scrollStyle]}
          contentContainerStyle={{ width: canvasWidth * mapZoom, height: canvasHeight * mapZoom }}
          maximumZoomScale={3}
          minimumZoomScale={0.5}
          bounces={false}
          bouncesZoom={false}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.canvas,
              {
                width: canvasWidth,
                height: canvasHeight,
                transform: [{ scale: mapZoom }],
              },
            ]}
          >
            {[...Array(Math.ceil(canvasHeight / 60))].map((_, i) => (
              <View key={`h-${i}`} style={[styles.gridLine, { top: i * 60 }]} />
            ))}
            {[...Array(Math.ceil(canvasWidth / 90))].map((_, i) => (
              <View key={`v-${i}`} style={[styles.gridLineV, { left: i * 90 }]} />
            ))}

            {mapTables.map((t) => {
              const id = String(t.id);
              const x = (typeof t.x === "number" ? t.x : 40) - minX + padding;
              const y = (typeof t.y === "number" ? t.y : 60) - minY + padding;
              const cap = Number(t.capacity) || 0;
              const arrived = arrivedPeopleByTableId.get(id) || 0;
              const invited = invitedPeopleByTableId.get(id) || 0;
              const isReserve = t.shape === "reserve";
              const isFull = !isReserve && cap > 0 && arrived >= cap;
              const selected = Boolean(tableFilterId) && String(tableFilterId) === id;

              return (
                <TouchableOpacity
                  key={id}
                  style={[
                    styles.table,
                    t.shape === "rectangle" ? styles.tableRect : styles.tableSquare,
                    isFull && styles.tableFullStyle,
                    isReserve && styles.reserveTableStyle,
                    selected && styles.tableSelectedStyle,
                    { left: x, top: y },
                  ]}
                  activeOpacity={0.9}
                  onPress={() => setTableFilterId((prev) => (prev === id ? null : id))}
                  onLongPress={() => openTableDetails(id)}
                  accessibilityRole="button"
                  accessibilityLabel={`שולחן ${t.number ?? ""}`}
                >
                  <Text
                    style={[
                      styles.tableNumber,
                      isFull && styles.tableFullText,
                      isReserve && styles.reserveTableText,
                      selected && styles.tableSelectedText,
                    ]}
                  >
                    {t.number ?? "?"}
                  </Text>
                  <Text
                    style={[
                      styles.tableCap,
                      isFull && styles.tableFullCapText,
                      isReserve && styles.reserveTableCapText,
                      selected && styles.tableSelectedCapText,
                    ]}
                  >
                    {cap > 0 ? `${arrived} / ${cap}` : `${arrived}${invited ? ` / ${invited}` : ""}`}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {mapAnnotations.map((a, idx) => (
              <View
                key={String(a.id || idx)}
                style={[
                  styles.textArea,
                  {
                    left: (typeof a.x === "number" ? a.x : 200) - minX + padding,
                    top: (typeof a.y === "number" ? a.y : 200 + idx * 40) - minY + padding,
                  },
                ]}
              >
                <Text style={styles.textAreaText}>{String(a.text || "").trim()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      );
    },
    [
      arrivedPeopleByTableId,
      hasMapData,
      invitedPeopleByTableId,
      mapAnnotations,
      mapTables,
      mapViewportWidth,
      mapZoom,
      openTableDetails,
      tableFilterId,
      windowHeight,
    ]
  );

  const guestsForActiveTable = useMemo(() => {
    if (!activeTableId) return [];
    const id = String(activeTableId).trim();
    return guests.filter((g) => String(g.tableId ?? "").trim() === id);
  }, [activeTableId, guests]);

  const onRefreshAll = useCallback(() => {
    void refreshGuests();
    void refreshMap();
  }, [refreshGuests, refreshMap]);

  if (!resolvedEventId) {
    const listHref = isAdminContext ? "/(admin)/admin-events" : "/(employee)/employee-events";
    return (
      <BackSwipe fallbackHref={listHref} onBack={handleBack}>
        <Stack.Screen
          options={isAdminStyledMobile ? { headerShown: false } : { header: () => <AppHeader canGoBack onPressBack={handleBack} /> }}
        />
        <View style={styles.screen}>
          {isAdminStyledMobile ? (
            <>
              <LinearGradient colors={["#F7FAFF", "#E8F1FF", "#F2E0BA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bg} />
              <LinearGradient
                colors={["rgba(255,255,255,0.68)", "rgba(255,255,255,0)"]}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.75, y: 0.55 }}
                style={styles.bgHighlight}
              />
              <LinearGradient
                colors={["rgba(232,196,122,0.58)", "rgba(244,224,186,0.22)", "rgba(244,224,186,0)"]}
                start={{ x: 1, y: 0.95 }}
                end={{ x: 0.18, y: 0.22 }}
                style={styles.bgWarmGlow}
              />
            </>
          ) : null}
          <SafeAreaView style={[styles.center, isAdminStyledMobile ? styles.centerTransparent : null, { paddingTop: isAdminStyledMobile ? 0 : insets.top, paddingHorizontal: 20 }]}>
          <Text style={styles.errorTitle}>חסר מזהה אירוע</Text>
          <TouchableOpacity
            onPress={() => router.replace(listHref as any)}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
          >
            <Text style={styles.backBtnText}>חזרה</Text>
          </TouchableOpacity>
          </SafeAreaView>
        </View>
      </BackSwipe>
    );
  }

  return (
    <BackSwipe fallbackHref={backHref} onBack={handleBack}>
      <Stack.Screen
        options={isAdminStyledMobile ? { headerShown: false } : { header: () => <AppHeader canGoBack onPressBack={handleBack} /> }}
      />
      <View style={styles.screen}>
        {isAdminStyledMobile ? (
          <>
            <LinearGradient colors={["#F7FAFF", "#E8F1FF", "#F2E0BA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bg} />
            <LinearGradient
              colors={["rgba(255,255,255,0.68)", "rgba(255,255,255,0)"]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.75, y: 0.55 }}
              style={styles.bgHighlight}
            />
            <LinearGradient
              colors={["rgba(232,196,122,0.58)", "rgba(244,224,186,0.22)", "rgba(244,224,186,0)"]}
              start={{ x: 1, y: 0.95 }}
              end={{ x: 0.18, y: 0.22 }}
              style={styles.bgWarmGlow}
            />
            <View style={[styles.topSpacer, { paddingTop: topContentInset }]}>
              <View style={styles.topRow}>
                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.backButton}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                >
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>צ׳ק-אין אורחים</Text>
                <TouchableOpacity
                  onPress={() => void handleExportArrivedExcel()}
                  style={styles.backButton}
                  activeOpacity={0.86}
                  disabled={exportingExcel}
                  accessibilityRole="button"
                  accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
                >
                  {exportingExcel ? (
                    <ActivityIndicator size={16} color={colors.primary} />
                  ) : (
                    <Ionicons name="download-outline" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openLiveMap}
                  style={styles.liveMapBtn}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityLabel="מפת לייב באירוע"
                >
                  <View style={styles.liveMapDot} />
                  <Text style={styles.liveMapBtnText}>מפת לייב</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}
      <View style={[styles.screen, isAdminStyledMobile ? styles.screenTransparent : null, { paddingTop: isAdminStyledMobile ? 0 : insets.top }]}>
        {!hideTopBar && !isAdminStyledMobile ? (
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.topIconBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </TouchableOpacity>

            <View style={styles.topCenter}>
              <Text style={styles.topTitle} numberOfLines={1}>
                צ׳ק-אין אורחים
              </Text>
              <Text style={styles.topSubtitle} numberOfLines={1}>
                {`${counts.checkedIn}/${counts.total} מוזמנים באולם`}
              </Text>
            </View>

            <View style={styles.topActions}>
              <TouchableOpacity
                onPress={() => void handleExportArrivedExcel()}
                style={styles.topIconBtn}
                activeOpacity={0.85}
                disabled={exportingExcel}
                accessibilityRole="button"
                accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
              >
                {exportingExcel ? (
                  <ActivityIndicator size={18} color={colors.primary} />
                ) : (
                  <Ionicons name="download-outline" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={openLiveMap}
                style={styles.topIconBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="מפת לייב באירוע"
              >
                <Ionicons name="pulse" size={20} color="#DC2626" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onRefreshAll}
                style={styles.topIconBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="רענון"
              >
                <Ionicons name="refresh" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {isTablet ? (
          <View style={styles.tabletBody}>
            {/* Guests */}
            <View
              style={[
                styles.guestsPane,
                guestsPaneWidth
                  ? { width: guestsPaneWidth, minWidth: guestsPaneWidth, maxWidth: guestsPaneWidth }
                  : null,
              ]}
            >
              <AppKeyboardAwareScrollView
                ref={listScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={onListScroll}
              >
                {/* Search */}
                <View style={styles.searchCard}>
                  <Text>
                    <Ionicons name="search" size={18} color={colors.gray[500]} />
                  </Text>
                  <TextInput
                    defaultValue={query}
                    onChangeText={onChangeQuery}
                    placeholder="חיפוש שם או טלפון..."
                    placeholderTextColor={colors.gray[500]}
                    style={styles.searchInput}
                    textAlign="right"
                    returnKeyType="search"
                  />
                  {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
                <TableNumberFilter
                  options={tableFilterOptions}
                  selectedId={tableFilterId}
                  onSelect={setTableFilterId}
                />
                {listHint ? <Text style={styles.listHint}>{listHint}</Text> : null}

                <View style={styles.statusFilterWrap}>
                  <CheckInStatusFilter
                    value={filter}
                    onChange={setFilter}
                    counts={statusFilterCounts}
                  />
                </View>

                <TouchableOpacity
                  onPress={openAddSheet}
                  style={styles.addGuestBtn}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="הוספת מוזמן שלא נמצא ברשימה"
                >
                  <Ionicons name="person-add" size={18} color={colors.white} />
                  <Text style={styles.addGuestBtnText}>הוסף מוזמן שלא ברשימה</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleExportArrivedExcel()}
                  style={styles.exportExcelBtn}
                  activeOpacity={0.9}
                  disabled={exportingExcel}
                  accessibilityRole="button"
                  accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
                >
                  {exportingExcel ? (
                    <ActivityIndicator size={18} color={colors.primary} />
                  ) : (
                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                  )}
                  <Text style={styles.exportExcelBtnText}>{exportingExcel ? "מייצא…" : "ייצוא אקסל"}</Text>
                </TouchableOpacity>

                {/* Categories */}
                <View style={{ gap: 12, marginTop: 12 }}>
                  {renderedSections.map((sec) => {
                    const isCollapsed = collapsed.has(sec.key);
                    return (
                      <View key={sec.key} style={styles.categoryCard}>
                        <TouchableOpacity
                          style={styles.categoryHeader}
                          onPress={() => toggleCollapsed(sec.key)}
                          activeOpacity={0.9}
                          accessibilityRole="button"
                          accessibilityLabel={`קטגוריה ${sec.name}`}
                        >
                          <View style={styles.categoryHeaderRight}>
                            <Ionicons
                              name={isCollapsed ? "chevron-down" : "chevron-up"}
                              size={20}
                              color={"rgba(17,24,39,0.55)"}
                            />
                            <Text style={styles.categoryTitle} numberOfLines={1}>
                              {sec.name}
                            </Text>
                          </View>

                          <View style={styles.categoryHeaderLeft}>
                            <View style={styles.categoryCountPill}>
                              <Text style={styles.categoryCountText}>{`${sec.checkedIn}/${sec.total}`}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {!isCollapsed ? (
                          <View style={{ gap: 10, marginTop: 12 }}>
                            {sec.data.map((g) => {
                              const checkedIn = Boolean(g.checkedIn);
                              const isSaving = savingId === g.id;
                              const people = Number(g.numberOfPeople) || 1;
                              const arrivedCount =
                                g.checkedInCount === null || g.checkedInCount === undefined
                                  ? people
                                  : Number(g.checkedInCount) || 0;
                              const isSavingCount = savingCountId === g.id;
                              return (
                                <View key={g.id} style={[styles.tabletGuestCard, checkedIn && styles.tabletGuestCardChecked]}>
                                  {/* Accent bar (right edge) */}
                                  <View style={[styles.tabletAccentBar, checkedIn && styles.tabletAccentBarOn]} />

                                  <View style={styles.tabletGuestInner}>
                                    {/* LEFT column: all buttons */}
                                    <View style={styles.tabletButtonsCol}>
                                      <View style={styles.tabletButtonsRow}>
                                        <Text style={[styles.tabletToggleLabel, checkedIn && styles.tabletToggleLabelOn]}>
                                          {checkedIn ? "הגיע" : "לא הגיע"}
                                        </Text>
                                        <CheckInToggle
                                          checked={checkedIn}
                                          saving={isSaving}
                                          disabled={isSaving}
                                          accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                                          onPress={() => toggleCheckIn(g)}
                                        />
                                      </View>

                                      <View style={styles.tabletButtonsRow}>
                                        {checkedIn ? (
                                          <View style={styles.compactStepper}>
                                            <Pressable
                                              accessibilityRole="button"
                                              accessibilityLabel={`הפחת כמות שהגיעה עבור ${g.name}`}
                                              onPress={() => void setCheckedInCount(g, Math.max(0, arrivedCount - 1))}
                                              disabled={isSavingCount || arrivedCount <= 0}
                                              style={[
                                                styles.stepBtnCompact,
                                                (isSavingCount || arrivedCount <= 0) && styles.stepBtnDisabled,
                                              ]}
                                            >
                                              <Text style={styles.stepBtnText}>-</Text>
                                            </Pressable>

                                            <View style={styles.compactCountWrap}>
                                              {isSavingCount ? (
                                                <ActivityIndicator size={12} color={colors.primary} />
                                              ) : (
                                                <Text style={styles.compactCountText}>{arrivedCount}</Text>
                                              )}
                                            </View>

                                            <Pressable
                                              accessibilityRole="button"
                                              accessibilityLabel={`הגדל כמות שהגיעה עבור ${g.name}`}
                                              onPress={() => void setCheckedInCount(g, arrivedCount + 1)}
                                              disabled={isSavingCount}
                                              style={[styles.stepBtnCompact, isSavingCount && styles.stepBtnDisabled]}
                                            >
                                              <Text style={styles.stepBtnText}>+</Text>
                                            </Pressable>
                                          </View>
                                        ) : (
                                          <View style={styles.peoplePill}>
                                            <Ionicons name="person" size={12} color={"rgba(17,24,39,0.65)"} />
                                            <Text style={styles.peopleText}>{people}</Text>
                                          </View>
                                        )}
                                      </View>

                                      <TouchableOpacity
                                        onPress={() => void callGuest(g.phone, g.name)}
                                        disabled={!phoneToTel(g.phone)}
                                        activeOpacity={0.85}
                                        style={[styles.phoneBtn, !phoneToTel(g.phone) && styles.phoneBtnDisabled]}
                                        accessibilityRole="button"
                                        accessibilityLabel={phoneToTel(g.phone) ? `התקשר ל-${g.name}` : `אין מספר טלפון עבור ${g.name}`}
                                      >
                                        <Ionicons
                                          name="call-outline"
                                          size={14}
                                          color={phoneToTel(g.phone) ? colors.primary : "rgba(17,24,39,0.35)"}
                                        />
                                      </TouchableOpacity>
                                    </View>

                                    {/* RIGHT column: guest info */}
                                    <View style={styles.tabletInfoCol}>
                                      <Text style={styles.tabletGuestName} numberOfLines={1}>
                                        {g.name}
                                      </Text>

                                      <View style={styles.tabletInfoMetaRow}>
                                        <View
                                          style={[
                                            styles.statusPill,
                                            g.status === "מגיע"
                                              ? styles.statusComing
                                              : g.status === "לא מגיע"
                                              ? styles.statusNot
                                              : styles.statusPending,
                                          ]}
                                        >
                                          <Text style={styles.statusText} numberOfLines={1}>
                                            {g.status}
                                          </Text>
                                        </View>

                                        <Text style={[styles.tabletArrivedLabel, checkedIn && styles.tabletArrivedLabelOn]} numberOfLines={1}>
                                          {checkedIn ? `הגיעו ${arrivedCount} מתוך ${people}` : "טרם הגיע"}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  {visibleSections.length === 0 ? (
                    <View style={styles.emptyCard}>
                      {loading || searching ? (
                        <ActivityIndicator size="large" color={colors.primary} />
                      ) : (
                        <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                      )}
                      <Text style={styles.emptyTitle}>
                        {searching ? "מחפש…" : loading ? "טוען אורחים…" : "לא נמצאו אורחים"}
                      </Text>
                      {loading || searching ? null : (
                        <Text style={styles.emptyText}>נסה לשנות את החיפוש או הפילטר{tableFilterId ? " או לנקות שולחן" : ""}</Text>
                      )}
                    </View>
                  ) : hiddenListRows > 0 ? (
                    <TouchableOpacity
                      onPress={showMoreRows}
                      style={styles.showMoreBtn}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel="הצגת אורחים נוספים ברשימה"
                    >
                      <Ionicons name="chevron-down" size={16} color={colors.primary} />
                      <Text style={styles.showMoreBtnText}>הצג עוד אורחים ({hiddenListRows})</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </AppKeyboardAwareScrollView>
              {showScrollTop && !addOpen && !tableModalOpen ? (
                <ScrollToTopFab bottom={20} onPress={scrollListToTop} />
              ) : null}
            </View>

            {/* Map */}
            <View style={styles.mapPane}>
              <View style={styles.mapCard}>
                <View style={styles.mapHeaderRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.mapTitle}>מפת ישיבה</Text>
                    <Text style={styles.mapHint} numberOfLines={1}>
                      {tableFilterId ? tableFilterLabel || "שולחן נבחר" : "לחץ על שולחן לסינון"}
                    </Text>
                  </View>
                  {tableFilterId ? (
                    <TouchableOpacity
                      onPress={openAddSheet}
                      style={styles.mapAddGuestBtn}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`הוסף מוזמן ל${tableFilterLabel || "שולחן"}`}
                    >
                      <Ionicons name="person-add" size={16} color={colors.white} />
                      <Text style={styles.mapAddGuestBtnText}>הוסף מוזמן</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {mapLoading ? (
                  <View style={styles.mapLoadingWrap}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>טוען מפה...</Text>
                  </View>
                ) : !hasMapData ? (
                  <View style={styles.mapEmptyWrap}>
                    <Ionicons name="map-outline" size={42} color={colors.gray[500]} />
                    <Text style={styles.emptyTitle}>אין מפה עדיין</Text>
                    <Text style={styles.emptyText}>כשתהיה סקיצה לאירוע, היא תופיע כאן.</Text>
                  </View>
                ) : (
                  <View style={styles.mapViewport}>
                    {renderNativeMapCanvas()}
                    <View style={styles.mapZoomControls} pointerEvents="box-none">
                      <TouchableOpacity onPress={zoomInMap} style={styles.mapZoomBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="התקרבות למפה">
                        <Ionicons name="add" size={22} color="#102A56" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={resetMapZoom} style={styles.mapZoomFitBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="התאמת מפה">
                        <Text style={styles.mapZoomLabel}>{`${Math.round(mapZoom * 100)}%`}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={zoomOutMap} style={styles.mapZoomBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="התרחקות מהמפה">
                        <Ionicons name="remove" size={22} color="#102A56" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Table modal */}
            <Modal visible={tableModalOpen} transparent animationType="fade" onRequestClose={closeTableDetails}>
              <Pressable style={styles.modalOverlay} onPress={closeTableDetails}>
                <Pressable style={styles.modalCard} onPress={() => null}>
                  <View style={styles.modalHeader}>
                    <TouchableOpacity
                      onPress={closeTableDetails}
                      style={styles.modalCloseBtn}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="סגירה"
                    >
                      <Ionicons name="close" size={18} color={"rgba(17,24,39,0.70)"} />
                    </TouchableOpacity>

                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={styles.modalTitle} numberOfLines={1}>
                        {activeTable ? `שולחן ${activeTable.number ?? ""}` : "שולחן"}
                      </Text>
                      <Text style={styles.modalSubtitle} numberOfLines={1}>
                        {activeTable
                          ? `${arrivedPeopleByTableId.get(String(activeTable.id)) || 0} / ${Number(activeTable.capacity) || 0}`
                          : ""}
                      </Text>
                    </View>

                    <View style={{ width: 40 }} />
                  </View>

                  <View style={styles.modalDivider} />

                  <AppKeyboardAwareScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                    {guestsForActiveTable.length === 0 ? (
                      <View style={styles.emptyBox}>
                        <Ionicons name="people-outline" size={38} color={"rgba(17,24,39,0.45)"} />
                        <Text style={styles.emptyTitle}>אין אורחים בשולחן</Text>
                        <Text style={styles.emptyText}>לחץ על שולחן אחר או נקה סינון</Text>
                      </View>
                    ) : (
                      guestsForActiveTable.map((g) => {
                        const checkedIn = Boolean(g.checkedIn);
                        const people = Number(g.numberOfPeople) || 1;
                        const arrivedCount =
                          g.checkedInCount === null || g.checkedInCount === undefined
                            ? people
                            : Number(g.checkedInCount) || 0;
                        return (
                          <View key={g.id} style={[styles.modalGuestRow, checkedIn && styles.modalGuestRowOn]}>
                            <View style={styles.modalGuestMeta}>
                              <Text style={styles.modalGuestCount}>{checkedIn ? arrivedCount : 0}</Text>
                              <Text style={styles.modalGuestCountDim}>{`/ ${people}`}</Text>
                            </View>
                            <Text style={styles.modalGuestName} numberOfLines={1}>
                              {g.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => toggleCheckIn(g)}
                              style={[styles.modalToggleBtn, checkedIn && styles.modalToggleBtnOn]}
                              activeOpacity={0.9}
                              disabled={savingId === g.id}
                              accessibilityRole="button"
                              accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                            >
                              {savingId === g.id ? (
                                <ActivityIndicator size={14} color={checkedIn ? colors.white : colors.primary} />
                              ) : (
                                <Ionicons
                                  name={checkedIn ? "checkmark-circle" : "ellipse-outline"}
                                  size={18}
                                  color={checkedIn ? colors.white : colors.primary}
                                />
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </AppKeyboardAwareScrollView>
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        ) : (
          <AppKeyboardAwareScrollView
            ref={listScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, isAdminStyledMobile ? styles.contentAdminMobile : null, { paddingBottom: contentBottomPadding }]}
            scrollEventThrottle={16}
            onScroll={onListScroll}
          >
            {/* Search + add guest */}
            <View style={styles.searchRow}>
              <View style={[styles.searchCard, styles.searchCardInline]}>
                <Text>
                  <Ionicons name="search" size={18} color={colors.gray[500]} />
                </Text>
                <TextInput
                  defaultValue={query}
                  onChangeText={onChangeQuery}
                  placeholder="חיפוש שם או טלפון..."
                  placeholderTextColor={colors.gray[500]}
                  style={styles.searchInput}
                  textAlign="right"
                  returnKeyType="search"
                />
                {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </View>
              <TouchableOpacity
                onPress={openAddSheet}
                style={styles.addGuestIconBtn}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="הוספת מוזמן שלא נמצא ברשימה"
              >
                <Ionicons name="person-add" size={22} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleExportArrivedExcel()}
                style={styles.exportExcelIconBtn}
                activeOpacity={0.9}
                disabled={exportingExcel}
                accessibilityRole="button"
                accessibilityLabel="ייצוא אקסל של אורחים שהגיעו"
              >
                {exportingExcel ? (
                  <ActivityIndicator size={18} color={colors.primary} />
                ) : (
                  <Ionicons name="download-outline" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.statusFilterWrap}>
              <CheckInStatusFilter
                value={filter}
                onChange={setFilter}
                counts={statusFilterCounts}
                compact
              />
            </View>
            <TableNumberFilter
              options={tableFilterOptions}
              selectedId={tableFilterId}
              onSelect={setTableFilterId}
            />
            {listHint ? <Text style={styles.listHint}>{listHint}</Text> : null}

            {/* Grouped by table */}
            <View style={{ gap: 12, marginTop: 12 }}>
              {renderedTableSections.map((sec) => {
                const isCollapsed = collapsed.has(sec.key);
                return (
                  <View key={sec.key} style={styles.categoryCard}>
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() => toggleCollapsed(sec.key)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={sec.name}
                    >
                      <View style={styles.categoryHeaderRight}>
                        <Ionicons
                          name={isCollapsed ? "chevron-down" : "chevron-up"}
                          size={20}
                          color={"rgba(17,24,39,0.55)"}
                        />
                        <View style={styles.tableHeaderIcon}>
                          <Ionicons name="restaurant" size={14} color={colors.primary} />
                        </View>
                        <Text style={styles.categoryTitle} numberOfLines={1}>
                          {sec.name}
                        </Text>
                      </View>

                      <View style={styles.categoryHeaderLeft}>
                        <View style={styles.categoryCountPill}>
                          <Text style={styles.categoryCountText}>{`${sec.checkedIn}/${sec.total}`}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {!isCollapsed ? (
                      <View style={{ gap: 8, marginTop: 10 }}>
                        {sec.data.map((g) => {
                          const checkedIn = Boolean(g.checkedIn);
                          const isSaving = savingId === g.id;
                          const people = Number(g.numberOfPeople) || 1;
                          const arrivedCount =
                            g.checkedInCount === null || g.checkedInCount === undefined
                              ? people
                              : Number(g.checkedInCount) || 0;
                          const isSavingCount = savingCountId === g.id;
                          const canCall = Boolean(phoneToTel(g.phone));
                          return (
                            <View key={g.id} style={[styles.cGuestRow, checkedIn && styles.cGuestRowOn]}>
                              {/* Accent bar on the right edge (RTL) */}
                              <View style={[styles.cAccent, checkedIn && styles.cAccentOn]} />

                              {/* RIGHT: name + status */}
                              <View style={styles.cInfo}>
                                <Text style={styles.cName} numberOfLines={1}>
                                  {g.name}
                                </Text>
                                <View
                                  style={[
                                    styles.cStatusPill,
                                    g.status === "מגיע"
                                      ? styles.statusComing
                                      : g.status === "לא מגיע"
                                      ? styles.statusNot
                                      : styles.statusPending,
                                  ]}
                                >
                                  <Text style={styles.cStatusText}>{g.status}</Text>
                                </View>
                              </View>

                              {/* MIDDLE: arrived count + phone */}
                              <View style={styles.cControls}>
                                {checkedIn ? (
                                  <ArrivedCountControl
                                    guest={g}
                                    arrivedCount={arrivedCount}
                                    invitedCount={people}
                                    isSaving={isSavingCount}
                                    onSetCount={setCheckedInCount}
                                  />
                                ) : (
                                  <View style={styles.cPeople}>
                                    <Ionicons name="person" size={12} color={"rgba(17,24,39,0.65)"} />
                                    <Text style={styles.cPeopleText}>{people}</Text>
                                  </View>
                                )}

                                <TouchableOpacity
                                  onPress={() => void callGuest(g.phone, g.name)}
                                  disabled={!canCall}
                                  activeOpacity={0.82}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={styles.cActionBtnTouch}
                                  accessibilityRole="button"
                                  accessibilityLabel={canCall ? `התקשר ל-${g.name}` : `אין מספר טלפון עבור ${g.name}`}
                                >
                                  <View style={[styles.cActionBtn, styles.cPhone, !canCall && styles.cPhoneDisabled]}>
                                    <Ionicons
                                      name="call-outline"
                                      size={16}
                                      color={canCall ? colors.primary : "rgba(17,24,39,0.35)"}
                                    />
                                  </View>
                                </TouchableOpacity>
                              </View>

                              {/* LEFT: check-in toggle */}
                              <MobileCheckInButton
                                checked={checkedIn}
                                saving={isSaving}
                                disabled={isSaving}
                                accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                                onPress={() => toggleCheckIn(g)}
                              />
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {tableSections.length === 0 ? (
                <View style={styles.emptyCard}>
                  {loading || searching ? (
                    <ActivityIndicator size="large" color={colors.primary} />
                  ) : (
                    <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                  )}
                  <Text style={styles.emptyTitle}>
                    {searching ? "מחפש…" : loading ? "טוען אורחים…" : "לא נמצאו אורחים"}
                  </Text>
                  {loading || searching ? null : (
                    <Text style={styles.emptyText}>נסה לשנות את החיפוש או הפילטר{tableFilterId ? " או לנקות שולחן" : ""}</Text>
                  )}
                </View>
              ) : hiddenListRows > 0 ? (
                <TouchableOpacity
                  onPress={showMoreRows}
                  style={styles.showMoreBtn}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="הצגת אורחים נוספים ברשימה"
                >
                  <Ionicons name="chevron-down" size={16} color={colors.primary} />
                  <Text style={styles.showMoreBtnText}>הצג עוד אורחים ({hiddenListRows})</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {isAdminStyledMobile ? <View style={styles.bottomContentSpacer} /> : null}
          </AppKeyboardAwareScrollView>
        )}
        {!isTablet && showScrollTop && !addOpen ? (
          <ScrollToTopFab bottom={Math.max(18, bottomReserve - 8)} onPress={scrollListToTop} />
        ) : null}
      </View>
      </View>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddSheet}>
        <Pressable style={styles.modalOverlay} onPress={closeAddSheet}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={closeAddSheet}
                style={styles.modalCloseBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="סגירה"
              >
                <Ionicons name="close" size={18} color={"rgba(17,24,39,0.70)"} />
              </TouchableOpacity>

              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  הוספת מוזמן
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  מוזמן שלא נמצא ברשימה – יסומן מיד כהגיע
                </Text>
              </View>

              <View style={{ width: 40 }} />
            </View>

            <View style={styles.modalDivider} />

            <AppKeyboardAwareScrollView
              style={styles.addSheetScroll}
              contentContainerStyle={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>שם המוזמן</Text>
                <TextInput
                  value={addName}
                  onChangeText={(text) => {
                    setAddName(text);
                    if (addError) setAddError(null);
                  }}
                  placeholder="לדוגמה: ישראל ישראלי"
                  placeholderTextColor={colors.gray[500]}
                  style={styles.formInput}
                  textAlign="right"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>מספר טלפון (לא חובה)</Text>
                <TextInput
                  value={addPhone}
                  onChangeText={(text) => {
                    setAddPhone(text);
                    if (addError) setAddError(null);
                  }}
                  placeholder="050-0000000"
                  placeholderTextColor={colors.gray[500]}
                  style={styles.formInput}
                  textAlign="right"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>מספר אנשים</Text>
                <View style={styles.formStepper}>
                  <Pressable
                    onPress={() => setAddPeople((prev) => Math.max(1, prev - 1))}
                    disabled={addPeople <= 1}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.formStepBtn,
                      addPeople <= 1 ? styles.formStepBtnDisabled : null,
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="הפחת מספר אנשים"
                  >
                    <Ionicons name="remove" size={18} color={colors.primary} />
                  </Pressable>

                  <View style={styles.formStepValueWrap}>
                    <Text style={styles.formStepValue}>{addPeople}</Text>
                    <Text style={styles.formStepValueHint}>{addPeople === 1 ? "אורח" : "אורחים"}</Text>
                  </View>

                  <Pressable
                    onPress={() => setAddPeople((prev) => Math.min(50, prev + 1))}
                    hitSlop={6}
                    style={({ pressed }) => [styles.formStepBtn, pressed ? { opacity: 0.85 } : null]}
                    accessibilityRole="button"
                    accessibilityLabel="הגדל מספר אנשים"
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>הושבה בשולחן</Text>
                {addTableId && !addTablePickerExpanded ? (
                  <>
                    <View style={styles.selectedTableCard}>
                      <View style={styles.selectedTableCardIcon}>
                        <Ionicons name="restaurant" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.selectedTableCardTitle}>
                          {addSelectedTableOption?.label ?? tableFilterLabel ?? "שולחן נבחר"}
                        </Text>
                        {addSelectedTableOption && addSelectedTableOption.capacity > 0 ? (
                          <Text style={styles.selectedTableCardMeta}>
                            {`יושבים: ${addSelectedTableOption.seated + addPeople} מתוך ${addSelectedTableOption.capacity}`}
                          </Text>
                        ) : (
                          <Text style={styles.selectedTableCardMeta}>המוזמן יושב בשולחן שבחרת במפה</Text>
                        )}
                      </View>
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    </View>
                    <Pressable
                      onPress={() => setAddTablePickerExpanded(true)}
                      style={({ pressed }) => [styles.changeTableLink, pressed ? { opacity: 0.85 } : null]}
                      accessibilityRole="button"
                      accessibilityLabel="שנה שולחן"
                    >
                      <Text style={styles.changeTableLinkText}>שנה שולחן</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.formHint}>בחר שולחן להושבת המוזמן, או השאר ללא שולחן.</Text>

                    {tableOptions.length > 3 ? (
                      <View style={[styles.searchCard, { marginTop: 0, height: 48 }]}>
                        <Text>
                          <Ionicons name="search" size={18} color={colors.gray[500]} />
                        </Text>
                        <TextInput
                          value={addTableQuery}
                          onChangeText={setAddTableQuery}
                          placeholder="חיפוש שולחן..."
                          placeholderTextColor={colors.gray[500]}
                          style={styles.searchInput}
                          textAlign="right"
                          autoCapitalize="none"
                        />
                      </View>
                    ) : null}

                    <View style={{ gap: 8 }}>
                      <Pressable
                        onPress={() => setAddTableId(null)}
                        style={({ pressed }) => [
                          styles.tableOptionRow,
                          addTableId === null ? styles.tableOptionRowSelected : null,
                          pressed ? { opacity: 0.9 } : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="בחר ללא שולחן"
                      >
                        <Ionicons
                          name={addTableId === null ? "checkmark-circle" : "ellipse-outline"}
                          size={22}
                          color={addTableId === null ? colors.primary : "rgba(156,163,175,0.9)"}
                        />
                        <Text style={styles.tableOptionText}>ללא שולחן</Text>
                      </Pressable>

                      {addTableOptions.map((opt) => {
                        const selected = addTableId === opt.id;
                        const wouldSeat = selected ? opt.seated + addPeople : opt.seated;
                        const overflow = opt.isReserve || opt.capacity <= 0 ? 0 : Math.max(0, wouldSeat - opt.capacity);
                        return (
                          <Pressable
                            key={opt.id}
                            onPress={() => {
                              setAddTableId(opt.id);
                              setAddTablePickerExpanded(false);
                            }}
                            style={({ pressed }) => [
                              styles.tableOptionRow,
                              selected ? styles.tableOptionRowSelected : null,
                              pressed ? { opacity: 0.9 } : null,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`הושב ב${opt.label}`}
                          >
                            <Ionicons
                              name={selected ? "checkmark-circle" : "ellipse-outline"}
                              size={22}
                              color={selected ? colors.primary : "rgba(156,163,175,0.9)"}
                            />

                            <View style={styles.tableOptionInfo}>
                              <Text style={styles.tableOptionText} numberOfLines={1}>
                                {opt.label}
                              </Text>
                              {opt.capacity > 0 ? (
                                <Text style={styles.tableOptionMeta} numberOfLines={1}>
                                  {`יושבים: ${wouldSeat} מתוך ${opt.capacity}`}
                                </Text>
                              ) : null}
                            </View>

                            {opt.isReserve ? (
                              <View style={styles.tableOptionBadgeReserve}>
                                <Text style={styles.tableOptionBadgeReserveText}>רזרבה</Text>
                              </View>
                            ) : overflow > 0 ? (
                              <View style={styles.tableOptionBadgeOverflow}>
                                <Text style={styles.tableOptionBadgeOverflowText}>{`חריגה ${overflow}`}</Text>
                              </View>
                            ) : opt.capacity > 0 ? (
                              <View style={styles.tableOptionBadgeOk}>
                                <Text style={styles.tableOptionBadgeOkText}>פנוי</Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {addTableOptions.length === 0 ? (
                        <Text style={styles.formHint}>
                          {tableOptions.length === 0 ? "לא הוגדרו שולחנות לאירוע." : "לא נמצאו שולחנות מתאימים לחיפוש."}
                        </Text>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
            </AppKeyboardAwareScrollView>

            {addError ? (
              <View style={styles.formErrorBox}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.formErrorText}>{addError}</Text>
              </View>
            ) : null}

            <View style={styles.addSheetFooter}>
              <TouchableOpacity
                onPress={() => void confirmAddGuest()}
                disabled={addingWalkIn || !addName.trim()}
                style={[styles.addPrimaryBtn, addingWalkIn || !addName.trim() ? styles.addBtnDisabled : null]}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="הוסף מוזמן וסמן כהגיע"
              >
                {addingWalkIn ? (
                  <ActivityIndicator size={16} color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                    <Text style={styles.addPrimaryBtnText}>הוסף וסמן כהגיע</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeAddSheet}
                disabled={addingWalkIn}
                style={[styles.addSecondaryBtn, addingWalkIn ? styles.addBtnDisabled : null]}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="ביטול"
              >
                <Text style={styles.addSecondaryBtnText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  scrollTopFab: {
    position: "absolute",
    right: 16,
    zIndex: 40,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: colors.black,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  screen: { flex: 1, backgroundColor: colors.gray[100] },
  screenTransparent: { backgroundColor: "transparent" },
  bg: { ...StyleSheet.absoluteFillObject },
  bgHighlight: { ...StyleSheet.absoluteFillObject },
  bgWarmGlow: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center", gap: 10 },
  centerTransparent: { backgroundColor: "transparent" },
  loadingText: { fontSize: 14, fontWeight: "700", color: colors.gray[600] },
  errorTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  backBtn: { marginTop: 14, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  backBtnText: { color: colors.white, fontWeight: "900" },
  topSpacer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  screenTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "900",
    color: colors.richBlack,
    textAlign: "right",
  },

  liveMapBtn: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.28)",
  },
  liveMapDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#DC2626" },
  liveMapBtnText: { fontSize: 12.5, fontWeight: "900", color: "#B91C1C" },

  topActions: { flexDirection: ROW_DIR, alignItems: "center", gap: 8 },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "900", color: colors.text, writingDirection: "rtl" },
  topSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "800", color: colors.gray[600], textAlign: "center", writingDirection: "rtl" },

  // RTL visual layout is handled via ROW_DIR / ALIGN_RIGHT helpers. Do NOT also set
  // `direction: "rtl"` here: it inherits to all descendants and, combined with
  // ROW_DIR (which is `row-reverse` when the runtime isn't RTL), double-mirrors the
  // whole page back to LTR.
  content: { padding: 16, paddingTop: 6 },
  contentAdminMobile: { paddingTop: 8 },
  bottomContentSpacer: { height: 56 },
  adminMobileIntroCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(21,76,151,0.08)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  adminMobileIntroHeader: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  adminMobileIntroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(15,69,230,0.08)",
    borderWidth: 1,
    borderColor: "rgba(15,69,230,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  adminMobileIntroText: { flex: 1, alignItems: ALIGN_RIGHT, gap: 4 },
  adminMobileIntroTitle: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "right" },
  adminMobileIntroStats: { alignItems: ALIGN_RIGHT, gap: 2 },
  adminMobileIntroStatRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 6,
  },
  adminMobileIntroSubtitle: { fontSize: 12, fontWeight: "700", color: "rgba(17,24,39,0.62)", textAlign: "right" },
  adminMobileIntroStatValue: { fontSize: 12, fontWeight: "900", color: colors.text, textAlign: "right" },
  adminMobileRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  tabletBody: { flex: 1, flexDirection: ROW_DIR, alignItems: "stretch" },
  guestsPane: {
    width: 420,
    maxWidth: 460,
    minWidth: 380,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(0,0,0,0.06)",
    overflow: "visible",
  },
  mapPane: { flex: 1, padding: 16, paddingTop: 6 },

  tableFilterRow: { marginTop: 8, flexDirection: ROW_DIR, alignItems: "center", justifyContent: "space-between", gap: 10 },
  tableFilterPill: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17, 82, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.18)",
    flex: 1,
  },
  tableFilterText: { fontSize: 12, fontWeight: "900", color: colors.primary, textAlign: "right", flex: 1 },
  tableFilterClearBtn: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  tableFilterClearText: { fontSize: 12, fontWeight: "900", color: colors.primary },

  searchRow: {
    marginTop: 8,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 10,
  },
  searchCard: {
    marginTop: 8,
    height: 54,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  searchCardInline: { flex: 1, marginTop: 0 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  addGuestIconBtn: {
    width: 54,
    height: 54,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  exportExcelIconBtn: {
    width: 54,
    height: 54,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.16)",
  },

  statusFilterWrap: {
    marginTop: 12,
  },

  categoryCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  categoryHeaderRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
  },
  categoryTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "right", flexShrink: 1, writingDirection: "rtl" },
  categoryHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  categoryCountPill: {
    minWidth: 54,
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    backgroundColor: "rgba(232,238,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.yaleBlue,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  categoryCountText: { fontSize: 12, fontWeight: "900", color: colors.primary, textAlign: "center" },

  /* ── Tablet guest card ── */
  tabletGuestCard: {
    position: "relative",
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingTop: 11,
    paddingBottom: 11,
    paddingLeft: 12,
    paddingRight: 20,      // extra room so accent bar doesn't clip content
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
    gap: 8,
  },
  tabletGuestCardChecked: {
    borderColor: "rgba(52,199,89,0.28)",
    backgroundColor: "rgba(52,199,89,0.05)",
  },
  tabletAccentBar: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 5,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: "rgba(148,163,184,0.50)",
  },
  tabletAccentBarOn: { backgroundColor: "#10B981" },

  tabletGuestInner: {
    flexDirection: ROW_REVERSE_DIR,
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
  },
  tabletButtonsCol: {
    width: 172,
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 2,
  },
  tabletButtonsRow: {
    width: "100%",
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tabletToggleLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "rgba(17,24,39,0.55)",
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabletToggleLabelOn: { color: "#047857" },
  tabletInfoCol: {
    flex: 1,
    minWidth: 0,
    alignItems: ALIGN_RIGHT,
    justifyContent: "center",
    gap: 8,
  },
  tabletInfoMetaRow: {
    width: "100%",
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tabletGuestName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabletArrivedLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(17,24,39,0.38)",
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabletArrivedLabelOn: { color: "#10B981" },

  tableHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(15,69,230,0.08)",
    borderWidth: 1,
    borderColor: "rgba(15,69,230,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ── Compact guest row (phone) ── */
  cGuestRow: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.07)",
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 8,
  },
  cGuestRowOn: { borderColor: "rgba(76,175,80,0.30)", backgroundColor: "rgba(76,175,80,0.05)" },
  cAccent: { position: "absolute", right: 0, top: 0, bottom: 0, width: 4, backgroundColor: "rgba(148,163,184,0.45)" },
  cAccentOn: { backgroundColor: colors.success },
  cInfo: { flex: 1, minWidth: 0, alignItems: ALIGN_RIGHT, gap: 5 },
  cName: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "right", writingDirection: "rtl" },
  cStatusPill: {
    alignSelf: ALIGN_RIGHT,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cStatusText: { fontSize: 11, fontWeight: "900", color: colors.text, writingDirection: "rtl" },
  cControls: { flexDirection: ROW_DIR, alignItems: "center", gap: 8 },
  cStepper: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 4,
    gap: 4,
    backgroundColor: "rgba(76,175,80,0.10)",
    borderWidth: 1,
    borderColor: "rgba(76,175,80,0.26)",
  },
  cStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(76,175,80,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  cStepCountWrap: {
    minWidth: 52,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  cStepCountInner: { flexDirection: ROW_DIR, alignItems: "center", gap: 1 },
  cStepCountInput: {
    minWidth: 22,
    width: 26,
    height: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 14,
    fontWeight: "900",
    color: "#1B5E20",
    textAlign: "center",
  },
  cStepCountDim: { fontSize: 10, fontWeight: "800", color: "rgba(27,94,32,0.55)" },
  cPeople: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 4,
    minWidth: 42,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    justifyContent: "center",
  },
  cPeopleText: { fontSize: 12, fontWeight: "900", color: "rgba(17,24,39,0.70)" },
  cActionBtnTouch: {
    flexShrink: 0,
  },
  cActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
  },
  cActionBtnDisabled: { opacity: 0.55 },
  cPhone: {
    backgroundColor: "rgba(232,238,255,0.96)",
    borderColor: "rgba(17, 82, 212, 0.18)",
    shadowColor: "rgba(17, 82, 212, 0.35)",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cPhoneDisabled: { backgroundColor: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.06)", shadowOpacity: 0 },
  cCheckBtnOff: {
    backgroundColor: "rgba(232,250,236,0.98)",
    borderColor: "rgba(76,175,80,0.34)",
    shadowColor: "rgba(76,175,80,0.35)",
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cCheckBtnOn: {
    borderColor: "#256628",
    borderWidth: 1.5,
  },

  /* shared guest primitives (still used by phone layout) */
  guestRow: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 18,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.07)",
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  guestRowChecked: {
    borderColor: "rgba(76, 175, 80, 0.30)",
    backgroundColor: "rgba(76, 175, 80, 0.055)",
  },
  guestAccentBar: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: "rgba(148,163,184,0.45)",
  },
  guestAccentBarOn: { backgroundColor: colors.success },
  guestMain: { flex: 1, minWidth: 0, alignItems: ALIGN_RIGHT, justifyContent: "center", gap: 12 },
  guestName: {
    alignSelf: "stretch",
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
    writingDirection: "rtl",
  },
  guestPhone: { fontSize: 13, fontWeight: "700", color: colors.gray[600], textAlign: "right" },
  guestMetaRow: { width: "100%", flexDirection: ROW_DIR, alignItems: "center", justifyContent: "flex-start", gap: 10, flexWrap: "wrap" },
  peoplePill: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 6,
    minWidth: 50,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    justifyContent: "center",
  },
  peopleText: { fontSize: 12, fontWeight: "900", color: "rgba(17,24,39,0.70)", writingDirection: "rtl" },

  /* Clickable arrived-count stepper (phone) */
  arrivedStepper: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 4,
    gap: 2,
    backgroundColor: "rgba(76,175,80,0.10)",
    borderWidth: 1,
    borderColor: "rgba(76,175,80,0.26)",
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(76,175,80,0.30)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  stepCountWrap: { minWidth: 44, height: 30, alignItems: "center", justifyContent: "center" },
  stepCountInner: { flexDirection: ROW_DIR, alignItems: "baseline", gap: 1 },
  stepCountText: { fontSize: 15, fontWeight: "900", color: "#1B5E20", textAlign: "center" },
  stepCountDim: { fontSize: 11, fontWeight: "800", color: "rgba(27,94,32,0.55)" },

  phoneBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,238,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.16)",
  },
  phoneBtnDisabled: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.06)",
  },

  statusPill: {
    minWidth: 76,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { fontSize: 12, fontWeight: "900", color: colors.text, writingDirection: "rtl" },
  statusComing: { backgroundColor: "rgba(52, 199, 89, 0.10)", borderColor: "rgba(52, 199, 89, 0.22)" },
  statusPending: { backgroundColor: "rgba(255, 193, 7, 0.14)", borderColor: "rgba(255, 193, 7, 0.26)" },
  statusNot: { backgroundColor: "rgba(255, 59, 48, 0.08)", borderColor: "rgba(255, 59, 48, 0.22)" },
  guestCheckColumn: {
    width: 62,
    minHeight: 72,
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  guestCheckColumnOn: {
    backgroundColor: "rgba(76,175,80,0.12)",
    borderColor: "rgba(76,175,80,0.28)",
  },
  guestCheckColumnOff: {
    backgroundColor: "rgba(6,23,62,0.035)",
    borderColor: "rgba(15,23,42,0.08)",
  },
  guestCheckCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(6,23,62,0.18)",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  guestCheckCircleOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  guestCheckLabel: {
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    color: "rgba(6,23,62,0.50)",
    writingDirection: "rtl",
  },
  guestCheckLabelOn: {
    color: "#2E7D32",
  },

  arrivalSlot: { width: 118, alignItems: "center", justifyContent: "center" },
  compactStepper: {
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 6,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 8,
  },
  stepBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.55 },
  stepBtnText: { fontSize: 16, fontWeight: "900", color: colors.primary, textAlign: "center" },
  compactCountWrap: { minWidth: 26, alignItems: "center", justifyContent: "center" },
  compactCountText: { fontSize: 12, fontWeight: "900", color: colors.text, textAlign: "center" },

  switchWrap: {
    width: 62,
    height: 34,
    borderRadius: 999,
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.52)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  switchWrapOn: { backgroundColor: "#10B981", borderColor: "rgba(16,185,129,0.35)" },
  switchTrack: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999 },
  switchTrackOn: {},
  switchThumb: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: 2,
  },
  switchThumbOn: { right: 30, backgroundColor: colors.white, borderColor: "rgba(15,23,42,0.12)" },

  emptyCard: {
    marginTop: 24,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: "700", color: colors.gray[600], textAlign: "center" },
  listHint: { marginTop: 8, fontSize: 12, fontWeight: "600", color: colors.gray[600], textAlign: "center" },
  showMoreBtn: {
    marginTop: 4,
    alignSelf: "center",
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  showMoreBtnText: { fontSize: 13, fontWeight: "800", color: colors.primary },

  mapCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    overflow: "hidden",
  },
  mapHeaderRow: { flexDirection: ROW_DIR, alignItems: "center", justifyContent: "space-between", gap: 12 },
  mapAddGuestBtn: {
    minHeight: 38,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  mapAddGuestBtnText: { fontSize: 12, fontWeight: "900", color: colors.white, textAlign: "center" },
  mapTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "right" },
  mapHint: { fontSize: 12, fontWeight: "800", color: colors.gray[600], textAlign: "right" },
  mapViewport: { flex: 1, position: "relative" },
  mapZoomControls: {
    position: "absolute",
    left: 12,
    bottom: 14,
    zIndex: 20,
    alignItems: "center",
    gap: 8,
  },
  mapZoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  mapZoomFitBtn: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapZoomLabel: { fontSize: 11, fontWeight: "900", color: "rgba(17,24,39,0.62)" },
  mapLoadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  mapEmptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 18 },

  canvasScroll: { flex: 1, marginTop: 12 },
  canvas: { backgroundColor: colors.white, overflow: "hidden" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.gray[200] },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.gray[200] },

  table: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[300],
    shadowColor: colors.richBlack,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tableSquare: { width: 76, height: 76 },
  tableRect: { width: 62, height: 128 },
  tableNumber: { fontWeight: "900", fontSize: 16, color: colors.text },
  tableCap: { fontSize: 13, fontWeight: "800", color: colors.gray[600], marginTop: 2 },
  tableFullStyle: {
    backgroundColor: colors.success,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tableFullText: { color: colors.white },
  tableFullCapText: { color: "rgba(255,255,255,0.92)" },
  reserveTableStyle: { backgroundColor: "rgba(0,0,0,0.72)", borderColor: colors.gray[800] },
  reserveTableText: { color: colors.white },
  reserveTableCapText: { color: "rgba(255,255,255,0.70)" },
  tableSelectedStyle: {
    borderColor: "#10B981",
    borderWidth: 2,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    shadowColor: "#10B981",
    shadowOpacity: 0.20,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tableSelectedText: { color: "#047857" },
  tableSelectedCapText: { color: "#047857" },

  textArea: {
    position: "absolute",
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  textAreaText: { fontSize: 14, fontWeight: "800", color: colors.text },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.70)",
    shadowColor: colors.black,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    overflow: "hidden",
    maxHeight: Platform.OS === "web" ? 680 : "84%",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827", textAlign: "center" },
  modalSubtitle: { marginTop: 4, fontSize: 12, fontWeight: "800", color: "rgba(17,24,39,0.55)", textAlign: "center" },
  modalDivider: { height: 1, backgroundColor: "rgba(17,24,39,0.08)", marginHorizontal: 16 },
  modalBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10 },

  modalGuestRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.04)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
    gap: 10,
  },
  modalGuestRowOn: { backgroundColor: "rgba(52, 199, 89, 0.10)", borderColor: "rgba(52, 199, 89, 0.22)" },
  modalGuestName: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: "900", color: colors.text },
  modalGuestMeta: { width: 74, flexDirection: ROW_DIR, alignItems: "center", justifyContent: "flex-start", gap: 4 },
  modalGuestCount: { fontSize: 13, fontWeight: "900", color: colors.primary },
  modalGuestCountDim: { fontSize: 12, fontWeight: "900", color: colors.gray[600] },
  modalToggleBtn: {
    width: 44,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(17, 82, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalToggleBtnOn: { backgroundColor: colors.success, borderColor: "rgba(0,0,0,0.08)" },

  emptyBox: {
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 8,
  },

  addGuestBtn: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  addGuestBtnText: { fontSize: 14, fontWeight: "900", color: colors.white, textAlign: "center" },
  exportExcelBtn: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.16)",
  },
  exportExcelBtnText: { fontSize: 14, fontWeight: "900", color: colors.primary, textAlign: "center" },

  addSheetScroll: { flexGrow: 0, flexShrink: 1 },
  formField: { gap: 8 },
  formLabel: { fontSize: 13, fontWeight: "900", color: colors.text, textAlign: "right" },
  formHint: { fontSize: 12, fontWeight: "700", color: colors.gray[600], textAlign: "right", lineHeight: 17 },
  formInput: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  formStepper: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 8,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  formStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17, 82, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.18)",
  },
  formStepBtnDisabled: { opacity: 0.45 },
  formStepValueWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  formStepValue: { fontSize: 20, fontWeight: "900", color: colors.text, textAlign: "center" },
  formStepValueHint: { fontSize: 11, fontWeight: "800", color: colors.gray[600], textAlign: "center" },

  selectedTableCard: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(25,93,230,0.08)",
    borderWidth: 1,
    borderColor: "rgba(25,93,230,0.22)",
  },
  selectedTableCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedTableCardTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "right" },
  selectedTableCardMeta: { marginTop: 4, fontSize: 12, fontWeight: "800", color: colors.gray[600], textAlign: "right" },
  changeTableLink: { alignSelf: ALIGN_RIGHT, marginTop: 8, paddingHorizontal: 4, paddingVertical: 4 },
  changeTableLinkText: { fontSize: 12, fontWeight: "900", color: colors.primary, textAlign: "right" },

  tableOptionRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  tableOptionRowSelected: {
    backgroundColor: "rgba(17, 82, 212, 0.07)",
    borderColor: "rgba(17, 82, 212, 0.45)",
    borderWidth: 2,
  },
  tableOptionInfo: { flex: 1, minWidth: 0, alignItems: ALIGN_RIGHT, gap: 2 },
  tableOptionText: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "right" },
  tableOptionMeta: { fontSize: 12, fontWeight: "800", color: colors.gray[600], textAlign: "right" },
  tableOptionBadgeOk: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.18)",
  },
  tableOptionBadgeOkText: { fontSize: 11, fontWeight: "900", color: "#16A34A", textAlign: "center" },
  tableOptionBadgeOverflow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
  },
  tableOptionBadgeOverflowText: { fontSize: 11, fontWeight: "900", color: "#DC2626", textAlign: "center" },
  tableOptionBadgeReserve: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(6,23,62,0.06)",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.16)",
  },
  tableOptionBadgeReserveText: { fontSize: 11, fontWeight: "900", color: colors.primary, textAlign: "center" },

  formErrorBox: {
    marginHorizontal: 16,
    marginBottom: 4,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
  },
  formErrorText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "900", color: "#DC2626", textAlign: "right" },

  addSheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(17,24,39,0.06)",
  },
  addPrimaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.primary,
  },
  addPrimaryBtnText: { fontSize: 14, fontWeight: "900", color: colors.white, textAlign: "center" },
  addSecondaryBtn: {
    minHeight: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addSecondaryBtnText: { fontSize: 13, fontWeight: "900", color: colors.primary, textAlign: "center" },
  addBtnDisabled: { opacity: 0.55 },
});

