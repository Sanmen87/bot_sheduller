'use client'

import React, { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { RequireAuth, useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

// ──────────────────────────────────────────────────────────────────────────────
// Константы диапазона и шага времени
// ──────────────────────────────────────────────────────────────────────────────
const HOURS_START = 7   // 07:00
const HOURS_END   = 22  // 22:00
const MINUTE_PX   = 2   // высота 1 минуты в пикселях (для вертикальной шкалы)

// ──────────────────────────────────────────────────────────────────────────────
// Типы (в синхроне с API)
// ──────────────────────────────────────────────────────────────────────────────
type UserRole = 'guest' | 'client' | 'teacher' | 'admin'

type Teacher = {
  id: number
  user_id?: number
  user_name?: string
  name?: string
}

type Subject = { id: number; name: string }

type SlotStatus = 'available' | 'booked' | 'canceled' | 'hidden' | 'tentative'

type Slot = {
  id: number
  teacher_id: number
  subject_id: number
  date: string            // YYYY-MM-DD
  start_time: string      // HH:MM:SS
  end_time: string        // HH:MM:SS
  mode?: 'online' | 'offline'
  capacity: number
  status: SlotStatus
}

// ──────────────────────────────────────────────────────────────────────────────
// Утилиты
// ──────────────────────────────────────────────────────────────────────────────
function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function fmtDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRuLong(d: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(d)
}

function minutesFromMidnight(t: string) {
  const [H, M] = t.split(':').map(Number)
  return H * 60 + M
}

function toTimeInput(value: string) {
  // 'HH:MM:SS' -> 'HH:MM'
  const [h, m] = value.split(':')
  return `${h}:${m}`
}

const statusColor: Record<SlotStatus, string> = {
  available: 'bg-emerald-500/90 hover:bg-emerald-600',
  booked: 'bg-blue-500/90 hover:bg-blue-600',
  canceled: 'bg-red-500/90',
  hidden: 'bg-gray-500/80',
  tentative: 'bg-violet-500/90 hover:bg-violet-600',
}

// ──────────────────────────────────────────────────────────────────────────────
/** API */
// ──────────────────────────────────────────────────────────────────────────────
async function fetchTeachers(): Promise<Teacher[]> {
  const res = await api.get('/teachers')
  return (res?.items ?? res ?? []).map((t: any) => ({
    id: t.id ?? t.user_id ?? t.teacher_id,
    user_id: t.user_id ?? t.id,
    user_name: t.user_name ?? t.name,
    name: t.name ?? t.user_name,
  }))
}

async function fetchSubjects(): Promise<Subject[]> {
  const res = await api.get('/subjects')
  return res?.items ?? res ?? []
}

async function fetchSlotsForDate(date: string, teacherIds?: number[]): Promise<Slot[]> {
  if (teacherIds && teacherIds.length) {
    const all: Slot[] = []
    for (const id of teacherIds) {
      const data = await api.get(`/teachers/${id}/slots`, { params: { date_from: date, date_to: date } })
      const items = data?.items ?? data ?? []
      all.push(...items)
    }
    return all
  }
  const data = await api.get('/admin/calendar', { params: { from: date, to: date } })
  return data?.items ?? data ?? []
}

async function createSlotsByInterval(params: {
  teacher_id: number
  date: string
  subject_id: number
  start_time: string // 'HH:MM'
  end_time: string   // 'HH:MM'
  step_min?: number
  capacity: number
  mode: 'online' | 'offline'
  status: SlotStatus
}) {
  const { teacher_id, date, subject_id, start_time, end_time, step_min, capacity, mode, status } = params
  return api.post(`/teachers/${teacher_id}/slots`, {
    date,
    subject_id,
    start_time: `${start_time}:00`,
    end_time: `${end_time}:00`,
    step_min,
    capacity,
    mode,
    status,
    skip_conflicts: true,
  })
}

async function patchSlot(id: number, patch: Partial<Slot>) {
  const body: any = { ...patch }
  if (body.start_time && body.start_time.length === 5) body.start_time = body.start_time + ':00'
  if (body.end_time && body.end_time.length === 5) body.end_time = body.end_time + ':00'
  return api.patch(`/slots/${id}`, body)
}

// ──────────────────────────────────────────────────────────────────────────────
// UI: вспомогательные компоненты
// ──────────────────────────────────────────────────────────────────────────────
function DateSwitcher({ date, setDate }: { date: Date; setDate: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setDate(addDays(date, -1))}>←</Button>
      <div className="font-medium min-w-[10rem] text-right">{formatRuLong(date)}</div>
      <Button variant="outline" onClick={() => setDate(addDays(date, +1))}>→</Button>
      <Input
        type="date"
        className="ml-2"
        value={fmtDate(date)}
        onChange={(e) => setDate(new Date(e.target.value))}
      />
    </div>
  )
}

function TimeAxis() {
  const hours = []
  for (let h = HOURS_START; h <= HOURS_END; h++) hours.push(h)
  const totalHeight = (HOURS_END - HOURS_START + 1) * 60 * MINUTE_PX

  return (
    <div className="sticky right-0 top-[52px] h[calc(100vh-64px)] sm:h-[calc(100vh-64px)] overflow-hidden w-16 border-l bg-white z-10">
      <div className="relative" style={{ height: totalHeight }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute w-full pl-1 text-xs text-gray-500 text-right pr-1"
            style={{ top: (h - HOURS_START) * 60 * MINUTE_PX - 6 }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>
    </div>
  )
}

function TeacherHeader({ t }: { t: Teacher }) {
  const label = t.user_name || t.name || `#${t.id}`
  return (
    <div className="px-2 py-2 text-sm font-medium truncate" title={label}>
      {label}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Modal: создание/редактирование слота
// ──────────────────────────────────────────────────────────────────────────────
function SlotModal(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  teacher?: Teacher
  date: string
  subjects: Subject[]
  initial?: Partial<Slot>
  onSaved: () => void
}) {
  const { open, onOpenChange, mode, teacher, date, subjects, initial, onSaved } = props

  // локальные состояния
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined)
  const [start, setStart] = useState<string>('09:00')
  const [end, setEnd] = useState<string>('10:00')
  const [capacity, setCapacity] = useState<number>(1)
  const [formatMode, setFormatMode] = useState<'online' | 'offline'>('online')
  const [status, setStatus] = useState<SlotStatus>('available')

  const isEdit = mode === 'edit'

  // 🔧 СИНХРОНИЗАЦИЯ ПРИ ОТКРЫТИИ/СМЕНЕ initial
  useEffect(() => {
    if (!open) return
    setSubjectId(initial?.subject_id ?? undefined)
    setStart(initial?.start_time ? toTimeInput(initial.start_time) : '09:00')
    setEnd(initial?.end_time ? toTimeInput(initial.end_time) : '10:00')
    setCapacity(initial?.capacity ?? 1)
    setFormatMode((initial?.mode as any) ?? 'online')
    setStatus((initial?.status as any) ?? 'available')
  }, [open, initial?.id]) // важно: зависимость от id слота

  async function onSubmit() {
    try {
      if (!teacher?.id) throw new Error('Не выбран преподаватель')
      if (!subjectId) throw new Error('Выбери предмет')

      if (isEdit && initial?.id) {
        // 👇 отправляем все поля, даже если поменяли только время
        await patchSlot(initial.id, {
          subject_id: subjectId,
          start_time: start,
          end_time: end,
          capacity,
          mode: formatMode,
          status,
        })
      } else {
        await createSlotsByInterval({
          teacher_id: teacher.id,
          date,
          subject_id: subjectId,
          start_time: start,
          end_time: end,
          step_min: undefined,
          capacity,
          mode: formatMode,
          status,
        })
      }

      onOpenChange(false)
      toast.success(isEdit ? 'Слот обновлён' : 'Слот(ы) создан(ы)')
      onSaved()
    } catch (e: any) {
      // покажем текст ответа бэкенда, если есть
      const msg = e?.message || e?.detail || 'Ошибка сохранения'
      toast.error(msg)
    }
  }

  // чтобы placeholder работал, для shadcn Select value должен быть undefined, а не ''.
  const subjectValue = subjectId != null ? String(subjectId) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать слот' : 'Создать слоты'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="text-sm text-gray-600">
            {teacher ? `Учитель: ${teacher.user_name || teacher.name}` : ''} · Дата: {date}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Начало</label>
              <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Окончание</label>
              <Input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Предмет</label>
            <Select value={subjectValue} onValueChange={(v) => setSubjectId(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выбери предмет" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <label className="text-xs text-gray-500">Тип занятия</label>
              <Select
                value={capacity > 1 ? 'group' : 'individual'}
                onValueChange={(v) => setCapacity(v === 'group' ? Math.max(2, capacity || 6) : 1)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Индивидуально</SelectItem>
                  <SelectItem value="group">Групповое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Формат</label>
              <Select value={formatMode} onValueChange={(v: 'online' | 'offline') => setFormatMode(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Онлайн</SelectItem>
                  <SelectItem value="offline">Оффлайн</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Статус</label>
              <Select value={status} onValueChange={(v: SlotStatus) => setStatus(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Доступен</SelectItem>
                  <SelectItem value="tentative">Предварительный</SelectItem>
                  <SelectItem value="hidden">Скрыт</SelectItem>
                  <SelectItem value="canceled">Отменён</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {capacity > 1 && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <div className="text-sm">Вместимость</div>
              <Input
                type="number"
                min={2}
                max={30}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value) || 2)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={onSubmit}>{isEdit ? 'Сохранить' : 'Создать'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Страница
// ──────────────────────────────────────────────────────────────────────────────
export default function SlotsPage() {
  return (
    <RequireAuth>
      <SlotsInner />
    </RequireAuth>
  )
}

function SlotsInner() {
  const role = useAuth((s) => s.me?.role as UserRole)
  const [date, setDate] = useState<Date>(new Date())
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [activeTeacher, setActiveTeacher] = useState<Teacher | undefined>(undefined)
  const [editingSlot, setEditingSlot] = useState<Slot | undefined>(undefined)

  const dateStr = useMemo(() => fmtDate(date), [date])

  useEffect(() => {
    ;(async () => {
      const [ts, subs] = await Promise.all([fetchTeachers(), fetchSubjects()])
      setTeachers(ts)
      setSubjects(subs)
    })()
  }, [])

  async function loadSlots() {
    try {
      setLoading(true)
      const data = await fetchSlotsForDate(dateStr, teachers.map((t) => t.id))
      setSlots(data)
    } catch (e) {
      toast.error('Не удалось загрузить слоты')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (teachers.length) loadSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, teachers.length])

  // группировка слотов по учителям + фильтр по дате на всякий случай
  const slotsByTeacher = useMemo(() => {
    const map: Record<number, Slot[]> = {}
    for (const s of slots) {
      if (s.date !== dateStr) continue
      if (!map[s.teacher_id]) map[s.teacher_id] = []
      map[s.teacher_id].push(s)
    }
    return map
  }, [slots, dateStr])

  function onEmptyCellClick(t: Teacher, _minuteFrom: number) {
    setActiveTeacher(t)
    setEditingSlot(undefined)
    setModalMode('create')
    setModalOpen(true)
  }

  function onSlotClick(s: Slot) {
    setActiveTeacher(teachers.find((t) => t.id === s.teacher_id))
    setEditingSlot(s)
    setModalMode('edit')
    setModalOpen(true)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-10">
        <div className="text-lg font-semibold">Слоты на дату</div>
        <DateSwitcher date={date} setDate={setDate} />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="min-w-[720px] grid"
          style={{ gridTemplateColumns: `repeat(${teachers.length}, minmax(220px, 1fr)) 72px` }}
        >
          {/* Header row */}
          {teachers.map((t) => (
            <div key={t.id} className="border-b sticky top-[52px] bg-white z-10 border-l">
              <TeacherHeader t={t} />
            </div>
          ))}
          <div className="border-b sticky top-[52px] bg-white z-10 text-right pr-2 text-xs text-gray-500">
            Время
          </div>

          {/* Body: колонки учителей */}
          {teachers.map((t) => (
            <TeacherColumn
              key={t.id}
              teacher={t}
              date={dateStr}
              slots={slotsByTeacher[t.id] ?? []}
              onEmptyCellClick={(m) => onEmptyCellClick(t, m)}
              onSlotClick={onSlotClick}
            />
          ))}

          {/* Правая ось времени */}
          <TimeAxis />
        </div>
      </div>

      <SlotModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        teacher={activeTeacher}
        date={dateStr}
        subjects={subjects}
        initial={editingSlot}
        onSaved={loadSlots}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Колонка преподавателя
// ──────────────────────────────────────────────────────────────────────────────
function TeacherColumn({
  teacher,
  date,
  slots,
  onEmptyCellClick,
  onSlotClick,
}: {
  teacher: Teacher
  date: string
  slots: Slot[]
  onEmptyCellClick: (minuteFrom: number) => void
  onSlotClick: (s: Slot) => void
}) {
  const totalHeight = (HOURS_END - HOURS_START) * 60 * MINUTE_PX
  const bgRows = useMemo(() => Array.from({ length: (HOURS_END - HOURS_START) * 4 }, () => 1), [])

  return (
    <div className="relative border-l">
      {/* фоновые линии (каждые 15 минут) */}
      <div className="absolute inset-0 pointer-events-none">
        {bgRows.map((_, idx) => (
          <div
            key={idx}
            className={clsx('w-full border-t', idx % 2 === 0 ? 'border-gray-200' : 'border-gray-100')}
            style={{ height: 15 * MINUTE_PX }}
          />
        ))}
      </div>

      {/* зона клика (двойной клик) */}
      <div
        className="relative"
        style={{ height: totalHeight }}
        onDoubleClick={(e) => {
          const el = e.currentTarget as HTMLDivElement
          const rect = el.getBoundingClientRect()
          const y = e.clientY - rect.top
          const minuteFrom = Math.max(0, Math.round(y / MINUTE_PX / 15) * 15)
          const absoluteMinute = HOURS_START * 60 + minuteFrom
          if (absoluteMinute >= HOURS_END * 60) return
          onEmptyCellClick(minuteFrom)
        }}
        title="Двойной клик — создать слот"
      >
        {slots.map((s) => (
          <SlotBlock key={s.id} slot={s} onClick={() => onSlotClick(s)} />
        ))}
      </div>
    </div>
  )
}

function SlotBlock({ slot, onClick }: { slot: Slot; onClick: () => void }) {
  const startMin = minutesFromMidnight(slot.start_time)
  const endMin = minutesFromMidnight(slot.end_time)
  const top = (startMin - HOURS_START * 60) * MINUTE_PX
  const height = Math.max(20, (endMin - startMin) * MINUTE_PX - 2)
  const freeTitle = `${slot.mode ?? ''} ${slot.status} · ${slot.capacity > 1 ? `группа до ${slot.capacity}` : 'индив.'}`

  return (
    <div
      className={clsx(
        'absolute left-1 right-1 rounded-md text-white text-xs shadow cursor-pointer px-2 py-1',
        statusColor[slot.status]
      )}
      style={{ top, height }}
      onClick={onClick}
      title={freeTitle}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{toTimeInput(slot.start_time)}–{toTimeInput(slot.end_time)}</div>
        <div className="uppercase text-[10px] opacity-90">{slot.mode}</div>
      </div>
      <div className="truncate opacity-90">{slot.capacity > 1 ? `Группа (${slot.capacity})` : 'Индивидуально'}</div>
    </div>
  )
}
