import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEvents } from '../context/EventsContext';
import { appAlert } from '../lib/alert';
import { Event } from '../types/database';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { colors } from '../lib/theme';

export default function EventFormScreen({ event, onClose }: { event?: Event; onClose: () => void }) {
  const { addEvent, updateEvent, deleteEvent } = useEvents();
  const [submitting, setSubmitting] = useState(false);
  const { isTabletUp } = useBreakpoint();

  const [name, setName] = useState(event?.name ?? '');
  const [startDate, setStartDate] = useState(event?.start_date ?? '');
  const [endDate, setEndDate] = useState(event?.end_date ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');

  function parseDate(text: string): Date | null {
    const parts = text.trim().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  async function handleSave() {
    if (!name.trim()) return appAlert('Missing name', 'Give this event a name.');
    const start = parseDate(startDate);
    if (!start) return appAlert('Invalid start date', 'Enter a start date as YYYY-MM-DD.');
    const end = parseDate(endDate || startDate);
    if (!end) return appAlert('Invalid end date', 'Enter an end date as YYYY-MM-DD.');
    if (end < start) return appAlert('Invalid dates', 'End date must be on or after the start date.');

    const payload = {
      name: name.trim(),
      start_date: startDate.trim(),
      end_date: (endDate || startDate).trim(),
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (event) {
        await updateEvent(event.id, payload);
      } else {
        await addEvent(payload);
      }
      onClose();
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save this event.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!event) return;
    appAlert('Delete this event?', `${event.name} — past reports/sales won't lose their data, they'll just no longer show this event's name.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await deleteEvent(event.id);
            onClose();
          } catch (err) {
            appAlert('Delete failed', err instanceof Error ? err.message : 'Could not delete this event.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Text style={styles.heading}>{event ? 'Edit Event' : 'New Event'}</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bemidji Fall Festival"
          onSubmitEditing={handleSave}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Start date</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-09-05"
              onSubmitEditing={handleSave}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>End date</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-09-07 (or blank for a single day)"
              onSubmitEditing={handleSave}
            />
          </View>
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </ScrollView>

      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </Pressable>
        {event && (
          <Pressable disabled={submitting} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete event</Text>
          </Pressable>
        )}
        <Pressable disabled={submitting} onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  saveButton: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteText: { textAlign: 'center', color: '#b00020', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666' },
});
