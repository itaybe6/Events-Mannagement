import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { GuestItem } from '@/components/GuestItem';
import { Button } from '@/components/Button';
import { Plus, Search, Filter, UserPlus } from 'lucide-react-native';

export default function GuestsScreen() {
  const { guests, updateGuestStatus, deleteGuest } = useEventStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredGuests = guests.filter(guest => {
    const matchesSearch = guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guest.phone.includes(searchQuery);
    const matchesStatus = statusFilter ? guest.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const guestCounts = {
    total: guests.length,
    coming: guests.filter(g => g.status === 'מגיע').length,
    notComing: guests.filter(g => g.status === 'לא מגיע').length,
    pending: guests.filter(g => g.status === 'ממתין').length,
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="חיפוש אורחים..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.gray[500]}
          />
          <Search size={20} color={colors.gray[500]} style={styles.searchIcon} />
        </View>
        
        <Link href="/rsvp/invite" asChild>
          <TouchableOpacity style={styles.addButton}>
            <UserPlus size={20} color={colors.white} />
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === null && styles.activeFilter]} 
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[styles.filterText, statusFilter === null && styles.activeFilterText]}>
            הכל ({guestCounts.total})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'מגיע' && styles.activeFilter]} 
          onPress={() => setStatusFilter('מגיע')}
        >
          <Text style={[styles.filterText, statusFilter === 'מגיע' && styles.activeFilterText]}>
            מגיעים ({guestCounts.coming})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'לא מגיע' && styles.activeFilter]} 
          onPress={() => setStatusFilter('לא מגיע')}
        >
          <Text style={[styles.filterText, statusFilter === 'לא מגיע' && styles.activeFilterText]}>
            לא מגיעים ({guestCounts.notComing})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, statusFilter === 'ממתין' && styles.activeFilter]} 
          onPress={() => setStatusFilter('ממתין')}
        >
          <Text style={[styles.filterText, statusFilter === 'ממתין' && styles.activeFilterText]}>
            ממתינים ({guestCounts.pending})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.guestList}>
        {filteredGuests.length > 0 ? (
          filteredGuests.map(guest => (
            <GuestItem
              key={guest.id}
              guest={guest}
              onStatusChange={(status) => updateGuestStatus(guest.id, status)}
              onDelete={() => deleteGuest(guest.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchQuery || statusFilter 
                ? 'לא נמצאו אורחים התואמים את החיפוש'
                : 'אין אורחים עדיין. הוסף אורחים חדשים!'}
            </Text>
            {!searchQuery && !statusFilter && (
              <Link href="/rsvp/invite" asChild>
                <Button 
                  title="הוספת אורחים" 
                  onPress={() => {}} 
                  style={styles.addGuestsButton}
                />
              </Link>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.actionsContainer}>
        <Link href="/seating/edit" asChild>
          <Button
            title="סידור ישיבה"
            onPress={() => {}}
            variant="outline"
            style={styles.actionButton}
          />
        </Link>
        <Link href="/rsvp/invite" asChild>
          <Button
            title="הזמנת אורחים"
            onPress={() => {}}
            style={styles.actionButton}
          />
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  searchIcon: {
    marginLeft: 8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.gray[200],
  },
  activeFilter: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: colors.gray[700],
  },
  activeFilterText: {
    color: colors.white,
  },
  guestList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 16,
  },
  addGuestsButton: {
    marginTop: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 6,
  },
});