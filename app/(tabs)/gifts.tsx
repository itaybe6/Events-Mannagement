import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Gift, CreditCard, ArrowUpRight } from 'lucide-react-native';

export default function GiftsScreen() {
  const { gifts } = useEventStore();
  const [activeTab, setActiveTab] = useState<'all' | 'received' | 'processing'>('all');

  const filteredGifts = gifts.filter(gift => {
    if (activeTab === 'all') return true;
    if (activeTab === 'received') return gift.status === 'התקבל';
    if (activeTab === 'processing') return gift.status === 'בתהליך';
    return true;
  });

  const totalAmount = gifts.reduce((sum, gift) => sum + gift.amount, 0);
  const receivedAmount = gifts
    .filter(gift => gift.status === 'התקבל')
    .reduce((sum, gift) => sum + gift.amount, 0);
  const processingAmount = gifts
    .filter(gift => gift.status === 'בתהליך')
    .reduce((sum, gift) => sum + gift.amount, 0);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <View style={styles.summaryTextContainer}>
              <Text style={styles.summaryLabel}>סך הכל מתנות</Text>
              <Text style={styles.summaryValue}>₪{totalAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryIconContainer}>
              <Gift size={24} color={colors.primary} />
            </View>
          </View>
        </Card>

        <View style={styles.detailCards}>
          <Card style={styles.detailCard}>
            <Text style={styles.detailLabel}>התקבלו</Text>
            <Text style={[styles.detailValue, { color: colors.success }]}>
              ₪{receivedAmount.toLocaleString()}
            </Text>
          </Card>
          <Card style={styles.detailCard}>
            <Text style={styles.detailLabel}>בתהליך</Text>
            <Text style={[styles.detailValue, { color: colors.warning }]}>
              ₪{processingAmount.toLocaleString()}
            </Text>
          </Card>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            הכל ({gifts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.activeTab]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
            התקבלו ({gifts.filter(g => g.status === 'התקבל').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'processing' && styles.activeTab]}
          onPress={() => setActiveTab('processing')}
        >
          <Text style={[styles.tabText, activeTab === 'processing' && styles.activeTabText]}>
            בתהליך ({gifts.filter(g => g.status === 'בתהליך').length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.giftsList}>
        {filteredGifts.length > 0 ? (
          filteredGifts.map(gift => (
            <Card key={gift.id} style={styles.giftCard}>
              <View style={styles.giftHeader}>
                <Text style={styles.giftAmount}>₪{gift.amount.toLocaleString()}</Text>
                <View style={styles.giftInfo}>
                  <Text style={styles.giftName}>{gift.guestName}</Text>
                  <Text style={styles.giftDate}>{formatDate(gift.date)}</Text>
                </View>
              </View>
              {gift.message && (
                <Text style={styles.giftMessage}>"{gift.message}"</Text>
              )}
              <View style={styles.giftFooter}>
                <View
                  style={[
                    styles.statusBadge,
                    gift.status === 'התקבל' ? styles.receivedBadge : styles.processingBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      gift.status === 'התקבל' ? styles.receivedText : styles.processingText,
                    ]}
                  >
                    {gift.status}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>אין מתנות להצגה</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actionsContainer}>
        <Link href="/financing/apply" asChild>
          <Button
            title="מימון אירוע"
            onPress={() => {}}
            variant="outline"
            style={styles.actionButton}
          />
        </Link>
        <Link href="/gift/payment" asChild>
          <Button
            title="הוספת מתנה"
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
  summaryContainer: {
    marginBottom: 16,
  },
  summaryCard: {
    marginBottom: 12,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTextContainer: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.gray[600],
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 4,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailCard: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.gray[600],
  },
  detailValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: colors.gray[200],
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: colors.white,
  },
  tabText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '600',
  },
  giftsList: {
    flex: 1,
  },
  giftCard: {
    marginBottom: 12,
  },
  giftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  giftAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  giftInfo: {
    alignItems: 'flex-end',
  },
  giftName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  giftDate: {
    fontSize: 12,
    color: colors.gray[600],
    marginTop: 2,
  },
  giftMessage: {
    fontSize: 14,
    color: colors.gray[700],
    fontStyle: 'italic',
    marginBottom: 12,
    textAlign: 'right',
  },
  giftFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  receivedBadge: {
    backgroundColor: `${colors.success}20`,
  },
  processingBadge: {
    backgroundColor: `${colors.warning}20`,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  receivedText: {
    color: colors.success,
  },
  processingText: {
    color: colors.warning,
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