import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mealLogsApi } from '@/api'
import { ApiRequestError } from '@/api/client'
import { Modal, Button, Input, Textarea } from '@/components/ui'
import { Trash2 } from 'lucide-react'
import type { MealLog } from '@/types/api'

/**
 * Lightweight editor for an existing meal log.
 *
 * Covers the common corrections: feeding time, per-item portion amounts,
 * deviation reason, and notes. The set of food items on the meal is not
 * changed here (that is the rarer case and is better served by deleting and
 * re-logging). Deletion is a soft delete on the backend, so it is recoverable.
 *
 * The backend recomputes deviation automatically when fed_at changes.
 */
export function EditMealModal({ log, onClose }: { log: MealLog; onClose: () => void }) {
  const qc = useQueryClient()

  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time. log.fed_at is a
  // UTC ISO string (now correctly suffixed), so convert to local for editing.
  const toLocalInput = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [fedAt, setFedAt]   = useState(toLocalInput(log.fed_at))
  const [notes, setNotes]   = useState(log.notes ?? '')
  const [reason, setReason] = useState(log.deviation_reason ?? '')
  const [portions, setPortions] = useState<Record<number, string>>(
    Object.fromEntries(log.items.map(i => [i.id, String(i.portion_grams)]))
  )
  const [error, setError]   = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => mealLogsApi.update(log.id, {
      fed_at: new Date(fedAt).toISOString(),
      notes:  notes || undefined,
      deviation_reason: reason || undefined,
      // Send items back with edited portions, preserving food selection.
      items: log.items.map(i => ({
        food_item_id: i.food_item_id,
        portion_grams: parseFloat(portions[i.id]) || i.portion_grams,
        notes: i.notes ?? undefined,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-logs'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiRequestError ? e.detail : 'Failed to save changes.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => mealLogsApi.delete(log.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-logs'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiRequestError ? e.detail : 'Failed to delete.'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Edit meal">
      <div className="flex flex-col gap-4">
        <Input
          label="Feeding time"
          type="datetime-local"
          value={fedAt}
          onChange={e => setFedAt(e.target.value)}
        />

        {/* Per-item portions */}
        {log.items.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-forest-800">Portions</label>
            {log.items.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-forest-700 truncate">
                  {item.food_item.name}
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={portions[item.id]}
                  onChange={e => setPortions(p => ({ ...p, [item.id]: e.target.value }))}
                  className="w-20 text-sm px-2 py-1 rounded-lg border border-stone-200 bg-white text-right"
                />
                <span className="text-xs text-stone-400">g</span>
              </div>
            ))}
          </div>
        )}

        <Textarea
          label="Deviation reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why was this meal off-schedule?"
        />

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any observations about this meal…"
        />

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        <Button
          size="lg"
          className="w-full"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save changes
        </Button>

        {/* Delete: two-tap confirm to avoid accidental removal */}
        {confirmDelete ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-stone-500 text-center">
              Delete this meal log? This can be undone by an administrator.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center justify-center gap-1.5 text-sm text-red-500 py-1"
          >
            <Trash2 size={14} /> Delete meal
          </button>
        )}
      </div>
    </Modal>
  )
}
