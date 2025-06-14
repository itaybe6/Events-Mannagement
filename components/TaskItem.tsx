import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Task } from '@/types';
import { colors } from '@/constants/colors';
import { CheckCircle, Circle, Edit, Trash2 } from 'lucide-react-native';

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isOverdue = () => {
    return !task.completed && new Date(task.dueDate) < new Date();
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftActions}>
        {onEdit && (
          <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
            <Edit size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity style={styles.actionButton} onPress={onDelete}>
            <Trash2 size={16} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.contentContainer}>
        <Text
          style={[
            styles.title,
            task.completed && styles.completedTitle,
          ]}
        >
          {task.title}
        </Text>
        <Text
          style={[
            styles.date,
            isOverdue() && styles.overdueDate,
          ]}
        >
          {formatDate(task.dueDate)}
        </Text>
      </View>

      <TouchableOpacity style={styles.checkbox} onPress={onToggle}>
        {task.completed ? (
          <CheckCircle size={24} color={colors.success} />
        ) : (
          <Circle size={24} color={isOverdue() ? colors.error : colors.gray[400]} />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
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
  checkbox: {
    marginLeft: 12,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    color: colors.gray[500],
  },
  date: {
    fontSize: 12,
    color: colors.gray[600],
    marginTop: 4,
    textAlign: 'right',
  },
  overdueDate: {
    color: colors.error,
  },
  leftActions: {
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