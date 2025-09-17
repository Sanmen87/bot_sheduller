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

export interface Teacher { id: number; name: string }
export interface User { id: number; email: string; role: 'admin'|'manager'|'teacher' }