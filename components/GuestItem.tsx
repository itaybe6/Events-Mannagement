import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Guest } from '@/types';
import { colors } from '@/constants/colors';
import { Check, X, Clock, Edit, Trash2 } from 'lucide-react-native';

interface GuestItemProps {
  guest: Guest;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: Guest['status']) => void;
}

export const GuestItem: React.FC<GuestItemProps> = ({
  guest,
  onEdit,
  onDelete,
  onStatusChange,
}) => {
  const getStatusColor = () => {
    switch (guest.status) {
      case 'מגיע':
        return colors.success;
      case 'לא מגיע':
        return colors.error;
      case 'ממתין':
        return colors.warning;
      default:
        return colors.gray[500];
    }
  };

  const getStatusIcon = () => {
    switch (guest.status) {
      case 'מגיע':
        return <Check size={16} color={colors.success} />;
      case 'לא מגיע':
        return <X size={16} color={colors.error} />;
      case 'ממתין':
        return <Clock size={16} color={colors.warning} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{guest.name}</Text>
        <Text style={styles.phone}>{guest.phone}</Text>
        <View style={styles.statusContainer}>
          {getStatusIcon()}
          <Text style={[styles.status, { color: getStatusColor() }]}>
            {guest.status}
          </Text>
        </View>
        {guest.tableId && (
          <Text style={styles.table}>שולחן: {guest.tableId}</Text>
        )}
      </View>

      {(onStatusChange || onEdit || onDelete) && (
        <View style={styles.actionsContainer}>
          {onStatusChange && (
            <View style={styles.statusActions}>
              <TouchableOpacity
                style={[styles.statusButton, styles.comingButton]}
                onPress={() => onStatusChange('מגיע')}
              >
                <Check size={16} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.notComingButton]}
                onPress={() => onStatusChange('לא מגיע')}
              >
                <X size={16} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusButton, styles.pendingButton]}
                onPress={() => onStatusChange('ממתין')}
              >
                <Clock size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.editActions}>
            {onEdit && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onEdit}
              >
                <Edit size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onDelete}
              >
                <Trash2 size={16} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
  },
  phone: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 2,
    textAlign: 'right',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  status: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 4,
    textAlign: 'right',
  },
  table: {
    fontSize: 12,
    color: colors.gray[600],
    marginTop: 4,
    textAlign: 'right',
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusActions: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  comingButton: {
    backgroundColor: colors.success,
  },
  notComingButton: {
    backgroundColor: colors.error,
  },
  pendingButton: {
    backgroundColor: colors.warning,
  },
  editActions: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    marginHorizontal: 4,
  },
});