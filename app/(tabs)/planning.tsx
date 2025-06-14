import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useEventStore } from '@/store/eventStore';
import { colors } from '@/constants/colors';
import { TaskItem } from '@/components/TaskItem';
import { Button } from '@/components/Button';
import { Plus, Calendar, CheckCircle, Circle } from 'lucide-react-native';

export default function PlanningScreen() {
  const { currentEvent, updateTask, deleteTask, addTask } = useEventStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending'>('all');

  if (!currentEvent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const filteredTasks = currentEvent.tasks.filter(task => {
    if (filter === 'all') return true;
    if (filter === 'completed') return task.completed;
    if (filter === 'pending') return !task.completed;
    return true;
  }).sort((a, b) => {
    // Sort by completion status first, then by due date
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      const newTask = {
        id: Date.now().toString(),
        title: newTaskTitle.trim(),
        completed: false,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default due date: 1 week from now
      };
      addTask(newTask);
      setNewTaskTitle('');
      setShowAddTask(false);
    }
  };

  const toggleTaskCompletion = (taskId: string, completed: boolean) => {
    updateTask(taskId, { completed: !completed });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>תכנון האירוע</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowAddTask(!showAddTask)}
        >
          <Plus size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showAddTask && (
        <View style={styles.addTaskContainer}>
          <TextInput
            style={styles.addTaskInput}
            placeholder="הוסף משימה חדשה..."
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            placeholderTextColor={colors.gray[500]}
            autoFocus
          />
          <View style={styles.addTaskActions}>
            <Button
              title="ביטול"
              onPress={() => {
                setShowAddTask(false);
                setNewTaskTitle('');
              }}
              variant="text"
              size="small"
              style={styles.cancelButton}
            />
            <Button
              title="הוספה"
              onPress={handleAddTask}
              size="small"
              disabled={!newTaskTitle.trim()}
            />
          </View>
        </View>
      )}

      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'all' && styles.activeFilter]} 
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
            הכל ({currentEvent.tasks.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'pending' && styles.activeFilter]} 
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.activeFilterText]}>
            בתהליך ({currentEvent.tasks.filter(t => !t.completed).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterButton, filter === 'completed' && styles.activeFilter]} 
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.activeFilterText]}>
            הושלמו ({currentEvent.tasks.filter(t => t.completed).length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.taskList}>
        {filteredTasks.length > 0 ? (
          filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => toggleTaskCompletion(task.id, task.completed)}
              onDelete={() => deleteTask(task.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {filter !== 'all' 
                ? `אין משימות ${filter === 'completed' ? 'שהושלמו' : 'בתהליך'}`
                : 'אין משימות עדיין. הוסף משימות חדשות!'}
            </Text>
            {filter === 'all' && (
              <Button 
                title="הוספת משימה" 
                onPress={() => setShowAddTask(true)} 
                style={styles.addTaskButton}
              />
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${currentEvent.tasks.length > 0 
                  ? (currentEvent.tasks.filter(t => t.completed).length / currentEvent.tasks.length) * 100 
                  : 0}%` 
              }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {currentEvent.tasks.filter(t => t.completed).length} מתוך {currentEvent.tasks.length} משימות הושלמו
        </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTaskContainer: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  addTaskInput: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[300],
    marginBottom: 12,
  },
  addTaskActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    marginRight: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: colors.gray[200],
    borderRadius: 8,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeFilter: {
    backgroundColor: colors.white,
  },
  filterText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  activeFilterText: {
    color: colors.primary,
    fontWeight: '600',
  },
  taskList: {
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
  addTaskButton: {
    marginTop: 16,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.gray[300],
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: colors.gray[600],
    textAlign: 'center',
  },
});