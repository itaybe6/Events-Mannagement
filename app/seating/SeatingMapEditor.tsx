import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Dimensions, Alert, Animated, PanResponder, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

const { width, height } = Dimensions.get('window');

const TABLE_SHAPES = {
  square: { label: 'שולחן רגיל', defaultCapacity: 12 },
  rectangle: { label: 'שולחן אביר', defaultCapacity: 20 },
};

export default function SeatingMapEditor() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [textAreas, setTextAreas] = useState<any[]>([]);
  const [textModal, setTextModal] = useState(false);
  const [selectedText, setSelectedText] = useState<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // מצב גרירה
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedTextId, setDraggedTextId] = useState<string | null>(null);
  const [dragTextOffset, setDragTextOffset] = useState({ x: 0, y: 0 });
  // הוסף state: האם גרירה פעילה
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [dragTableId, setDragTableId] = useState<string | null>(null);
  const positions = useRef<{ [id: string]: Animated.ValueXY }>({}).current;
  const panResponders = useRef<{ [id: string]: any }>({}).current;
  const [isPositionsReady, setIsPositionsReady] = useState(false);
  const [selectedTableForDrag, setSelectedTableForDrag] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);
  const [choiceModalVisible, setChoiceModalVisible] = useState(false);
  const [tableForChoice, setTableForChoice] = useState<any>(null);
  const [pressedTable, setPressedTable] = useState<string | null>(null);

  // מחוץ ל-map וברמה העליונה של הפונקציה:
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (editMode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ])
      ).start();
    } else {
      shakeAnim.setValue(0);
    }
  }, [editMode]);

  // משיכת שולחנות והערות מה-DB
  useEffect(() => {
    fetchTables();
    fetchTextAreas();
  }, [eventId]);

  // איפוס מיקום וזום כשחוזרים לעמוד
  useEffect(() => {
    if (scrollViewRef.current) {
      // איפוס מיקום לתחילת המפה
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: false });
      // איפוס זום למצב התחלתי
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.setNativeProps({
            zoomScale: 0.5, // זום התחלתי
            contentOffset: { x: 0, y: 0 }
          });
        }
      }, 100);
    }
  }, []);

  // איפוס כל פעם שחוזרים לעמוד
  useFocusEffect(
    React.useCallback(() => {
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: false });
          scrollViewRef.current.setNativeProps({
            zoomScale: 0.4,
            contentOffset: { x: 0, y: 0 }
          });
        }
      }, 200);
    }, [])
  );

  // יצירת Animated.ValueXY ו-PanResponder לכל שולחן, ומחיקת ישנים
  useEffect(() => {
    let newPositionsCreated = false;
    tables.forEach(table => {
      if (!positions[table.id]) {
        newPositionsCreated = true;
        positions[table.id] = new Animated.ValueXY({
          x: typeof table.x === 'number' ? table.x : 40,
          y: typeof table.y === 'number' ? table.y : 60
        });
      }
    });

    // ניקוי זיכרון
    Object.keys(positions).forEach(id => {
      if (!tables.find(t => t.id === id)) {
        delete positions[id];
        delete panResponders[id];
      }
    });

    if (newPositionsCreated) {
      setIsPositionsReady(true);
    }
  }, [tables, editMode]);

  const handleTouchStart = (table: any, event: any) => {
    if (!editMode) return;
    const { pageX, pageY } = event.nativeEvent;
    
    // שמירת המיקום הנוכחי
    const currentX = (positions[table.id].x as any)._value || 0;
    const currentY = (positions[table.id].y as any)._value || 0;
    positions[table.id].setOffset({ x: currentX, y: currentY });
    positions[table.id].setValue({ x: pageX, y: pageY });
  };

  const handleTouchMove = (table: any, event: any) => {
    if (!editMode || selectedTableForDrag !== table.id) return;
    
    const { pageX, pageY } = event.nativeEvent;
    positions[table.id].setValue({ x: pageX, y: pageY });
  };

  const handleTouchEnd = (table: any) => {
    if (!editMode || selectedTableForDrag !== table.id) return;
    
    // איחוד המיקום הסופי
    positions[table.id].flattenOffset();
    
    updateTable(table.id, { x: (positions[table.id].x as any)._value, y: (positions[table.id].y as any)._value });
    setSelectedTableForDrag(null);
  };

  const fetchTables = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('event_id', eventId)
      .order('number');
    if (!error) {
      const positionedTables = data.map(t => {
        if (!positions[t.id]) {
          positions[t.id] = new Animated.ValueXY({ x: t.x || 40, y: t.y || 60 });
        } else {
          positions[t.id].setValue({ x: t.x || 40, y: t.y || 60 });
        }
        return t;
      });
      setTables(positionedTables);
      setIsPositionsReady(true);
    }
    setLoading(false);
  };

  // משיכת הערות (annotations) מה-DB
  const fetchTextAreas = async () => {
    const { data, error } = await supabase
      .from('seating_maps')
      .select('annotations')
      .eq('event_id', eventId)
      .single();
    if (!error && data && Array.isArray(data.annotations)) {
      setTextAreas(data.annotations);
    } else {
      setTextAreas([]);
    }
  };

  // עדכון הערות ב-DB
  const updateAnnotations = async (annotations: any[]) => {
    await supabase
      .from('seating_maps')
      .update({ annotations })
      .eq('event_id', eventId);
  };

  // הוספת שולחן
  const addTable = async (shape: 'square' | 'rectangle') => {
    const maxNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number || 0)) : 0;
    const newNumber = maxNumber + 1;
    const newTable = {
      event_id: eventId,
      number: newNumber,
      capacity: TABLE_SHAPES[shape].defaultCapacity,
      shape,
      x: 40 + (tables.length % Math.floor((width * 3 - 80) / 80)) * 80,
      y: 60 + Math.floor(tables.length / Math.floor((width * 3 - 80) / 80)) * 80,
      seated_guests: 0,
    };

    const { data, error } = await supabase
      .from('tables')
      .insert(newTable)
      .select()
      .single();

    if (error) {
      console.error('שגיאה בהוספת שולחן:', error);
    } else if (data) {
      if (!positions[data.id]) {
        positions[data.id] = new Animated.ValueXY({ x: newTable.x, y: newTable.y });
      }
      setTables([...tables, data]);
    }
  };

  // עדכון שולחן
  const updateTable = async (id: string, updates: any) => {
    const { data, error } = await supabase
      .from('tables')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      setTables(tables.map(t => (t.id === id ? data : t)));
    }
  };

  // מחיקת שולחן
  const deleteTable = async (id: string) => {
    const { error } = await supabase
      .from('tables')
      .delete()
      .eq('id', id);
    if (!error) {
      delete positions[id];
      delete panResponders[id];
      setTables(tables.filter(t => t.id !== id));
    }
  };

  // הוספת תיבת טקסט
  const addTextArea = async () => {
    const newText = {
      id: Date.now().toString(),
      text: 'טקסט חופשי',
      x: 200,
      y: 200 + (textAreas.length % Math.floor((height * 2 - 300) / 40)) * 40,
    };
    const newArr = [...textAreas, newText];
    setTextAreas(newArr);
    await updateAnnotations(newArr);
  };

  // פתיחת מודל עריכה
  const openEditModal = (table: any) => {
    setSelectedTable(table);
    setModalVisible(true);
  };

  // שמירת עריכה
  const saveEdit = () => {
    if (selectedTable) {
      updateTable(selectedTable.id, {
        number: selectedTable.number,
        capacity: selectedTable.capacity,
      });
      setModalVisible(false);
    }
  };

  // פתיחת מודל עריכת טקסט
  const openTextModal = (textObj: any) => {
    setSelectedText(textObj);
    setTextModal(true);
  };

  // שמירת עריכת טקסט
  const saveTextEdit = async () => {
    const newArr = textAreas.map(t => t.id === selectedText.id ? selectedText : t);
    setTextAreas(newArr);
    setTextModal(false);
    await updateAnnotations(newArr);
  };

  // מחיקת תיבת טקסט
  const deleteTextArea = async (id: string) => {
    const newArr = textAreas.filter(t => t.id !== id);
    setTextAreas(newArr);
    setTextModal(false);
    await updateAnnotations(newArr);
  };

  // איפוס זום
  const resetZoom = () => {
    if (scrollViewRef.current) {
      // איפוס מיקום
      scrollViewRef.current.scrollTo({ x: 0, y: 0, animated: true });
      // איפוס זום
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.setNativeProps({
            zoomScale: 0.5,
            contentOffset: { x: 0, y: 0 }
          });
        }
      }, 300);
    }
  };

  
  const onTextPressIn = (t: any, e: any) => {
    setDragOffset({
      x: t.x ?? 200,
      y: t.y ?? 200,
    });
  };
  const onTextMove = (t: any, e: any) => {
    if (
      dragActiveId === t.id &&
      dragOffset.x !== undefined &&
      dragOffset.y !== undefined
    ) {
      const touch = e.nativeEvent.touches && e.nativeEvent.touches[0];
      if (!touch) return;
      const deltaX = touch.pageX - dragOffset.x;
      const deltaY = touch.pageY - dragOffset.y;
      const newX = dragOffset.x + deltaX;
      const newY = dragOffset.y + deltaY;
      setTextAreas(textAreas =>
        textAreas.map(txt =>
          txt.id === t.id ? { ...txt, x: newX, y: newY } : txt
        )
      );
    }
  };
  const onTextPressOut = async (t: any, e: any) => {
    if (
      dragActiveId === t.id &&
      dragOffset.x !== undefined &&
      dragOffset.y !== undefined
    ) {
      const newArr = textAreas.map(txt =>
        txt.id === t.id ? { ...txt, x: Math.round(txt.x), y: Math.round(txt.y) } : txt
      );
      setTextAreas(newArr);
      await updateAnnotations(newArr);
    }
  };

  // UI
  return (
    <View style={styles.container}>
      {/* כפתור חזרה */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#333" />
      </TouchableOpacity>
      {/* Toolbar - horizontal scrollable */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbarScroll} contentContainerStyle={styles.toolbarContent}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => addTable('square')}>
          <Ionicons name="add" size={20} color="#333" />
          <Text style={styles.toolbarBtnText}>הוסף שולחן רגיל</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => addTable('rectangle')}>
          <Ionicons name="add" size={20} color="#333" />
          <Text style={styles.toolbarBtnText}>הוסף שולחן אביר</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={resetZoom}>
          <Ionicons name="resize" size={20} color="#333" />
          <Text style={styles.toolbarBtnText}>איפוס זום</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={addTextArea}>
          <Ionicons name="text" size={20} color="#333" />
          <Text style={styles.toolbarBtnText}>הוסף טקסט</Text>
        </TouchableOpacity>
      </ScrollView>
      {/* כפתור סיום עריכה */}
      {editMode && (
        <TouchableOpacity style={{ position: 'absolute', top: 30, right: 20, zIndex: 30, backgroundColor: '#fff', borderRadius: 20, padding: 8, elevation: 4 }} onPress={() => setEditMode(false)}>
          <Text style={{ fontSize: 14, color: '#333' }}>סיום עריכה</Text>
          <Ionicons name="checkmark" size={28} color="#333" />
        </TouchableOpacity>
      )}
      {/* Canvas */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.canvasScroll}
        contentContainerStyle={{ 
          width: width * 3,
          height: height * 2,
        }}
        maximumZoomScale={3}
        minimumZoomScale={0.375}
        scrollEnabled={!selectedTableForDrag}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        bouncesZoom={false}
      >
        <View style={styles.canvas}>
          {/* Grid */}
          {[...Array(Math.ceil((height * 2) / 50))].map((_, i) => (
            <View key={i} style={[styles.gridLine, { top: i * 50 }]} />
          ))}
          {[...Array(Math.ceil((width * 3) / 80))].map((_, i) => (
            <View key={i} style={[styles.gridLineV, { left: i * 80 }]} />
          ))}
          {/* Tables */}
          {isPositionsReady && tables.map(table => (
            <Animated.View
              key={table.id}
              style={[
                styles.table,
                table.shape === 'rectangle' ? styles.tableRect : styles.tableSquare,
                {
                  transform: positions[table.id] ? positions[table.id].getTranslateTransform() : [],
                },
                editMode && {
                  zIndex: 10,
                  borderColor: 'red',
                  borderWidth: 2,
                },
                selectedTableForDrag === table.id && {
                  backgroundColor: '#333',
                },
              ]}
              onStartShouldSetResponder={() => true}
              onResponderGrant={e => handleTouchStart(table, e)}
              onResponderMove={e => handleTouchMove(table, e)}
              onResponderRelease={() => handleTouchEnd(table)}
            >
              {editMode ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[
                    styles.tableName,
                    selectedTableForDrag === table.id && { color: '#fff' }
                  ]}>{table.number}</Text>
                  <Text style={[
                    styles.tableCap,
                    selectedTableForDrag === table.id && { color: '#ccc' }
                  ]}>{table.seated_guests}</Text>
                </View>
              ) : (
                <Pressable
                  onPressIn={() => setPressedTable(table.id)}
                  onPressOut={() => setPressedTable(null)}
                  onLongPress={() => {
                    setPressedTable(null);
                    setTableForChoice(table);
                    setChoiceModalVisible(true);
                  }}
                  delayLongPress={400}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={[
                    styles.tableName,
                    pressedTable === table.id && { color: '#666' }
                  ]}>{table.number}</Text>
                  <Text style={[
                    styles.tableCap,
                    pressedTable === table.id && { color: '#999' }
                  ]}>{table.seated_guests }</Text>
                </Pressable>
              )}
            </Animated.View>
          ))}
          {/* Text Areas */}
          {textAreas.map((t, idx) => (
            <View
              key={t.id}
              style={[styles.textArea, { top: t.y ?? 200 + (idx % Math.floor((height * 2 - 300) / 40)) * 40, left: t.x ?? 200 }]}
              onStartShouldSetResponder={() => true}
              onResponderGrant={e => onTextPressIn(t, e)}
              onResponderMove={e => onTextMove(t, e)}
              onResponderRelease={e => onTextPressOut(t, e)}
            >
              <TouchableOpacity style={{ alignItems: 'center' }} onLongPress={() => openTextModal(t)}>
                <Text style={styles.textAreaText}>{t.text}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
      {/* Modal Edit Table */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>עריכת שולחן</Text>
            <Text style={styles.modalLabel}>מספר שולחן</Text>
            <TextInput
              style={styles.input}
              value={String(selectedTable?.number || '')}
              onChangeText={number => setSelectedTable({ ...selectedTable, number: Number(number) })}
              placeholder="מספר שולחן"
              keyboardType="numeric"
            />
            <Text style={styles.modalLabel}>מספר מקומות</Text>
            <TextInput
              style={styles.input}
              value={String(selectedTable?.capacity || '')}
              onChangeText={capacity => setSelectedTable({ ...selectedTable, capacity: Number(capacity) })}
              placeholder="מספר מקומות"
              keyboardType="numeric"
            />
            <Text style={styles.modalLabel}>אנשים שהושבו</Text>
            <TextInput
              style={styles.input}
              value={String(selectedTable?.seated_guests ?? '0')}
              editable={false}
              placeholder="אנשים שהושבו"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              <TouchableOpacity style={styles.modalBtn} onPress={saveEdit}>
                <Text style={styles.modalBtnText}>שמור</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e57373' }]} onPress={() => { deleteTable(selectedTable.id); setModalVisible(false); }}>
                <Text style={styles.modalBtnText}>מחק</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Modal Edit Text */}
      <Modal visible={textModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>עריכת טקסט</Text>
            <TextInput
              style={styles.input}
              value={selectedText?.text}
              onChangeText={text => setSelectedText({ ...selectedText, text })}
              placeholder="טקסט חופשי"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              <TouchableOpacity style={styles.modalBtn} onPress={saveTextEdit}>
                <Text style={styles.modalBtnText}>שמור</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e57373' }]} onPress={() => deleteTextArea(selectedText.id)}>
                <Text style={styles.modalBtnText}>מחק</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setTextModal(false)}>
                <Text style={styles.modalBtnText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Choice */}
      <Modal visible={choiceModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>מה תרצה לעשות?</Text>
            <TouchableOpacity 
              style={[styles.modalBtn, { marginVertical: 8, width: '100%' }]} 
              onPress={() => {
                setEditMode(true);
                setChoiceModalVisible(false);
              }}
            >
              <Text style={styles.modalBtnText}>עריכת השולחנות (גרירה)</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalBtn, { marginVertical: 8, width: '100%' }]} 
              onPress={() => {
                setSelectedTable(tableForChoice);
                setChoiceModalVisible(false);
                setModalVisible(true);
              }}
            >
              <Text style={styles.modalBtnText}>עריכת פרטי השולחן</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalBtn, { marginVertical: 8, width: '100%' }]} 
              onPress={() => setChoiceModalVisible(false)}
            >
              <Text style={styles.modalBtnText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backBtn: { position: 'absolute', top: 30, left: 20, zIndex: 20, backgroundColor: '#fff', borderRadius: 20, padding: 6, elevation: 4 },
  toolbarScroll: { maxHeight: 60, backgroundColor: '#f7f7f7', borderBottomWidth: 1, borderColor: '#eee', marginTop: 60 },
  toolbarContent: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, padding: 8, backgroundColor: '#fff', borderRadius: 8, elevation: 2 },
  toolbarBtnText: { marginLeft: 6, fontSize: 16, color: '#333' },
  canvasScroll: { flex: 1, backgroundColor: '#fff' },
  canvas: { 
    width: width * 3,
    height: height * 2,
    backgroundColor: '#fff', 
    overflow: 'hidden',
  },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#eee' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#eee' },
  table: { position: 'absolute', alignItems: 'center', justifyContent: 'center', elevation: 4, backgroundColor: '#fafafa', borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, borderWidth: 1, borderColor: '#ddd' },
  tableSquare: { width: 70, height: 70 },
  tableRect: { width: 60, height: 110 },
  tableName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  tableCap: { fontSize: 14, color: '#888' },
  textArea: { position: 'absolute', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#bbb', minWidth: 60, minHeight: 30, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  textAreaText: { fontSize: 16, color: '#444' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 300, elevation: 6 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 16, textAlign: 'right' },
  modalBtn: { backgroundColor: '#e8a7a8', borderRadius: 8, padding: 10, marginHorizontal: 4, minWidth: 60, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: 'bold' },
  editBtn: { position: 'absolute', top: 2, right: 2, zIndex: 10, backgroundColor: '#fff', borderRadius: 12, padding: 2, elevation: 2 },
  modalLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
    textAlign: 'right',
  },
}); 