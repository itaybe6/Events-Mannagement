import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { colors } from '@/constants/colors';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { eventService } from '@/lib/services/eventService';
import {
  DUPLICATE_GUEST_ERROR,
  GUEST_DELETE_FAILED_ERROR,
  guestService,
  UNAPPROVED_EVENT_GUEST_LIMIT,
  UNAPPROVED_EVENT_GUEST_LIMIT_ERROR,
} from '@/lib/services/guestService';
import {
  downloadGuestImportTemplate,
  pickAndParseGuestsFile,
  type ParsedGuestRow,
} from '@/lib/importGuestsExcel';
import { exportGuestsToPdf } from '@/lib/exportGuestsPdf';

type GuestStatus = 'ממתין' | 'אולי מגיע' | 'מגיע' | 'לא מגיע';
type GuestRow = {
  id: string;
  name: string;
  phone: string;
  status: GuestStatus;
  category_id?: string | null;
  numberOfPeople?: number | null;
};
type GuestCategoryRow = { id: string; name: string; side?: 'groom' | 'bride' };

export default function CoupleGuestsWebScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { isLoggedIn, userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isAdminRouteContext = useMemo(() => segments.includes('(admin)'), [segments]);
  const useManagerChrome = Platform.OS === 'web';
  const useEmbeddedWebShell = Platform.OS === 'web' && !isAdminRouteContext;
  const PageContentComponent: any = useEmbeddedWebShell ? View : ScrollView;
  const contentWidth = Math.max(0, windowWidth);
  const isNarrow = contentWidth < 720;

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;
  const backHref = resolvedEventId
    ? isAdminRouteContext
      ? `/(admin)/admin-event-details?id=${resolvedEventId}`
      : `/(couple)?eventId=${resolvedEventId}`
    : isAdminRouteContext
      ? '/(admin)/admin-events'
      : '/(couple)';

  const [loading, setLoading] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventLocation, setEventLocation] = useState('');
  const [isEventApproved, setIsEventApproved] = useState<boolean>(true);

  const [categories, setCategories] = useState<GuestCategoryRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [sentGuestIds, setSentGuestIds] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuestStatus | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [expandedByCategoryId, setExpandedByCategoryId] = useState<Record<string, boolean>>({});
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());

  const [editOpen, setEditOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<GuestStatus>('ממתין');
  const [editPeopleCount, setEditPeopleCount] = useState('1');

  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<'category' | 'guest'>('category');
  const [addSelectedCategoryId, setAddSelectedCategoryId] = useState<string>('__uncategorized__');
  const [addNewCategoryName, setAddNewCategoryName] = useState('');
  const [addGuestName, setAddGuestName] = useState('');
  const [addGuestPhone, setAddGuestPhone] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatusText, setImportStatusText] = useState('');
  const [importSummary, setImportSummary] = useState<{
    added: number;
    duplicates: number;
    duplicateNames: string[];
    skipped: number;
    newCategories: number;
    mergedIntoExisting: number;
  } | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn, router]);

  const load = async () => {
    if (!resolvedEventId) {
      setCategories([]);
      setGuests([]);
      setSentGuestIds(new Set());
      return;
    }

    if (userData?.id) setActiveEvent(userData.id, resolvedEventId);
    setLoading(true);
    try {
      const [evt, cats, g] = await Promise.all([
        eventService.getEvent(resolvedEventId),
        guestService.getGuestCategories(resolvedEventId),
        guestService.getGuests(resolvedEventId),
      ]);
      setEventTitle(String((evt as any)?.title || '').trim());
      setEventDate((evt as any)?.date instanceof Date ? (evt as any).date : ((evt as any)?.date ? new Date((evt as any).date) : null));
      setEventLocation(
        [String((evt as any)?.location || '').trim(), String((evt as any)?.city || '').trim()]
          .filter(Boolean)
          .join(', ')
      );
      setIsEventApproved((evt as any)?.isApproved !== false);
      setCategories(cats as any);
      setGuests(g as any);
      setExpandedByCategoryId((prev) => {
        const next = { ...prev };
        for (const c of cats as any) if (next[c.id] === undefined) next[c.id] = true;
        return next;
      });
      try {
        setSentGuestIds(await guestService.getMessagedGuestIds(resolvedEventId));
      } catch (sentError) {
        console.warn('Guests web sent status load error:', sentError);
        setSentGuestIds(new Set());
      }
    } catch (e) {
      console.error('Guests web load error:', e);
      Alert.alert('שגיאה', 'לא ניתן לטעון את רשימת המוזמנים כרגע.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedEventId])
  );

  const guestCounts = useMemo(() => {
    const total = guests.reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const coming = guests
      .filter((g) => g.status === 'מגיע')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const maybe = guests
      .filter((g) => g.status === 'אולי מגיע')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const pending = guests
      .filter((g) => g.status === 'ממתין')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    const notComing = guests
      .filter((g) => g.status === 'לא מגיע')
      .reduce((sum, g) => sum + (g.numberOfPeople || 1), 0);
    return { total, coming, maybe, pending, notComing };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return guests.filter((g) => {
      const matchesSearch =
        !q || g.name.toLowerCase().includes(q) || String(g.phone || '').replace(/\s+/g, '').includes(q.replace(/\s+/g, ''));
      const matchesStatus = statusFilter ? g.status === statusFilter : true;
      return matchesSearch && matchesStatus;
    });
  }, [guests, searchQuery, statusFilter]);

  const guestsByCategory = useMemo(() => {
    const by: Record<string, GuestRow[]> = {};
    for (const g of filteredGuests) {
      const cid = String(g.category_id || '').trim();
      if (!cid) continue;
      if (!by[cid]) by[cid] = [];
      by[cid].push(g);
    }
    return by;
  }, [filteredGuests]);

  const groupItems = useMemo(() => {
    const catIds = new Set(categories.map((c) => String(c.id)));
    const uncategorized = filteredGuests.filter((g) => {
      const cid = String(g.category_id || '').trim();
      return !cid || !catIds.has(cid);
    });

    const items: Array<{ id: string; name: string; list: GuestRow[] }> = [];
    if (uncategorized.length) items.push({ id: '__uncategorized__', name: 'ללא קטגוריה', list: uncategorized });
    for (const c of categories) items.push({ id: String(c.id), name: c.name, list: guestsByCategory[String(c.id)] || [] });
    return items;
  }, [categories, filteredGuests, guestsByCategory]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(String(c.id), c.name);
    return m;
  }, [categories]);

  const openEdit = (g: GuestRow) => {
    setEditingGuest(g);
    setEditName(g.name || '');
    setEditPhone(g.phone || '');
    setEditStatus((g.status || 'ממתין') as GuestStatus);
    setEditPeopleCount(String(g.numberOfPeople || 1));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingGuest(null);
    setEditName('');
    setEditPhone('');
    setEditStatus('ממתין');
    setEditPeopleCount('1');
  };

  const handleSaveEdit = async () => {
    if (!editingGuest) return;
    const name = editName.trim();
    if (!name) return;
    const peopleCount = Math.max(1, Number.parseInt(editPeopleCount || '1', 10) || 1);
    try {
      await guestService.updateGuest(editingGuest.id, {
        name,
        phone: editPhone.trim(),
        status: editStatus,
        numberOfPeople: peopleCount,
      } as any);
      setGuests((prev) =>
        prev.map((g) =>
          g.id === editingGuest.id
            ? { ...g, name, phone: editPhone.trim(), status: editStatus, numberOfPeople: peopleCount }
            : g
        )
      );
      closeEdit();
    } catch (e: any) {
      console.error('Save guest error:', e);
      Alert.alert('שגיאה', e?.message === DUPLICATE_GUEST_ERROR ? `${editName.trim()} כבר קיים באירוע לפי מספר הטלפון.` : 'לא ניתן לשמור את השינויים.');
    }
  };

  const handleDeleteGuest = (guestId: string) => {
    const g = guests.find((x) => x.id === guestId);
    void confirmDestructiveAction('מחיקת אורח', `האם למחוק את ${g?.name || 'האורח'}?`, async () => {
      try {
        await guestService.deleteGuest(guestId);
        setGuests((prev) => prev.filter((x) => x.id !== guestId));
        setSelectedGuestIds((prev) => {
          const next = new Set(prev);
          next.delete(guestId);
          return next;
        });
        if (editingGuest?.id === guestId) closeEdit();
      } catch (e: any) {
        console.error('Delete guest error:', e);
        Alert.alert('שגיאה', e?.message === GUEST_DELETE_FAILED_ERROR ? GUEST_DELETE_FAILED_ERROR : 'לא ניתן למחוק את האורח.');
      }
    });
  };

  const toggleSelectGuest = (guestId: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const clearSelection = () => setSelectedGuestIds(new Set());

  const closeBulkDeleteConfirm = () => {
    if (bulkDeleteSubmitting) return;
    setBulkDeleteConfirmOpen(false);
  };

  const confirmDestructiveAction = async (title: string, message: string, onConfirm: () => Promise<void>) => {
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true;
      if (ok) await onConfirm();
      return;
    }

    await new Promise<void>((resolve) => {
      Alert.alert(title, message, [
        { text: 'ביטול', style: 'cancel', onPress: () => resolve() },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: () => {
            void onConfirm().finally(resolve);
          },
        },
      ]);
    });
  };

  const bulkDeleteSelected = () => {
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0) return;
    setBulkDeleteConfirmOpen(true);
  };

  const executeBulkDeleteSelected = async () => {
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0 || bulkDeleteSubmitting) return;

    setBulkDeleteSubmitting(true);
    try {
      await Promise.all(ids.map((id) => guestService.deleteGuest(id)));
      setGuests((prev) => prev.filter((g) => !ids.includes(g.id)));
      clearSelection();
      setBulkDeleteConfirmOpen(false);
    } catch (e: any) {
      console.error('Bulk delete error:', e);
      Alert.alert('שגיאה', e?.message === GUEST_DELETE_FAILED_ERROR ? GUEST_DELETE_FAILED_ERROR : 'לא ניתן למחוק את האורחים שנבחרו.');
    } finally {
      setBulkDeleteSubmitting(false);
    }
  };

  const importContacts = async () => {
    if (!resolvedEventId) return;
    router.push({ pathname: '/(couple)/select-category', params: { eventId: resolvedEventId } });
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    if (!guests.length) {
      Alert.alert('אין מוזמנים', 'הוסיפו מוזמנים לפני ייצוא הרשימה.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportGuestsToPdf({
        eventTitle,
        eventDate,
        eventLocation,
        categories,
        guests,
      });
    } catch (e) {
      console.error('Export PDF error:', e);
      Alert.alert('שגיאה', 'אירעה תקלה בהפקת ה-PDF. נסו שוב.');
    } finally {
      setExportingPdf(false);
    }
  };

  const openAdd = () => {
    if (!resolvedEventId) {
      Alert.alert('שגיאה', 'לא נמצא אירוע פעיל.');
      return;
    }
    setAddOpen(true);
    setAddStep('category');
    setAddNewCategoryName('');
    setAddGuestName('');
    setAddGuestPhone('');
    setAddSaving(false);
    const firstCatId = String(categories?.[0]?.id || '').trim();
    setAddSelectedCategoryId(firstCatId || '__uncategorized__');
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddStep('category');
    setAddSaving(false);
    setAddNewCategoryName('');
    setAddGuestName('');
    setAddGuestPhone('');
  };

  const handleAddCategoryInline = async () => {
    if (!resolvedEventId) return;
    const name = (addNewCategoryName || '').trim();
    if (!name) {
      Alert.alert('שגיאה', 'יש להזין שם קטגוריה');
      return;
    }
    if (addSaving) return;
    setAddSaving(true);
    try {
      const created = (await guestService.addGuestCategory(resolvedEventId, name, 'groom')) as any;
      setCategories((prev) => [...prev, created]);
      setExpandedByCategoryId((prev) => ({ ...prev, [String(created.id)]: true }));
      setAddSelectedCategoryId(String(created.id));
      setAddNewCategoryName('');
      setAddStep('guest');
    } catch (e: any) {
      console.error('Add category inline error:', e);
      const msg =
        e?.message ||
        e?.details ||
        e?.hint ||
        (typeof e === 'string' ? e : '') ||
        'לא ניתן להוסיף קטגוריה';
      Alert.alert('שגיאה', msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleAddGuestInline = async () => {
    if (!resolvedEventId) return;
    const name = (addGuestName || '').trim();
    const phone = (addGuestPhone || '').trim();
    if (!name) {
      Alert.alert('שגיאה', 'יש להזין שם מוזמן');
      return;
    }
    if (!phone) {
      Alert.alert('שגיאה', 'יש להזין מספר פלאפון');
      return;
    }
    if (addSaving) return;
    if (!isEventApproved && guests.length >= UNAPPROVED_EVENT_GUEST_LIMIT) {
      Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
      return;
    }
    setAddSaving(true);
    try {
      const categoryId =
        addSelectedCategoryId === '__uncategorized__' ? null : String(addSelectedCategoryId || '').trim() || null;
      const created = await guestService.addGuest(resolvedEventId, {
        name,
        phone,
        status: 'ממתין' as any,
        tableId: null,
        gift: 0,
        message: '',
        category_id: categoryId,
        numberOfPeople: 1,
      } as any);

      setGuests((prev) => {
        const next: GuestRow[] = [
          ...prev,
          {
            id: String(created.id),
            name: String(created.name || ''),
            phone: String(created.phone || ''),
            status: (created.status || 'ממתין') as GuestStatus,
            category_id: (created as any).category_id ?? null,
            numberOfPeople: (created as any).numberOfPeople ?? 1,
          },
        ];
        next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he', { sensitivity: 'base' }));
        return next;
      });

      setAddGuestName('');
      setAddGuestPhone('');
      Alert.alert('נוסף', 'המוזמן נוסף בהצלחה');
    } catch (e: any) {
      console.error('Add guest inline error:', e);
      if (e?.message === UNAPPROVED_EVENT_GUEST_LIMIT_ERROR) {
        Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
      } else if (e?.message === DUPLICATE_GUEST_ERROR) {
        Alert.alert('מוזמן כפול', `${addGuestName.trim()} כבר קיים באירוע לפי מספר הטלפון.`);
      } else {
        Alert.alert('שגיאה', 'לא ניתן להוסיף את המוזמן.');
      }
    } finally {
      setAddSaving(false);
    }
  };

  const openImport = () => {
    if (!resolvedEventId) {
      Alert.alert('שגיאה', 'לא נמצא אירוע פעיל.');
      return;
    }
    setImportSummary(null);
    setImportStatusText('');
    setImportBusy(false);
    setImportOpen(true);
  };

  const closeImport = () => {
    if (importBusy) return;
    setImportOpen(false);
    setImportSummary(null);
    setImportStatusText('');
  };

  const handleDownloadTemplate = () => {
    try {
      downloadGuestImportTemplate({ eventTitle });
    } catch (e: any) {
      console.error('Download template error:', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן להוריד את התבנית.');
    }
  };

  const handleImportExcel = async () => {
    if (!resolvedEventId || importBusy) return;

    let parsed: { rows: ParsedGuestRow[]; skipped: number; totalRows: number } | null = null;
    try {
      parsed = await pickAndParseGuestsFile();
    } catch (e: any) {
      console.error('Parse guests file error:', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לקרוא את הקובץ. ודאו שזהו קובץ Excel או CSV תקין.');
      return;
    }

    if (!parsed) return; // user cancelled
    if (parsed.rows.length === 0) {
      Alert.alert('לא נמצאו מוזמנים', 'לא נמצאו שורות תקינות בקובץ. ודאו שיש עמודת "שם" ולפחות שורה אחת עם נתונים.');
      return;
    }

    if (!isEventApproved) {
      const remaining = Math.max(0, UNAPPROVED_EVENT_GUEST_LIMIT - guests.length);
      if (parsed.rows.length > remaining) {
        Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
        return;
      }
    }

    setImportBusy(true);
    setImportSummary(null);
    try {
      setImportStatusText('יוצר קטגוריות חסרות...');

      // Normalize category names for robust matching (collapse whitespace, lowercase).
      const normalizeCatKey = (v: string) =>
        String(v || '')
          .trim()
          .replace(/\s+/g, ' ')
          .toLowerCase();

      // Map of normalized-name → existing category id.
      const categoryIdByName = new Map<string, string>();
      for (const c of categories) {
        categoryIdByName.set(normalizeCatKey(c.name), String(c.id));
      }

      const createdCategories: GuestCategoryRow[] = [];
      let mergedIntoExisting = 0;

      // Collect only category names that don't already exist.
      const uniqueNewNames = new Map<string, string>();
      for (const row of parsed.rows) {
        const catName = String(row.category || '').trim();
        if (!catName) continue;
        const key = normalizeCatKey(catName);
        if (categoryIdByName.has(key)) {
          // Category already exists — guests will be added to it automatically.
          mergedIntoExisting++;
          continue;
        }
        if (!uniqueNewNames.has(key)) uniqueNewNames.set(key, catName);
      }

      for (const [key, name] of uniqueNewNames) {
        try {
          const created = (await guestService.addGuestCategory(resolvedEventId, name, 'groom')) as any;
          categoryIdByName.set(key, String(created.id));
          createdCategories.push(created as GuestCategoryRow);
        } catch (e) {
          console.error('Create category during import error:', e);
        }
      }

      setImportStatusText(`מוסיף ${parsed.rows.length} מוזמנים...`);
      const guestsToAdd = parsed.rows.map((row) => {
        const key = normalizeCatKey(String(row.category || ''));
        const categoryId = key ? categoryIdByName.get(key) ?? null : null;
        return {
          name: row.name,
          phone: row.phone,
          status: 'ממתין' as GuestStatus,
          tableId: null,
          gift: 0,
          message: '',
          category_id: categoryId,
          numberOfPeople: row.numberOfPeople,
        };
      });

      const { added, duplicateSkipped, duplicateNames } = await guestService.addGuestsBatch(resolvedEventId, guestsToAdd as any);

      if (createdCategories.length) {
        setCategories((prev) => [...prev, ...createdCategories]);
      }
      if (added.length) {
        setGuests((prev) => {
          const next: GuestRow[] = [
            ...prev,
            ...added.map((g) => ({
              id: String(g.id),
              name: String(g.name || ''),
              phone: String(g.phone || ''),
              status: (g.status || 'ממתין') as GuestStatus,
              category_id: (g as any).category_id ?? null,
              numberOfPeople: (g as any).numberOfPeople ?? 1,
            })),
          ];
          next.sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'he', { sensitivity: 'base' })
          );
          return next;
        });
      }

      setImportSummary({
        added: added.length,
        duplicates: duplicateSkipped,
        duplicateNames,
        skipped: parsed.skipped,
        newCategories: createdCategories.length,
        mergedIntoExisting,
      });
      setImportStatusText('');
    } catch (e: any) {
      console.error('Import excel error:', e);
      if (e?.message === UNAPPROVED_EVENT_GUEST_LIMIT_ERROR) {
        Alert.alert('הגבלת מוזמנים', UNAPPROVED_EVENT_GUEST_LIMIT_ERROR);
      } else {
        Alert.alert('שגיאה', e?.message || 'אירעה שגיאה בעת ייבוא המוזמנים.');
      }
      setImportStatusText('');
    } finally {
      setImportBusy(false);
    }
  };

  void categoryNameById;

  const statusChipOptions: Array<{ key: GuestStatus | null; label: string; count: number; tone: 'primary' | 'success' | 'warning' | 'danger' }> =
    [
      { key: null, label: 'הכל', count: guestCounts.total, tone: 'primary' },
      { key: 'מגיע', label: 'אישרו', count: guestCounts.coming, tone: 'success' },
      { key: 'אולי מגיע', label: 'אולי מגיעים', count: guestCounts.maybe, tone: 'primary' },
      { key: 'ממתין', label: 'ממתינים', count: guestCounts.pending, tone: 'warning' },
      { key: 'לא מגיע', label: 'לא מגיעים', count: guestCounts.notComing, tone: 'danger' },
    ];

  const cardWidth = useMemo(() => {
    if (contentWidth < 640) return '100%';
    if (contentWidth < 980) return '48%';
    if (contentWidth < 1180) return '31.8%';
    return '19.2%';
  }, [contentWidth]);

  const guestItemWidth = useMemo(() => {
    // Responsive:
    // - narrow: 1 col
    // - laptop: 2 cols
    // - desktop+: compact fixed widths (cleaner, narrower cards)
    if (contentWidth < 720) return '100%';
    if (contentWidth < 1100) return '48%';
    if (contentWidth < 1480) return 286;
    if (contentWidth < 1720) return 266;
    return 246;
  }, [contentWidth]);

  // Compact cards look cleaner than large square tiles for guests lists.
  const useSquareGuestCards = false;

  const contentMaxWidth = contentWidth >= 1900 ? 1600 : contentWidth >= 1600 ? 1480 : 1320;
  const pageContentStyle = [
    styles.content,
    useManagerChrome ? styles.contentAdmin : null,
    !useManagerChrome ? { maxWidth: contentMaxWidth } : null,
  ];
  const adminHeaderStats = [
    { key: 'total', label: 'מוזמנים', value: guestCounts.total },
    { key: 'coming', label: 'אישרו', value: guestCounts.coming },
    { key: 'pending', label: 'ממתינים', value: guestCounts.pending },
    { key: 'groups', label: 'קטגוריות', value: groupItems.length },
  ];
  const addIsCategoryStep = addStep === 'category';
  const addSelectedCategoryName =
    addSelectedCategoryId === '__uncategorized__'
      ? 'ללא קטגוריה'
      : String(categories.find((c) => String(c.id) === String(addSelectedCategoryId))?.name || '—');
  const addStepMeta = addIsCategoryStep
    ? {
        title: 'הוספת מוזמן',
        subtitle: 'בחרו איך לשייך את המוזמן כדי לשמור על רשימה מסודרת ונוחה לניהול.',
        badge: 'שלב 1 מתוך 2',
        icon: 'albums-outline' as const,
      }
    : {
        title: 'פרטי המוזמן',
        subtitle: 'מלאו את פרטי הקשר וניצור עבורו רשומת RSVP חדשה עם הקטגוריה שבחרתם.',
        badge: 'שלב 2 מתוך 2',
        icon: 'person-circle-outline' as const,
      };

  return (
    <View style={[styles.page, isAdminRouteContext ? styles.pageAdmin : null]}>
      <PageContentComponent
        style={useEmbeddedWebShell ? pageContentStyle : undefined}
        contentContainerStyle={!useEmbeddedWebShell ? pageContentStyle : undefined}
        showsVerticalScrollIndicator={!useEmbeddedWebShell ? false : undefined}
      >
        {useManagerChrome ? (
          <View style={styles.adminHeroShell}>
            <AdminWebPageHeader
              eyebrow="ניהול אירוע"
              title="אישורי הגעה"
              subtitle="ניהול RSVP, חיפוש מהיר, סינון סטטוסים וסידור המוזמנים לפי קטגוריות מתוך מסך אחד."
              subtitleContent={
                <View style={styles.adminHeaderMetaBar}>
                  <View style={styles.adminHeaderMetaGroup}>
                    {adminHeaderStats.map((item) => (
                      <View key={item.key} style={styles.adminHeaderStatChip}>
                        <Text style={styles.adminHeaderStatValue}>{item.value}</Text>
                        <Text style={styles.adminHeaderStatLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.adminHeaderActionsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="ייצוא PDF"
                      onPress={handleExportPdf}
                      disabled={exportingPdf}
                      style={({ hovered, pressed }: any) => [
                        styles.adminHeaderImportBtn,
                        Platform.OS === 'web' && hovered ? styles.adminHeaderImportBtnHover : null,
                        pressed ? styles.btnPressed : null,
                        exportingPdf ? styles.btnDisabled : null,
                      ]}
                    >
                      {exportingPdf ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                      )}
                      <Text style={styles.adminHeaderImportBtnText}>{exportingPdf ? 'מפיק PDF…' : 'ייצוא PDF'}</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="ייבוא מאקסל"
                      onPress={openImport}
                      style={({ hovered, pressed }: any) => [
                        styles.adminHeaderImportBtn,
                        Platform.OS === 'web' && hovered ? styles.adminHeaderImportBtnHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                      <Text style={styles.adminHeaderImportBtnText}>ייבוא מאקסל</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="הוסף מוזמנים"
                      onPress={openAdd}
                      style={({ hovered, pressed }: any) => [
                        styles.adminHeaderActionBtn,
                        Platform.OS === 'web' && hovered ? styles.adminHeaderActionBtnHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Ionicons name="add" size={16} color={colors.white} />
                      <Text style={styles.adminHeaderActionBtnText}>הוסף מוזמנים</Text>
                    </Pressable>
                  </View>
                </View>
              }
              actions={
                <View style={styles.adminHeaderSelectionBadge}>
                  <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                  <Text style={styles.adminHeaderSelectionText} numberOfLines={1}>
                    {eventTitle || 'אירוע פעיל'}
                  </Text>
                </View>
              }
              showNav={false}
              useDefaultActions={false}
              leading={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={() => router.replace(backHref as any)}
                  style={({ hovered, pressed }: any) => [
                    styles.adminBackBtn,
                    Platform.OS === 'web' && hovered ? styles.adminBackBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.text} />
                  <Text style={styles.adminBackBtnText}>חזרה</Text>
                </Pressable>
              }
            />
          </View>
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="חזרה"
                onPress={() => router.replace(backHref as any)}
                style={({ hovered, pressed }: any) => [
                  styles.backBtn,
                  Platform.OS === 'web' && hovered ? styles.backBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="arrow-forward" size={18} color={colors.gray[800]} />
              </Pressable>

              <View style={styles.heroTextWrap}>
                <Text style={styles.heroEyebrow}>ניהול מוזמנים</Text>
                <Text style={styles.heroTitle}>אישורי הגעה</Text>
                <Text style={styles.heroSubtitle}>
                  {eventTitle ? `${eventTitle} · ניהול מוזמנים, חיפוש מהיר וסידור לפי קטגוריות.` : 'ניהול מוזמנים, חיפוש מהיר וסידור לפי קטגוריות.'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <MetricCard
            title='סה״כ מוזמנים'
            value={guestCounts.total}
            tone="primary"
            width={cardWidth}
            admin={useManagerChrome}
          />
          <MetricCard title="אישרו הגעה" value={guestCounts.coming} hint={pct(guestCounts.coming, guestCounts.total)} tone="success" width={cardWidth} admin={useManagerChrome} />
          <MetricCard title="אולי מגיעים" value={guestCounts.maybe} hint={pct(guestCounts.maybe, guestCounts.total)} tone="primary" width={cardWidth} admin={useManagerChrome} />
          <MetricCard title="ממתינים לתשובה" value={guestCounts.pending} hint={pct(guestCounts.pending, guestCounts.total)} tone="warning" width={cardWidth} admin={useManagerChrome} />
          <MetricCard title="לא מגיעים" value={guestCounts.notComing} hint={pct(guestCounts.notComing, guestCounts.total)} tone="danger" width={cardWidth} admin={useManagerChrome} />
        </View>

        {/* Filter Bar */}
        <View style={[styles.filterBar, useManagerChrome ? styles.filterBarAdmin : null, isNarrow ? styles.filterBarNarrow : styles.filterBarWide]}>
          <View style={[styles.filterPrimaryRow, isNarrow ? styles.filterPrimaryRowNarrow : null]}>
            <View style={[styles.searchWrap, isNarrow ? { width: '100%' } : { width: 420 }]}>
              <View style={styles.searchIconRight}>
                <Ionicons name="search" size={18} color={colors.gray[500]} />
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="חיפוש מוזמנים לפי שם או טלפון..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInput}
              />
            </View>

            {useManagerChrome ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={filtersOpen ? 'הסתר מסננים' : 'הצג מסננים'}
                onPress={() => setFiltersOpen((prev) => !prev)}
                style={({ hovered, pressed }: any) => [
                  styles.filterToggleBtn,
                  filtersOpen ? styles.filterToggleBtnActive : null,
                  isNarrow ? styles.filterToggleBtnNarrow : null,
                  Platform.OS === 'web' && hovered ? styles.filterToggleBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name={filtersOpen ? 'chevron-up-outline' : 'options-outline'} size={18} color={filtersOpen ? colors.white : colors.primary} />
                <Text style={[styles.filterToggleBtnText, filtersOpen ? styles.filterToggleBtnTextActive : null]}>
                  {filtersOpen ? 'הסתר סינון' : 'סינון'}
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.heroActionsRow, isNarrow ? styles.heroActionsRowNarrow : null]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ייצוא PDF"
                  onPress={handleExportPdf}
                  disabled={exportingPdf}
                  style={({ hovered, pressed }: any) => [
                    styles.importGuestsBtn,
                    isNarrow ? styles.importGuestsBtnNarrow : null,
                    Platform.OS === 'web' && hovered ? styles.importGuestsBtnHover : null,
                    pressed ? styles.btnPressed : null,
                    exportingPdf ? styles.btnDisabled : null,
                  ]}
                >
                  {exportingPdf ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  )}
                  <Text style={styles.importGuestsBtnText}>{exportingPdf ? 'מפיק PDF…' : 'ייצוא PDF'}</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ייבוא מאקסל"
                  onPress={openImport}
                  style={({ hovered, pressed }: any) => [
                    styles.importGuestsBtn,
                    isNarrow ? styles.importGuestsBtnNarrow : null,
                    Platform.OS === 'web' && hovered ? styles.importGuestsBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={styles.importGuestsBtnText}>ייבוא מאקסל</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="הוסף מוזמנים"
                  onPress={openAdd}
                  style={({ hovered, pressed }: any) => [
                    styles.addGuestsBtn,
                    isNarrow ? styles.addGuestsBtnNarrow : null,
                    Platform.OS === 'web' && hovered ? styles.addGuestsBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="add" size={18} color={colors.white} />
                  <Text style={styles.addGuestsBtnText}>הוסף מוזמנים</Text>
                </Pressable>
              </View>
            )}
          </View>

          {!useManagerChrome || filtersOpen ? (
            <View style={styles.chipsRow}>
              {statusChipOptions.map((opt) => (
                <StatusChip
                  key={String(opt.key)}
                  active={statusFilter === opt.key}
                  label={opt.label}
                  count={opt.count}
                  tone={opt.tone}
                  onPress={() => setStatusFilter(opt.key)}
                />
              ))}
            </View>
          ) : null}

          {selectedGuestIds.size > 0 ? (
            <View style={styles.bulkRow}>
              <View style={styles.bulkInfo}>
                <View style={styles.bulkCountBadge}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                  <Text style={styles.bulkCountText}>{selectedGuestIds.size}</Text>
                </View>
                <View style={styles.bulkTextWrap}>
                  <Text style={styles.bulkText}>נבחרו {selectedGuestIds.size} אורחים</Text>
                  <Text style={styles.bulkHint}>אפשר לנקות את הבחירה או למחוק את כל המסומנים</Text>
                </View>
              </View>
              <View style={styles.bulkActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="נקה בחירה"
                  onPress={clearSelection}
                  style={({ hovered, pressed }: any) => [
                    styles.bulkBtn,
                    Platform.OS === 'web' && hovered ? styles.bulkBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="close" size={16} color={colors.gray[700]} />
                  <Text style={styles.bulkBtnText}>נקה בחירה</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="מחק נבחרים"
                  onPress={bulkDeleteSelected}
                  style={({ hovered, pressed }: any) => [
                    styles.bulkDangerBtn,
                    Platform.OS === 'web' && hovered ? styles.bulkDangerBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.white} />
                  <Text style={styles.bulkDangerBtnText}>מחק נבחרים</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* Groups */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>טוען מוזמנים...</Text>
          </View>
        ) : (
          <View style={styles.groups}>
            {groupItems.length === 0 ? (
              <EmptyState onAdd={openAdd} />
            ) : (
              groupItems.map((cat) => {
                const list = cat.list;
                const isExpanded = expandedByCategoryId[String(cat.id)] ?? true;
                const counts = groupCounts(list);
                return (
                  <View key={String(cat.id)} style={[styles.groupCard, useManagerChrome ? styles.groupCardAdmin : null]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`פתיחה/סגירה של ${cat.name}`}
                      onPress={() =>
                        setExpandedByCategoryId((prev) => ({ ...prev, [String(cat.id)]: !(prev[String(cat.id)] ?? true) }))
                      }
                      style={({ hovered, pressed }: any) => [
                        styles.groupHeader,
                        Platform.OS === 'web' && hovered ? styles.groupHeaderHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <View style={styles.groupHeaderLeft}>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color={colors.gray[500]}
                          style={isExpanded ? undefined : (styles.chevronCollapsed as any)}
                        />
                        <View style={styles.groupIconWrap}>
                          <Ionicons name={cat.id === '__uncategorized__' ? 'albums-outline' : 'folder-open-outline'} size={17} color={colors.primary} />
                        </View>
                        <View style={styles.groupTitleWrap}>
                          <Text style={styles.groupTitle} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <View style={styles.groupPill}>
                            <Text style={styles.groupPillText}>{list.length} מוזמנים</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.groupHeaderRight}>
                        <MiniStatDot label={`${counts.coming} אישרו`} tone="success" />
                        <MiniStatDot label={`${counts.maybe} אולי`} tone="primary" />
                        <MiniStatDot label={`${counts.pending} ממתינים`} tone="warning" />
                        <MiniStatDot label={`${counts.notComing} לא מגיעים`} tone="danger" />
                      </View>
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.groupBody}>
                        {list.length === 0 ? (
                          <Text style={styles.groupEmpty}>אין תוצאות בקבוצה הזו</Text>
                        ) : (
                          list.map((g) => (
                            <GuestListRow
                              key={g.id}
                              guest={g}
                              hasSentMessage={sentGuestIds.has(g.id)}
                              width={guestItemWidth}
                              square={useSquareGuestCards}
                              checked={selectedGuestIds.has(g.id)}
                              onToggleCheck={() => toggleSelectGuest(g.id)}
                              onEdit={() => openEdit(g)}
                              onDelete={() => handleDeleteGuest(g.id)}
                            />
                          ))
                        )}
                      </View>
                    ) : (
                      <View style={styles.groupCollapsedBar} />
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </PageContentComponent>

      <Modal visible={bulkDeleteConfirmOpen} transparent animationType="fade" onRequestClose={closeBulkDeleteConfirm}>
        <Pressable style={styles.modalOverlay} onPress={closeBulkDeleteConfirm}>
          <Pressable style={[styles.modalCard, styles.confirmDeleteCard]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <View style={[styles.modalIconBadge, styles.confirmDeleteIconBadge]}>
                  <Ionicons name="trash-outline" size={22} color="#BE123C" />
                </View>
                <View style={styles.modalTitleTextWrap}>
                  <Text style={styles.modalBadgeText}>פעולה בלתי הפיכה</Text>
                  <Text style={styles.modalTitle}>מחיקת אורחים נבחרים</Text>
                  <Text style={styles.modalSubtitle}>האורחים יימחקו מרשימת אישורי ההגעה ולא יהיה ניתן לשחזר אותם מתוך המערכת.</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeBulkDeleteConfirm}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
                disabled={bulkDeleteSubmitting}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <View style={styles.confirmDeleteBody}>
              <View style={styles.confirmDeleteSummary}>
                <Text style={styles.confirmDeleteCount}>{selectedGuestIds.size}</Text>
                <Text style={styles.confirmDeleteCountLabel}>אורחים מסומנים למחיקה</Text>
              </View>
              <Text style={styles.confirmDeleteText}>האם אתה בטוח שברצונך למחוק את האורחים האלו?</Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ביטול"
                onPress={closeBulkDeleteConfirm}
                style={({ hovered, pressed }: any) => [
                  styles.modalSecondaryBtn,
                  Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                  bulkDeleteSubmitting ? styles.modalPrimaryBtnDisabled : null,
                ]}
                disabled={bulkDeleteSubmitting}
              >
                <Ionicons name="close-outline" size={18} color={colors.gray[800]} />
                <Text style={styles.modalSecondaryBtnText}>ביטול</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="אישור מחיקה"
                onPress={() => void executeBulkDeleteSelected()}
                style={({ hovered, pressed }: any) => [
                  styles.modalDangerBtn,
                  Platform.OS === 'web' && hovered ? styles.modalDangerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                  bulkDeleteSubmitting ? styles.modalPrimaryBtnDisabled : null,
                ]}
                disabled={bulkDeleteSubmitting}
              >
                <Ionicons name="trash-outline" size={18} color={colors.white} />
                <Text style={styles.modalDangerBtnText}>{bulkDeleteSubmitting ? 'מוחק...' : 'מחק אורחים'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add guest modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <Pressable style={styles.modalOverlay} onPress={closeAdd}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 720) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <View style={styles.modalIconBadge}>
                  <Ionicons name={addStepMeta.icon} size={22} color={colors.primary} />
                </View>
                <View style={styles.modalTitleTextWrap}>
                  <Text style={styles.modalBadgeText}>{addStepMeta.badge}</Text>
                  <Text style={styles.modalTitle}>{addStepMeta.title}</Text>
                  <Text style={styles.modalSubtitle}>{addStepMeta.subtitle}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeAdd}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.stepperRow}>
                <View style={[styles.stepperItem, styles.stepperItemActive]}>
                  <View style={[styles.stepperDot, styles.stepperDotActive]}>
                    <Text style={[styles.stepperDotText, styles.stepperDotTextActive]}>1</Text>
                  </View>
                  <Text style={[styles.stepperLabel, styles.stepperLabelActive]}>בחירת קטגוריה</Text>
                </View>
                <View style={[styles.stepperDivider, !addIsCategoryStep ? styles.stepperDividerDone : null]} />
                <View style={[styles.stepperItem, !addIsCategoryStep ? styles.stepperItemActive : null]}>
                  <View style={[styles.stepperDot, !addIsCategoryStep ? styles.stepperDotActive : null]}>
                    <Text style={[styles.stepperDotText, !addIsCategoryStep ? styles.stepperDotTextActive : null]}>2</Text>
                  </View>
                  <Text style={[styles.stepperLabel, !addIsCategoryStep ? styles.stepperLabelActive : null]}>פרטי מוזמן</Text>
                </View>
              </View>

              {addIsCategoryStep ? (
                <>
                  <View style={styles.addSectionCard}>
                    <View style={styles.addSectionHeader}>
                      <View style={styles.addSectionIconWrap}>
                        <Ionicons name="pricetags-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.addSectionTextWrap}>
                        <Text style={styles.addSectionTitle}>בחירת קטגוריה</Text>
                        <Text style={styles.addHint}>בחרו קטגוריה קיימת כדי לתייג את המוזמן, או צרו קטגוריה חדשה במקום.</Text>
                      </View>
                    </View>

                    <View style={styles.categoryPickList}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ללא קטגוריה"
                        onPress={() => setAddSelectedCategoryId('__uncategorized__')}
                        style={({ hovered, pressed }: any) => [
                          styles.categoryPickItem,
                          addSelectedCategoryId === '__uncategorized__' ? styles.categoryPickItemActive : null,
                          Platform.OS === 'web' && hovered && addSelectedCategoryId !== '__uncategorized__'
                            ? styles.categoryPickItemHover
                            : null,
                          pressed ? styles.btnPressed : null,
                        ]}
                      >
                        <View style={styles.categoryPickContent}>
                          <View style={[styles.categoryPickLeadingIcon, addSelectedCategoryId === '__uncategorized__' ? styles.categoryPickLeadingIconActive : null]}>
                            <Ionicons
                              name="remove-circle-outline"
                              size={16}
                              color={addSelectedCategoryId === '__uncategorized__' ? colors.white : colors.primary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.categoryPickText,
                              addSelectedCategoryId === '__uncategorized__' ? styles.categoryPickTextActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            ללא קטגוריה
                          </Text>
                        </View>
                        {addSelectedCategoryId === '__uncategorized__' ? (
                          <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                        ) : (
                          <Ionicons name="chevron-back" size={16} color={colors.gray[400]} />
                        )}
                      </Pressable>

                      {categories.map((c) => {
                        const id = String(c.id);
                        const active = addSelectedCategoryId === id;
                        return (
                          <Pressable
                            key={id}
                            accessibilityRole="button"
                            accessibilityLabel={`קטגוריה ${c.name}`}
                            onPress={() => setAddSelectedCategoryId(id)}
                            style={({ hovered, pressed }: any) => [
                              styles.categoryPickItem,
                              active ? styles.categoryPickItemActive : null,
                              Platform.OS === 'web' && hovered && !active ? styles.categoryPickItemHover : null,
                              pressed ? styles.btnPressed : null,
                            ]}
                          >
                            <View style={styles.categoryPickContent}>
                              <View style={[styles.categoryPickLeadingIcon, active ? styles.categoryPickLeadingIconActive : null]}>
                                <Ionicons name="folder-open-outline" size={16} color={active ? colors.white : colors.primary} />
                              </View>
                              <Text style={[styles.categoryPickText, active ? styles.categoryPickTextActive : null]} numberOfLines={1}>
                                {c.name}
                              </Text>
                            </View>
                            {active ? <Ionicons name="checkmark-circle" size={20} color={colors.white} /> : <Ionicons name="chevron-back" size={16} color={colors.gray[400]} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.addSectionCard}>
                    <View style={styles.addSectionHeader}>
                      <View style={styles.addSectionIconWrap}>
                        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.addSectionTextWrap}>
                        <Text style={styles.addSectionTitle}>קטגוריה חדשה</Text>
                        <Text style={styles.addHint}>צרו קטגוריה חדשה אם הרשימה הקיימת לא מתאימה למוזמן שאתם מוסיפים עכשיו.</Text>
                      </View>
                    </View>

                    <Field label="שם הקטגוריה">
                      <View style={styles.inlineRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="הוסף קטגוריה"
                          onPress={handleAddCategoryInline}
                          style={({ hovered, pressed }: any) => [
                            styles.inlineAddBtn,
                            Platform.OS === 'web' && hovered ? styles.inlineAddBtnHover : null,
                            pressed ? styles.btnPressed : null,
                            addSaving ? styles.inlineAddBtnDisabled : null,
                          ]}
                          disabled={addSaving}
                        >
                          <Ionicons name="add" size={18} color={colors.white} />
                          <Text style={styles.inlineAddBtnText}>{addSaving ? 'מוסיף...' : 'הוסף'}</Text>
                        </Pressable>
                        <TextInput
                          value={addNewCategoryName}
                          onChangeText={setAddNewCategoryName}
                          placeholder="למשל: משפחה / חברים"
                          placeholderTextColor={colors.gray[500]}
                          style={[styles.modalInput, { flex: 1 }]}
                        />
                      </View>
                    </Field>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.selectedCategoryCard}>
                    <View style={styles.selectedCategoryIconWrap}>
                      <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.selectedCategoryTextWrap}>
                      <Text style={styles.selectedCategoryLabel}>קטגוריה שנבחרה</Text>
                      <Text style={styles.selectedCategoryValue} numberOfLines={1}>
                        {addSelectedCategoryName}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="שנה קטגוריה"
                      onPress={() => setAddStep('category')}
                      style={({ hovered, pressed }: any) => [
                        styles.selectedCategoryEditBtn,
                        Platform.OS === 'web' && hovered ? styles.selectedCategoryEditBtnHover : null,
                        pressed ? styles.btnPressed : null,
                      ]}
                    >
                      <Ionicons name="create-outline" size={15} color={colors.primary} />
                      <Text style={styles.selectedCategoryEditBtnText}>שנה</Text>
                    </Pressable>
                  </View>

                  <View style={styles.addSectionCard}>
                    <View style={styles.addSectionHeader}>
                      <View style={styles.addSectionIconWrap}>
                        <Ionicons name="person-outline" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.addSectionTextWrap}>
                        <Text style={styles.addSectionTitle}>פרטי איש הקשר</Text>
                        <Text style={styles.addHint}>מלאו שם מלא ומספר טלפון כדי שהמוזמן יתווסף מיידית לרשימת אישורי ההגעה.</Text>
                      </View>
                    </View>

                    <Field label="שם מלא">
                      <TextInput
                        value={addGuestName}
                        onChangeText={setAddGuestName}
                        placeholder="למשל: ישראל ישראלי"
                        placeholderTextColor={colors.gray[500]}
                        style={styles.modalInput}
                      />
                    </Field>

                    <Field label="מספר פלאפון">
                      <TextInput
                        value={addGuestPhone}
                        onChangeText={setAddGuestPhone}
                        placeholder="050-0000000"
                        placeholderTextColor={colors.gray[500]}
                        style={[styles.modalInput, styles.inputLtr]}
                        keyboardType="phone-pad"
                      />
                    </Field>
                  </View>
                </>
              )}

              <View style={{ height: 10 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              {addStep === 'guest' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="חזרה"
                  onPress={() => setAddStep('category')}
                  style={({ hovered, pressed }: any) => [
                    styles.modalSecondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.gray[800]} />
                  <Text style={styles.modalSecondaryBtnText}>חזרה</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ייבוא מאנשי קשר"
                  onPress={() => {
                    closeAdd();
                    importContacts();
                  }}
                  style={({ hovered, pressed }: any) => [
                    styles.modalSecondaryBtn,
                    Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="people-outline" size={18} color={colors.gray[800]} />
                  <Text style={styles.modalSecondaryBtnText}>ייבוא מאנשי קשר</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={addStep === 'category' ? 'המשך' : 'הוסף'}
                onPress={() => {
                  if (addStep === 'category') setAddStep('guest');
                  else void handleAddGuestInline();
                }}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                  addSaving ? styles.modalPrimaryBtnDisabled : null,
                ]}
                disabled={addSaving}
              >
                <Ionicons name={addStep === 'category' ? 'arrow-back' : 'person-add'} size={18} color={colors.white} />
                <Text style={styles.modalPrimaryBtnText}>
                  {addSaving ? (addStep === 'category' ? 'טוען...' : 'מוסיף...') : addStep === 'category' ? 'המשך' : 'הוסף מוזמן'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Import from Excel modal */}
      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={closeImport}>
        <Pressable style={styles.modalOverlay} onPress={closeImport}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 680) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ייבוא מוזמנים מאקסל</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeImport}
                disabled={importBusy}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {importSummary ? (
                <View style={styles.importSummaryBox}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                  <Text style={styles.importSummaryTitle}>הייבוא הושלם</Text>
                  <View style={styles.importSummaryRows}>
                    <View style={styles.importSummaryRow}>
                      <Text style={styles.importSummaryValue}>{importSummary.added}</Text>
                      <Text style={styles.importSummaryLabel}>מוזמנים נוספו</Text>
                    </View>
                    {importSummary.newCategories > 0 ? (
                      <View style={styles.importSummaryRow}>
                        <Text style={styles.importSummaryValue}>{importSummary.newCategories}</Text>
                        <Text style={styles.importSummaryLabel}>קטגוריות חדשות נוצרו</Text>
                      </View>
                    ) : null}
                    {importSummary.mergedIntoExisting > 0 ? (
                      <View style={styles.importSummaryRow}>
                        <Text style={styles.importSummaryValue}>{importSummary.mergedIntoExisting}</Text>
                        <Text style={styles.importSummaryLabel}>מוזמנים שויכו לקטגוריה קיימת</Text>
                      </View>
                    ) : null}
                    {importSummary.duplicates > 0 ? (
                      <View style={styles.importDuplicatesBox}>
                        <View style={styles.importDuplicatesHeader}>
                          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                          <Text style={styles.importDuplicatesTitle}>
                            {importSummary.duplicates} מוזמן{importSummary.duplicates !== 1 ? 'ים' : ''} דולג{importSummary.duplicates !== 1 ? 'ו' : ''} (טלפון כפול)
                          </Text>
                        </View>
                        {importSummary.duplicateNames.map((name, idx) => (
                          <Text key={idx} style={styles.importDuplicateName}>
                            • {name} כבר קיים
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {importSummary.skipped > 0 ? (
                      <View style={styles.importSummaryRow}>
                        <Text style={styles.importSummaryValue}>{importSummary.skipped}</Text>
                        <Text style={styles.importSummaryLabel}>שורות ללא שם דולגו</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.importIntroBox}>
                    <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                    <Text style={styles.importIntroText}>
                      העלו קובץ Excel (xlsx/xls) או CSV עם המוזמנים. הקובץ צריך לכלול עמודות עם הכותרות הבאות:
                    </Text>
                  </View>

                  <View style={styles.importColsTable}>
                    {[
                      { col: 'שם', req: 'חובה', desc: 'שם המוזמן' },
                      { col: 'טלפון', req: 'מומלץ', desc: 'מספר נייד, למשל 0501234567' },
                      { col: 'קטגוריה', req: 'רשות', desc: 'שם קבוצה (תיווצר אוטומטית אם לא קיימת)' },
                    ].map((row) => (
                      <View key={row.col} style={styles.importColRow}>
                        <View style={styles.importColNameWrap}>
                          <Text style={styles.importColName}>{row.col}</Text>
                          <Text
                            style={[
                              styles.importColReq,
                              row.req === 'חובה' ? styles.importColReqRequired : null,
                            ]}
                          >
                            {row.req}
                          </Text>
                        </View>
                        <Text style={styles.importColDesc}>{row.desc}</Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="הורד תבנית אקסל"
                    onPress={handleDownloadTemplate}
                    disabled={importBusy}
                    style={({ hovered, pressed }: any) => [
                      styles.importTemplateLink,
                      Platform.OS === 'web' && hovered ? styles.importTemplateLinkHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Ionicons name="download-outline" size={16} color={colors.primary} />
                    <Text style={styles.importTemplateLinkText}>הורדת קובץ תבנית לדוגמה</Text>
                  </Pressable>

                  {importBusy ? (
                    <View style={styles.importBusyBox}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.importBusyText}>{importStatusText || 'מייבא...'}</Text>
                    </View>
                  ) : null}
                </>
              )}

              <View style={{ height: 10 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              {importSummary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="סיום"
                  onPress={closeImport}
                  style={({ hovered, pressed }: any) => [
                    styles.modalPrimaryBtn,
                    Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                    pressed ? styles.btnPressed : null,
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color={colors.white} />
                  <Text style={styles.modalPrimaryBtnText}>סיום</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ביטול"
                    onPress={closeImport}
                    disabled={importBusy}
                    style={({ hovered, pressed }: any) => [
                      styles.modalSecondaryBtn,
                      Platform.OS === 'web' && hovered ? styles.modalSecondaryBtnHover : null,
                      pressed ? styles.btnPressed : null,
                    ]}
                  >
                    <Text style={styles.modalSecondaryBtnText}>ביטול</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="בחר קובץ"
                    onPress={handleImportExcel}
                    disabled={importBusy}
                    style={({ hovered, pressed }: any) => [
                      styles.modalPrimaryBtn,
                      Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                      pressed ? styles.btnPressed : null,
                      importBusy ? styles.modalPrimaryBtnDisabled : null,
                    ]}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
                    <Text style={styles.modalPrimaryBtnText}>{importBusy ? 'מייבא...' : 'בחר קובץ וייבא'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable style={styles.modalOverlay} onPress={closeEdit}>
          <Pressable style={[styles.modalCard, { maxHeight: Math.min(0.92 * windowHeight, 680) }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>עריכת אורח</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="סגירה"
                onPress={closeEdit}
                style={({ hovered, pressed }: any) => [
                  styles.modalCloseBtn,
                  Platform.OS === 'web' && hovered ? styles.modalCloseBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.gray[700]} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Field label="שם">
                <TextInput value={editName} onChangeText={setEditName} placeholder="שם מלא" placeholderTextColor={colors.gray[500]} style={styles.modalInput} />
              </Field>
              <Field label="טלפון">
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="050-0000000"
                  placeholderTextColor={colors.gray[500]}
                  style={[styles.modalInput, styles.inputLtr]}
                />
              </Field>
              <Field label="סטטוס">
                <View style={styles.statusRow}>
                  <StatusPill active={editStatus === 'מגיע'} tone="success" label="מגיע" onPress={() => setEditStatus('מגיע')} />
                  <StatusPill active={editStatus === 'אולי מגיע'} tone="primary" label="אולי מגיע" onPress={() => setEditStatus('אולי מגיע')} />
                  <StatusPill active={editStatus === 'ממתין'} tone="warning" label="ממתין" onPress={() => setEditStatus('ממתין')} />
                  <StatusPill active={editStatus === 'לא מגיע'} tone="danger" label="לא מגיע" onPress={() => setEditStatus('לא מגיע')} />
                </View>
              </Field>
              <Field label="מספר אנשים">
                <TextInput
                  value={editPeopleCount}
                  onChangeText={setEditPeopleCount}
                  placeholder="1"
                  placeholderTextColor={colors.gray[500]}
                  style={[styles.modalInput, styles.inputLtr]}
                  keyboardType="numeric"
                />
              </Field>
              <View style={{ height: 14 }} />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מחק"
                onPress={() => (editingGuest ? handleDeleteGuest(editingGuest.id) : null)}
                style={({ hovered, pressed }: any) => [
                  styles.modalDangerBtn,
                  Platform.OS === 'web' && hovered ? styles.modalDangerBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.white} />
                <Text style={styles.modalDangerBtnText}>מחק</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="שמור"
                onPress={handleSaveEdit}
                style={({ hovered, pressed }: any) => [
                  styles.modalPrimaryBtn,
                  Platform.OS === 'web' && hovered ? styles.modalPrimaryBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.white} />
                <Text style={styles.modalPrimaryBtnText}>שמור</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function pct(n: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function groupCounts(list: GuestRow[]) {
  const coming = list.filter((g) => g.status === 'מגיע').length;
  const maybe = list.filter((g) => g.status === 'אולי מגיע').length;
  const pending = list.filter((g) => g.status === 'ממתין').length;
  const notComing = list.filter((g) => g.status === 'לא מגיע').length;
  return { coming, maybe, pending, notComing };
}

function toneColor(tone: 'primary' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return { main: '#10B981', soft: 'rgba(16,185,129,0.12)', text: '#065F46' };
  if (tone === 'warning') return { main: '#F59E0B', soft: 'rgba(245,158,11,0.12)', text: '#92400E' };
  if (tone === 'danger') return { main: '#F43F5E', soft: 'rgba(244,63,94,0.12)', text: '#9F1239' };
  return { main: colors.primary, soft: 'rgba(6,23,62,0.10)', text: colors.primary };
}

function guestInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'א';
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`;
}

function MetricCard({
  title,
  value,
  hint,
  tone,
  width,
  admin,
}: {
  title: string;
  value: number;
  hint?: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  width: any;
  admin?: boolean;
}) {
  const c = toneColor(tone);
  const iconName =
    tone === 'success'
      ? 'checkmark-circle-outline'
      : tone === 'warning'
        ? 'time-outline'
        : tone === 'danger'
          ? 'close-circle-outline'
          : 'people-outline';
  const adminSubtitle =
    tone === 'success'
      ? 'האורחים שכבר אישרו הגעה ומוכנים לאירוע'
      : tone === 'warning'
        ? 'מוזמנים שעדיין דורשים מעקב ותזכורת'
        : tone === 'danger'
          ? 'אורחים שסימנו שלא יגיעו לאירוע'
          : 'תמונת מצב כללית של רשימת המוזמנים';
  const adminBadgeText = hint || (tone === 'primary' ? 'מבט כללי' : 'יחס מהרשימה');

  if (admin) {
    return (
      <View style={[styles.metricCard, styles.metricCardAdmin, { width }, { borderRightColor: c.main }]}>
        <View style={[styles.metricGlow, styles.metricGlowAdmin, { backgroundColor: c.soft }]} />
        <View style={styles.metricAdminDecorWrap} pointerEvents="none">
          <View style={[styles.metricAdminDecorOrb, { backgroundColor: c.soft }]} />
        </View>

        <View style={styles.metricAdminHeader}>
          <View style={[styles.metricIconWrap, styles.metricIconWrapAdmin, { backgroundColor: c.soft, borderColor: 'rgba(255,255,255,0.82)' }]}>
            <Ionicons name={iconName} size={18} color={c.main} />
          </View>

          <View style={[styles.metricAdminBadge, { backgroundColor: c.soft }]}>
            <View style={[styles.metricAdminBadgeDot, { backgroundColor: c.main }]} />
            <Text style={[styles.metricAdminBadgeText, { color: c.text }]}>{adminBadgeText}</Text>
          </View>
        </View>

        <View style={styles.metricAdminBody}>
          <Text style={styles.metricAdminTitle}>{title}</Text>

          <View style={styles.metricAdminValueRow}>
            <Text style={styles.metricAdminValue}>{value}</Text>
            <View style={[styles.metricAdminMiniPill, { backgroundColor: c.soft }]}>
              <Text style={[styles.metricAdminMiniPillText, { color: c.text }]}>{tone === 'primary' ? 'RSVP' : 'Live'}</Text>
            </View>
          </View>

          <Text style={styles.metricAdminSubtitle}>{adminSubtitle}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.metricCard, admin ? styles.metricCardAdmin : null, { width }, { borderRightColor: c.main }]}>
      <View style={[styles.metricGlow, { backgroundColor: c.soft }]} />
      <View style={styles.metricTopRow}>
        <View style={styles.metricTextWrap}>
          <Text style={styles.metricLabel}>{title}</Text>
          {hint ? (
            <View style={[styles.metricHintPill, { backgroundColor: c.soft }]}>
              <Text style={[styles.metricHintText, { color: c.text }]}>{hint}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.metricIconWrap, { backgroundColor: c.soft, borderColor: 'rgba(255,255,255,0.7)' }]}>
          <Ionicons name={iconName} size={18} color={c.main} />
        </View>
      </View>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        <View style={styles.metricValueTrail}>
          <View style={[styles.metricAccentDot, { backgroundColor: c.main }]} />
        </View>
      </View>
    </View>
  );
}

function StatusChip({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  onPress: () => void;
}) {
  const c = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`סינון: ${label}`}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.chip,
        active ? { backgroundColor: c.main, borderColor: c.main } : null,
        Platform.OS === 'web' && hovered && !active ? styles.chipHover : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <View style={[styles.chipDot, active ? { backgroundColor: 'rgba(255,255,255,0.92)' } : { backgroundColor: c.main }]} />
      <Text style={[styles.chipText, active ? { color: colors.white } : null]}>{label}</Text>
      <View style={[styles.chipCount, active ? { backgroundColor: 'rgba(255,255,255,0.20)' } : { backgroundColor: c.soft }]}>
        <Text style={[styles.chipCountText, active ? { color: colors.white } : { color: c.text }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function MiniStatDot({ label, tone }: { label: string; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  const c = toneColor(tone);
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniDot, { backgroundColor: c.main }]} />
      <Text style={styles.miniStatText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function GuestListRow({
  guest,
  hasSentMessage,
  width,
  square,
  checked,
  onToggleCheck,
  onEdit,
  onDelete,
}: {
  guest: GuestRow;
  hasSentMessage: boolean;
  width?: any;
  square?: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusTone =
    guest.status === 'מגיע' ? 'success' : guest.status === 'אולי מגיע' ? 'primary' : guest.status === 'לא מגיע' ? 'danger' : 'warning';
  const sc = toneColor(statusTone);
  const initials = guestInitials(guest.name);

  return (
    <Pressable
      style={({ hovered }: any) => [
        styles.guestCard,
        width ? { width } : null,
        square ? styles.guestCardSquare : null,
        Platform.OS === 'web' && hovered ? styles.guestRowHover : null,
      ]}
    >
      {() => (
        <>
          {/* Header: Avatar + Name/Status + Checkbox */}
          <View style={styles.guestCardHeader}>
            <View style={[styles.guestAvatar, { backgroundColor: sc.soft }]}>
              <Text style={[styles.guestAvatarText, { color: sc.text }]}>{initials}</Text>
            </View>

            <View style={styles.guestCardTitleWrap}>
              <Text style={styles.guestCardName} numberOfLines={1}>
                {guest.name}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  styles.statusPillInline,
                  { backgroundColor: sc.soft, borderColor: 'rgba(0,0,0,0.06)' },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: sc.main }]} />
                <Text style={[styles.statusText, { color: sc.text }]}>{guest.status}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={checked ? 'הסר בחירה' : 'בחר אורח'}
              onPress={onToggleCheck}
              style={({ hovered, pressed }: any) => [
                styles.checkbox,
                checked ? styles.checkboxChecked : null,
                Platform.OS === 'web' && hovered ? styles.checkboxHover : null,
                pressed ? styles.btnPressed : null,
              ]}
            >
              {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
            </Pressable>
          </View>

          {/* Info: Count */}
          <View style={styles.guestDetailsRow}>
            <View style={styles.guestInfoPill}>
              <Ionicons name="people-outline" size={13} color={colors.gray[500]} />
              <Text style={styles.guestInfoText}>כמות {guest.numberOfPeople || 1}</Text>
            </View>
            {hasSentMessage ? (
              <View style={[styles.guestInfoPill, styles.messageSentPill]}>
                <Ionicons name="checkmark-done-outline" size={13} color="#047857" />
                <Text style={[styles.guestInfoText, styles.messageSentText]}>הודעה נשלחה</Text>
              </View>
            ) : null}
          </View>

          {/* Footer: Phone + Actions */}
          <View style={styles.guestCardFooterBar}>
            <View style={[styles.guestInfoPill, { flex: 1, minWidth: 0 }]}>
              <Ionicons name="call-outline" size={13} color={colors.gray[500]} />
              <Text style={styles.guestCardPhone} numberOfLines={1}>
                {guest.phone}
              </Text>
            </View>
            <View style={styles.guestCardActions}>
              <IconCircleBtn icon="create-outline" label="עריכה" onPress={onEdit} />
              <IconCircleBtn icon="trash-outline" label="מחק" danger onPress={onDelete} />
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

function IconCircleBtn({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const hoverStyle = danger ? styles.iconBtnDangerHover : styles.iconBtnHover;
  const baseColor = danger ? '#F43F5E' : colors.gray[500];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.iconBtn,
        Platform.OS === 'web' && hovered ? hoverStyle : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Ionicons name={icon} size={16} color={Platform.OS === 'web' ? (danger ? '#BE123C' : colors.primary) : baseColor} />
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function StatusPill({
  active,
  tone,
  label,
  onPress,
}: {
  active: boolean;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  label: string;
  onPress: () => void;
}) {
  const c = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.statusSelectPill,
        active ? { backgroundColor: c.main, borderColor: c.main } : null,
        Platform.OS === 'web' && hovered && !active ? styles.statusSelectPillHover : null,
        pressed ? styles.btnPressed : null,
      ]}
    >
      <Text style={[styles.statusSelectText, active ? { color: colors.white } : { color: colors.gray[700] }]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyTop}>
        <View style={styles.emptyTextWrap}>
          <Text style={styles.emptyTitle}>אין קטגוריות עדיין</Text>
          <Text style={styles.emptySubtitle}>כדי להתחיל, הוסף מוזמנים מתוך אנשי הקשר ובחר קטגוריה.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הוסף מוזמנים"
            onPress={onAdd}
            style={({ hovered, pressed }: any) => [
              styles.emptyPrimaryBtn,
              Platform.OS === 'web' && hovered ? styles.emptyPrimaryBtnHover : null,
              pressed ? styles.btnPressed : null,
            ]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.emptyPrimaryBtnText}>הוסף מוזמנים</Text>
          </Pressable>
        </View>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="people-outline" size={24} color={colors.primary} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: 'transparent',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  pageAdmin: {
    backgroundColor: '#E8F1FF',
  },

  content: {
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  contentAdmin: {
    paddingTop: 24,
    ...(Platform.OS === 'web' ? ({ alignSelf: 'stretch', direction: 'rtl' } as any) : null),
  },
  adminHeroShell: {
    width: '100%',
  },
  adminHeaderMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  adminHeaderMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  adminHeaderStatChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  adminHeaderStatValue: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  adminHeaderStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  adminHeaderActionBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 10px 22px rgba(6,23,62,0.16)',
  },
  adminHeaderActionBtnHover: {
    opacity: 0.97,
  },
  adminHeaderActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'right',
  },
  adminHeaderActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  adminHeaderImportBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.18)',
    backgroundColor: colors.white,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  adminHeaderImportBtnHover: {
    backgroundColor: colors.gray[100],
  },
  adminHeaderImportBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  adminHeaderSelectionBadge: {
    maxWidth: 320,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.10)',
    backgroundColor: 'rgba(15,69,230,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminHeaderSelectionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  adminBackBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  adminBackBtnHover: {
    backgroundColor: '#F8FAFD',
    borderColor: 'rgba(15,69,230,0.14)',
  },
  adminBackBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

  heroCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    padding: 18,
    gap: 14,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 18px 36px rgba(16,24,40,0.06)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 14,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  heroTextWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4, flexDirection: 'row', flexWrap: 'wrap' },
  heroEyebrow: { fontSize: 12, fontWeight: '900', color: colors.primary, textAlign: 'right', writingDirection: 'rtl' },
  heroTitle: { width: '100%', fontSize: 28, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  heroSubtitle: { width: '100%', fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', lineHeight: 20 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backBtnHover: { backgroundColor: colors.white, borderColor: 'rgba(6,23,62,0.18)' },

  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'stretch',
  },
  metricCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    borderRightWidth: 4,
    minHeight: 116,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 2px 6px rgba(16,24,40,0.04), 0 18px 40px rgba(16,24,40,0.08)',
  },
  metricCardAdmin: {
    borderColor: 'rgba(6,23,62,0.06)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 24px rgba(11,28,65,0.04)',
  },
  metricGlow: {
    position: 'absolute',
    top: -28,
    left: -18,
    width: 112,
    height: 112,
    borderRadius: 999,
    opacity: 0.45,
  },
  metricGlowAdmin: {
    width: 148,
    height: 148,
    top: -44,
    left: -28,
    opacity: 0.7,
  },
  metricTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  metricTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 10,
  },
  metricIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
  },
  metricIconWrapAdmin: {
    width: 46,
    height: 46,
    borderRadius: 15,
  },
  metricLabel: { fontSize: 12, fontWeight: '800', color: colors.gray[500], textAlign: 'right', writingDirection: 'rtl', lineHeight: 16 },
  metricAdminDecorWrap: {
    position: 'absolute',
    top: 14,
    left: 14,
    alignItems: 'flex-end',
    pointerEvents: 'none',
  },
  metricAdminDecorOrb: {
    width: 12,
    height: 12,
    borderRadius: 999,
    opacity: 0.9,
  },
  metricAdminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  metricAdminBadge: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    zIndex: 2,
  },
  metricAdminBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  metricAdminBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metricAdminBody: {
    marginTop: 18,
    gap: 10,
    alignItems: 'stretch',
  },
  metricAdminTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 16,
  },
  metricAdminValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  metricAdminValue: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    lineHeight: 42,
    letterSpacing: -0.9,
  },
  metricAdminMiniPill: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  metricAdminMiniPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  metricAdminSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  metricValueRow: { marginTop: 18, flexDirection: 'row-reverse', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  metricValue: { fontSize: 34, fontWeight: '900', color: colors.text, textAlign: 'right', lineHeight: 36, letterSpacing: -0.6 },
  metricValueTrail: {
    minHeight: 36,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  metricAccentDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  metricHintPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  metricHintText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  filterBar: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 14,
    gap: 12,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 1px 2px rgba(16,24,40,0.03), 0 18px 38px rgba(16,24,40,0.08)',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 12,
          zIndex: 50,
        } as any)
      : null),
  },
  filterBarAdmin: {
    borderColor: 'rgba(6,23,62,0.06)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 24px rgba(11,28,65,0.04)',
  },
  filterBarNarrow: {
    padding: 14,
  },
  filterBarWide: {
    alignItems: 'stretch',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  filterPrimaryRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    flexWrap: 'wrap',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  filterPrimaryRowNarrow: {
    alignItems: 'stretch',
  },
  searchWrap: {
    position: 'relative',
    alignSelf: 'auto',
    flexGrow: 1,
    minWidth: 280,
  },
  searchIconRight: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  searchInput: {
    height: 48,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingRight: 44,
    paddingLeft: 14,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  chipsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    flex: 1,
    minWidth: 0,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  addGuestsBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    flexShrink: 0,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 10px 22px rgba(6,23,62,0.16)',
  },
  addGuestsBtnNarrow: { width: '100%' },
  addGuestsBtnHover: { opacity: 0.97, transform: [{ translateY: -1 }] },
  addGuestsBtnText: { fontSize: 13, fontWeight: '900', color: colors.white, textAlign: 'right', writingDirection: 'rtl' },
  heroActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  heroActionsRowNarrow: {
    width: '100%',
    flexDirection: 'column',
  },
  importGuestsBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    flexShrink: 0,
  },
  importGuestsBtnNarrow: { width: '100%' },
  importGuestsBtnHover: { backgroundColor: colors.gray[100] },
  importGuestsBtnText: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'right', writingDirection: 'rtl' },
  filterToggleBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(15,69,230,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    flexShrink: 0,
  },
  filterToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterToggleBtnNarrow: { width: '100%' },
  filterToggleBtnHover: {
    opacity: 0.97,
  },
  filterToggleBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  filterToggleBtnTextActive: {
    color: colors.white,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chipHover: {
    backgroundColor: colors.white,
    borderColor: 'rgba(15,23,42,0.14)',
  },
  chipText: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  chipDot: { width: 8, height: 8, borderRadius: 999 },
  chipCount: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, minWidth: 28, alignItems: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },

  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.10)',
    flexShrink: 0,
    flexWrap: 'wrap',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
  },
  bulkInfo: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 220,
  },
  bulkCountBadge: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bulkCountText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
  },
  bulkTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 3,
  },
  bulkText: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'right', writingDirection: 'rtl' },
  bulkHint: { fontSize: 11.5, fontWeight: '700', color: colors.gray[500], textAlign: 'right', writingDirection: 'rtl' },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  bulkBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bulkBtnHover: { backgroundColor: '#F8FAFC', borderColor: 'rgba(15,23,42,0.14)' },
  bulkBtnText: { fontSize: 12.5, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  bulkDangerBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F43F5E',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bulkDangerBtnHover: { backgroundColor: '#E11D48' },
  bulkDangerBtnText: { fontSize: 12.5, fontWeight: '900', color: colors.white, textAlign: 'right', writingDirection: 'rtl' },

  loadingBox: { paddingVertical: 30, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  groups: { gap: 16 },
  groupCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 1px 2px rgba(16,24,40,0.03), 0 18px 38px rgba(16,24,40,0.06)',
  },
  groupCardAdmin: {
    borderColor: 'rgba(6,23,62,0.06)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 24px rgba(11,28,65,0.04)',
  },
  groupHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: colors.white,
  },
  groupHeaderHover: { backgroundColor: 'rgba(248,250,252,0.95)' },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, flexWrap: 'wrap' },
  groupIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    flexShrink: 0,
  },
  groupTitleWrap: { flex: 1, minWidth: 0, gap: 6, alignItems: 'flex-start', justifyContent: 'center' },
  groupToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  chevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  groupTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right', width: '100%', writingDirection: 'rtl' },
  groupPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
  },
  groupPillText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  groupHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'nowrap', justifyContent: 'flex-start' },
  miniStat: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.95)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  miniDot: { width: 7, height: 7, borderRadius: 999 },
  miniStatText: { fontSize: 11.5, fontWeight: '800', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },

  groupBody: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    // In RTL, a plain 'row' starts at the physical right edge.
    // Using 'row-reverse' together with `direction: 'rtl'` can flip the start edge back to the left on web.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'stretch',
    backgroundColor: 'rgba(248,250,252,0.72)',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  groupEmpty: {
    width: '100%',
    padding: 14,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  groupCollapsedBar: { height: 8, backgroundColor: 'rgba(248,250,252,0.9)' },

  guestRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    // Ensure RTL layout inside the guest card on web
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,0.88)',
    minHeight: 44,
  },
  guestRowHover: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: 'rgba(30,58,138,0.18)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 0 0 1px rgba(30,58,138,0.06), 0 14px 26px rgba(16,24,40,0.08)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.16)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  checkboxHover: { borderColor: 'rgba(6,23,62,0.35)' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  guestCard: {
    padding:10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    borderRadius: 20,
    backgroundColor: colors.white,
    gap: 14,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 1px 3px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.07)',
  },
  guestCardSquare: {
    aspectRatio: 1,
  },
  guestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  guestAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guestAvatarText: { fontSize: 15, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  guestCardTitleWrap: { flex: 1, minWidth: 0, gap: 6 },
  guestCardName: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', lineHeight: 22 },
  guestDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  guestInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: 'rgba(248,250,252,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  guestCardPhone: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    // @ts-ignore - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
    flex: 1,
  },
  guestInfoText: { fontSize: 13, fontWeight: '700', color: colors.gray[700], textAlign: 'right', writingDirection: 'rtl' },
  messageSentPill: {
    backgroundColor: 'rgba(236,253,245,0.95)',
    borderColor: 'rgba(16,185,129,0.24)',
  },
  messageSentText: {
    color: '#047857',
  },
  guestCardFooterBar: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guestCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  guestSelectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(248,250,252,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    flex: 1,
    justifyContent: 'center',
  },
  guestSelectionPillActive: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderColor: 'rgba(37,99,235,0.16)',
  },
  guestSelectionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  guestSelectionTextActive: {
    color: colors.primary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statusPillBottom: {
    alignSelf: 'auto',
  },
  statusPillInline: {
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    opacity: 0.95,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 6px 14px rgba(16,24,40,0.06)',
  },
  guestCheckboxAbs: {},
  iconBtnHover: { borderColor: 'rgba(6,23,62,0.18)', backgroundColor: colors.white },
  iconBtnDangerHover: { borderColor: 'rgba(244,63,94,0.22)', backgroundColor: 'rgba(244,63,94,0.06)' },

  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  btnDisabled: { opacity: 0.6 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 30px 80px rgba(0,0,0,0.20)',
  },
  confirmDeleteCard: {
    maxWidth: 500,
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: '#F8FAFF',
  },
  modalTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  modalIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(6,23,62,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalTitleTextWrap: { flex: 1, minWidth: 0, gap: 4, justifyContent: 'flex-start', alignItems: 'flex-start' },
  modalBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 19,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalCloseBtnHover: { backgroundColor: colors.gray[200] },
  modalBody: { padding: 18, gap: 14 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  stepperItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(148,163,184,0.08)',
  },
  stepperItemActive: {
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  stepperDivider: {
    width: 34,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.28)',
  },
  stepperDividerDone: {
    backgroundColor: colors.primary,
  },
  stepperDot: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepperDotText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'center',
  },
  stepperDotTextActive: {
    color: colors.white,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stepperLabelActive: {
    color: colors.primary,
  },
  addSectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#FBFCFF',
    padding: 16,
    gap: 14,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 10px 24px rgba(16,24,40,0.05)',
  },
  addSectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
  },
  addSectionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addSectionTextWrap: { flex: 1, minWidth: 0, gap: 4, justifyContent: 'flex-start', alignItems: 'flex-start' },
  addSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  field: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  modalInput: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  inputLtr: {
    // @ts-expect-error - react-native-web supports direction
    direction: 'ltr',
    textAlign: 'left',
  },
  statusRow: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  statusSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  statusSelectPillHover: { backgroundColor: colors.gray[50] },
  statusSelectText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  modalActions: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
    flexDirection: 'row',
    gap: 10,
  },
  modalDangerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F43F5E',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalDangerBtnHover: { opacity: 0.95 },
  modalDangerBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  modalPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalPrimaryBtnHover: { opacity: 0.95 },
  modalPrimaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  modalPrimaryBtnDisabled: { opacity: 0.75 },
  confirmDeleteIconBadge: {
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderColor: 'rgba(244,63,94,0.16)',
  },
  confirmDeleteBody: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 16,
  },
  confirmDeleteSummary: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.12)',
    backgroundColor: 'rgba(244,63,94,0.05)',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  confirmDeleteCount: {
    fontSize: 30,
    fontWeight: '900',
    color: '#BE123C',
    textAlign: 'center',
  },
  confirmDeleteCountLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9F1239',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },

  modalSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  modalSecondaryBtnHover: { backgroundColor: colors.gray[200] },
  modalSecondaryBtnText: { color: colors.gray[800], fontSize: 13, fontWeight: '900', textAlign: 'right' },

  importIntroBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
  },
  importIntroText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  importColsTable: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    overflow: 'hidden',
  },
  importColRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  importColNameWrap: {
    width: 96,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  importColName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importColReq: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.gray[600],
    backgroundColor: colors.gray[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  importColReqRequired: {
    color: colors.error,
    backgroundColor: 'rgba(244,54,54,0.10)',
  },
  importColDesc: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importTemplateLink: {
    marginTop: 14,
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  importTemplateLinkHover: { opacity: 0.8 },
  importTemplateLinkText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    textDecorationLine: 'underline',
  },
  importBusyBox: {
    marginTop: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
  },
  importBusyText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importSummaryBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  importSummaryTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  importSummaryRows: {
    width: '100%',
    marginTop: 8,
    gap: 8,
  },
  importSummaryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  importSummaryValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  importSummaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importDuplicatesBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.4)',
    backgroundColor: 'rgba(240,203,70,0.08)',
    padding: 12,
    gap: 6,
  },
  importDuplicatesHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  importDuplicatesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[800],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  importDuplicateName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[700],
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingRight: 4,
  },

  addHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 19,
  },
  categoryPickList: { gap: 10 },
  categoryPickItem: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  categoryPickItemHover: {
    backgroundColor: '#F8FAFF',
    borderColor: 'rgba(6,23,62,0.14)',
  },
  categoryPickItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryPickContent: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  categoryPickLeadingIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryPickLeadingIconActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  categoryPickText: { fontSize: 13, fontWeight: '900', color: colors.gray[800], textAlign: 'right', flex: 1, minWidth: 0, writingDirection: 'rtl' },
  categoryPickTextActive: { color: colors.white },

  inlineRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  inlineAddBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  inlineAddBtnHover: { opacity: 0.95 },
  inlineAddBtnDisabled: { opacity: 0.75 },
  inlineAddBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },

  selectedCategoryCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  selectedCategoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectedCategoryTextWrap: { flex: 1, minWidth: 0, gap: 2, justifyContent: 'flex-start', alignItems: 'flex-start' },
  selectedCategoryLabel: { fontSize: 11, fontWeight: '900', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl' },
  selectedCategoryValue: { fontSize: 14, fontWeight: '900', color: colors.primary, textAlign: 'right', flex: 1, minWidth: 0, writingDirection: 'rtl' },
  selectedCategoryEditBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.12)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  selectedCategoryEditBtnHover: {
    backgroundColor: 'rgba(6,23,62,0.04)',
  },
  selectedCategoryEditBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  empty: {
    padding: 26,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  emptyTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 14,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(6,23,62,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyTextWrap: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    alignItems: 'flex-start',
    gap: 6,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  emptyTitle: { width: '100%', fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', writingDirection: 'rtl' },
  emptySubtitle: { width: '100%', fontSize: 13, fontWeight: '700', color: colors.gray[600], textAlign: 'right', writingDirection: 'rtl', maxWidth: 520, lineHeight: 20 },
  emptyPrimaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  emptyPrimaryBtnHover: { opacity: 0.95 },
  emptyPrimaryBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'right' },
});

