'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { RequireAuth, useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { patchSlot, createSlotsByInterval, deleteSlot } from '@/lib/api'

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

type LessonType = 'individual'|'group' 

type ModeType = 'online'|'offline'

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
  lesson_type?: 'individual' | 'group'
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
  const res = await api.get<{ items?: any[] } | any[]>('/teachers')
  const list = Array.isArray(res) ? res : (res?.items ?? [])
  return list.map((t: any) => ({
    id: t.id ?? t.user_id ?? t.teacher_id,
    user_id: t.user_id ?? t.id,
    user_name: t.user_name ?? t.name,
    name: t.name ?? t.user_name,
  }))
}

async function fetchSubjects(): Promise<Subject[]> {
  const res = await api.get<{ items?: Subject[] } | Subject[]>('/subjects')
  return Array.isArray(res) ? res : (res?.items ?? [])
}

async function fetchSlotsForDate(date: string, teacherIds?: number[]): Promise<Slot[]> {
  if (teacherIds && teacherIds.length) {
    const all: Slot[] = []
    for (const id of teacherIds) {
      const qs = new URLSearchParams({ date_from: date, date_to: date }).toString()
      const data = await api.get<{ items?: Slot[] } | Slot[]>(`/teachers/${id}/slots?${qs}`)
      const items = Array.isArray(data) ? data : (data?.items ?? [])
      all.push(...items)
    }
    return all
  }
  const qs = new URLSearchParams({ from: date, to: date }).toString()
  const data = await api.get<{ items?: Slot[] } | Slot[]>(`/admin/calendar?${qs}`)
  return Array.isArray(data) ? data : (data?.items ?? [])
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

function TimeAxis({ nowMinuteAbs }: { nowMinuteAbs: number | null }) {
  const hours: number[] = []
  for (let h = HOURS_START; h <= HOURS_END; h++) hours.push(h)
  // важное: высота как у колонок учителей — без +1 часа
  const totalHeight = (HOURS_END - HOURS_START) * 60 * MINUTE_PX

  const inRange =
    nowMinuteAbs != null &&
    nowMinuteAbs >= HOURS_START * 60 &&
    nowMinuteAbs <= HOURS_END * 60
  const nowTop = inRange ? (nowMinuteAbs! - HOURS_START * 60) * MINUTE_PX : null

  return (
    // только горизонтальный sticky (к правому краю), НЕТ top/overflow
    <div className="sticky right-0 w-16 border-l bg-white z-10">
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

        {inRange && (
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: nowTop! }}>
            <div className="border-t border-red-500" />
          </div>
        )}
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
function toTimeInput(v?: string | null): string {
  // из "HH:MM:SS" → "HH:MM"
  if (!v) return ''
  return v.length >= 5 ? v.slice(0, 5) : v
}

const SlotModal = (props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'create' | 'edit'
  teacher?: Teacher
  date: string
  subjects: Subject[]
  initial?: Partial<Slot>
  onSaved: () => void
}) => {
  const { open, onOpenChange, mode, teacher, date, subjects, initial, onSaved } = props
  const isEdit = mode === 'edit'

  // --- локальное состояние формы
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined)
  const [start, setStart] = useState<string>('09:00') // HH:MM
  const [end, setEnd] = useState<string>('10:00')     // HH:MM
  const [lessonType, setLessonType] = useState<LessonType>('individual')
  const [capacity, setCapacity] = useState<number>(1)
  const [modeValue, setModeValue] = useState<ModeType>('online')
  const [status, setStatus] = useState<SlotStatus>('available')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // --- префилл при открытии/смене initial
  useEffect(() => {
    if (!open) return
    setSubjectId(initial?.subject_id ?? undefined)
    setStart(initial?.start_time ? toTimeInput(initial.start_time) : '09:00')
    setEnd(initial?.end_time ? toTimeInput(initial.end_time) : '10:00')
    // lesson_type и capacity: если capacity > 1 → group, иначе individual
    const lt: LessonType =
      (initial?.lesson_type as LessonType) ??
      ((initial?.capacity && initial.capacity > 1) ? 'group' : 'individual')
    setLessonType(lt)
    setCapacity(
      lt === 'individual' ? 1 : Math.max(2, initial?.capacity ?? 2)
    )
    setModeValue((initial?.mode as ModeType) ?? 'online')
    setStatus((initial?.status as SlotStatus) ?? 'available')
    // важно: зависимость от id слота, чтобы при выборе другого слота обновлялись поля
  }, [open, initial?.id])
  
  // --- вспомогательные вычисления
  const subjectValue = subjectId != null ? String(subjectId) : undefined
  const canSubmit = useMemo(() => {
    if (!teacher?.id) return false
    if (!date) return false
    if (!subjectId) return false
    if (!start || !end) return false
    // простая клиентская проверка диапазона
    return start < end
  }, [teacher?.id, date, subjectId, start, end])

  // --- обработчик смены типа занятия
  function onChangeLessonType(v: LessonType) {
    setLessonType(v)
    if (v === 'individual') {
      setCapacity(1)
    } else {
      setCapacity((prev) => Math.max(2, prev || 2))
    }
  }

  async function onSubmit() {
    try {
      if (!canSubmit) {
        toast.error('Проверьте корректность полей формы')
        return
      }
      setSaving(true)

      if (isEdit && initial?.id) {
        // отправляем все ключевые поля, включая lesson_type
        await patchSlot(initial.id, {
          subject_id: subjectId!,
          start_time: start, // нормализуется до HH:MM:SS в api.patchSlot
          end_time: end,
          lesson_type: lessonType,
          capacity,
          mode: modeValue,
          status,
        })
      } else {
        await createSlotsByInterval({
          teacher_id: teacher!.id,
          date,
          subject_id: subjectId!,
          start_time: start, // "HH:MM" — нормализуйте внутри createSlotsByInterval аналогично
          end_time: end,
          step_min: undefined, // если не нужен шаг
          lesson_type: lessonType,
          capacity,
          mode: modeValue,
          status,
        })
      }

      toast.success(isEdit ? 'Слот обновлён' : 'Слот(ы) создан(ы)')
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      const msg = e?.message || e?.detail || 'Ошибка сохранения'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

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
            <Select
                key={`subject-${open}-${initial?.id}-${subjectValue ?? 'none'}`}
                value={subjectValue}
                onValueChange={(v) => setSubjectId(Number(v))}
            >
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
              {/* Тип занятия */}
              <Select 
                value={lessonType ?? 'individual'} 
                onValueChange={(v) => onChangeLessonType(v as LessonType)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Индивидуально</SelectItem>
                  <SelectItem value="group">Групповое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Формат</label>
              <Select 
                value={modeValue ?? 'online'} 
                onValueChange={(v) => setModeValue(v as ModeType)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Формат" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Онлайн</SelectItem>
                  <SelectItem value="offline">Оффлайн</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Статус</label>
              <Select 
                value={status ?? 'available'} 
                onValueChange={(v) => setStatus(v as SlotStatus)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Доступен</SelectItem>
                  <SelectItem value="tentative">Предварительный</SelectItem>
                  <SelectItem value="hidden">Скрыт</SelectItem>
                  <SelectItem value="canceled">Отменён</SelectItem>
                  {/* Если нужно — можно добавить booked, но редактирование в booked обычно ограничивают */}
                </SelectContent>
              </Select>
            </div>
          </div>

          {lessonType === 'group' && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <div className="text-sm">Вместимость</div>
              <Input
                type="number"
                min={2}
                max={30}
                value={capacity}
                onChange={(e) => {
                  const v = Number(e.target.value) || 2
                  setCapacity(Math.max(2, Math.min(30, v)))
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          {isEdit ? (
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={saving || deleting}
              className={!('destructive' in (Button as any)) ? 'text-red-600 border-red-300 hover:bg-red-50' : undefined}
            >
              {deleting ? 'Удаление…' : 'Удалить'}
            </Button>
          ) : (
            <span /> 
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Отмена
            </Button>
            <Button onClick={onSubmit} disabled={!canSubmit || saving || deleting}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )


  async function onDelete() {
    if (!initial?.id) return
    const ok = window.confirm('Удалить этот слот? Действие необратимо.')
    if (!ok) return
    try {
      setDeleting(true)
      await deleteSlot(initial.id)
      toast.success('Слот удалён')
      onOpenChange(false)
      onSaved() // перезагружает список
    } catch (e: any) {
      // Если на бэке 409 при активных бронях — сообщение придёт в e.message
      toast.error(e?.message || 'Не удалось удалить слот')
    } finally {
      setDeleting(false)
    }
  }
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
  const initialScrollDone = useRef(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [activeTeacher, setActiveTeacher] = useState<Teacher | undefined>(undefined)
  const [editingSlot, setEditingSlot] = useState<Slot | undefined>(undefined)
  const [nowMinuteAbs, setNowMinuteAbs] = useState<number | null>(null)
  

  const dateStr = useMemo(() => fmtDate(date), [date])
  // map предметов: id -> name
  const subjectsMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const s of subjects) m[s.id] = s.name
    return m
  }, [subjects])

  useEffect(() => {
    initialScrollDone.current = false
  }, [dateStr])

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
    const tick = () => {
      const now = new Date()
      const todayStr = fmtDate(now)
      if (todayStr === dateStr) {
        setNowMinuteAbs(now.getHours() * 60 + now.getMinutes())
      } else {
      setNowMinuteAbs(null)
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [dateStr])

  useEffect(() => {
    if (nowMinuteAbs == null) return
    if (initialScrollDone.current) return
    const el = document.getElementById('slots-scroll')
    if (!el) return
    const y = Math.max(0, (nowMinuteAbs - HOURS_START * 60) * MINUTE_PX - 200)
    // если хочешь плавно:
    // el.scrollTo({ top: y, behavior: 'smooth' })
    el.scrollTo?.({ top: y, behavior: 'smooth' })
    initialScrollDone.current = true
  }, [nowMinuteAbs, dateStr])

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
      <div id="slots-scroll" className="flex-1 overflow-x-auto overflow-y-auto">
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
              subjectsMap={subjectsMap}
              nowMinuteAbs={nowMinuteAbs}
            />
          ))}

          {/* Правая ось времени */}
          <TimeAxis nowMinuteAbs={nowMinuteAbs} />
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
  subjectsMap,
  nowMinuteAbs, 
}: {
  teacher: Teacher
  date: string
  slots: Slot[]
  onEmptyCellClick: (minuteFrom: number) => void
  onSlotClick: (s: Slot) => void
  subjectsMap: Record<number, string>
  nowMinuteAbs: number | null
}) {
  const totalHeight = (HOURS_END - HOURS_START) * 60 * MINUTE_PX
  const bgRows = useMemo(() => Array.from({ length: (HOURS_END - HOURS_START) * 4 }, () => 1), [])
  const inRange =
    nowMinuteAbs != null &&
    nowMinuteAbs >= HOURS_START * 60 &&
    nowMinuteAbs <= HOURS_END * 60
  const nowTop = inRange ? (nowMinuteAbs! - HOURS_START * 60) * MINUTE_PX : null

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
        {inRange && (
          <div
            className="absolute inset-x-0 pointer-events-none z-20"
            style={{ top: nowTop! }}
          >
            <div className="border-t border-red-500" />
          </div>
        )}

        {slots.map((s) => (
          <SlotBlock 
            key={s.id} 
            slot={s} 
            subjectName={subjectsMap[s.subject_id] ?? ''}
            onClick={() => onSlotClick(s)} 
      />
        ))}
      </div>
    </div>
  )
}

function SlotBlock({ slot, subjectName, onClick }: { slot: Slot; subjectName: string; onClick: () => void }) {
  const startMin = minutesFromMidnight(slot.start_time)
  const endMin = minutesFromMidnight(slot.end_time)
  const top = (startMin - HOURS_START * 60) * MINUTE_PX
  const height = Math.max(20, (endMin - startMin) * MINUTE_PX - 2)

  const freeTitle = 
    `${subjectName ? subjectName + ' · ' : ''}` +
    `${slot.mode ?? ''} ${slot.status} · ` +
    `${slot.capacity > 1 ? `группа до ${slot.capacity}` : 'индив.'}`

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
        <div className="font-medium truncate">
          {toTimeInput(slot.start_time)}–{toTimeInput(slot.end_time)}
        </div>
        <div className="uppercase text-[10px] opacity-90">{slot.mode}</div>
      </div>

      {/* 1-я строка: предмет */}
      <div className="truncate opacity-90">{subjectName}</div>

      {/* 2-я строка: тип занятия */} 
      <div className="truncate opacity-90">
        {slot.capacity > 1 ? `Группа (${slot.capacity})` : 'Индивидуально'}
      </div>
    </div>
  )
}
