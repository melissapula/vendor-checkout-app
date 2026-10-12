import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AppModal from '../components/AppModal';
import { useEvents } from '../context/EventsContext';
import { Event } from '../types/database';
import EventFormScreen from './EventFormScreen';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { colors } from '../lib/theme';

function formatRange(event: Event): string {
  if (event.start_date === event.end_date) return event.start_date;
  return `${event.start_date} – ${event.end_date}`;
}

function EventRow({ event, onPress }: { event: Event; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowInfo}>
        <Text style={styles.title}>{event.name}</Text>
        <Text style={styles.meta}>{formatRange(event)}</Text>
        {event.notes && <Text style={styles.notes}>{event.notes}</Text>}
      </View>
    </Pressable>
  );
}

export default function EventsScreen({ onClose }: { onClose: () => void }) {
  const { events, loading, error } = useEvents();
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const { isTabletUp } = useBreakpoint();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Events</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load events: {error}</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No events yet — add one to have Reports automatically group sales by show/venue.
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <EventRow
              event={item}
              onPress={() => {
                setEditingEvent(item);
                setFormOpen(true);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <Pressable
          style={styles.addButton}
          onPress={() => {
            setEditingEvent(undefined);
            setFormOpen(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add Event</Text>
        </Pressable>
      </View>

      <AppModal visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        <EventFormScreen event={editingEvent} onClose={() => setFormOpen(false)} />
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  heading: { fontSize: 17, fontWeight: '700' },
  closeText: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b00020', textAlign: 'center' },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center' },
  row: { paddingHorizontal: 16, paddingVertical: 12 },
  rowInfo: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  notes: { fontSize: 13, color: '#999', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  addButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
