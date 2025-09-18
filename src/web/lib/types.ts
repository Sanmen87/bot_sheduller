export type LessonType = 'individual' | 'group'
export type Mode = 'online' | 'offline'

export interface Slot {
  id: number
  teacher_id: number
  start: string
  end: string
  capacity: number
  lesson_type: LessonType
  mode: Mode
  free_spots?: number
}

export interface Booking {
  id: number
  slot_id: number
  student_id: number
  status: 'new'|'confirmed'|'cancelled'
}

export interface Teacher {
  id: number;
  user_name: string;   // берём готовую строку с бэка
  // опционально можно держать вложенный объект, если пригодится:
  // user?: { id: number; first_name?: string; last_name?: string; username?: string; email?: string }
}
export interface User { id: number; email: string; role: 'admin'|'manager'|'teacher' }