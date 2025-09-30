export type LessonType = 'individual' | 'group'
export type Mode = 'online' | 'offline'
export type UserRole = 'client'|'teacher'|'admin'|'guest'

export interface Slot {
  id: number
  teacher_id: number
  subject_id: number
  date: string            // "YYYY-MM-DD"
  start_time: string      // "HH:MM:SS"
  end_time: string        // "HH:MM:SS"
  capacity: number
  lesson_type: 'individual' | 'group'
  mode: 'online' | 'offline'
  status: 'available' | 'booked' | 'canceled' | 'hidden' | 'tentative'
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

export type Settings = {
  slot_duration_min: number
  reminder_minutes_before: number
  morning_poll_cron: string
}

export interface UserRow {
  id: number
  telegram_id: number
  role: UserRole
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  phone?: string | null
  email?: string | null
  is_verified: boolean
}
