/**
 * All API functions.
 * Imported by TanStack Query hooks and form submission handlers.
 */

import { api } from './client'
import type {
  DashboardData,
  FoodCategory,
  FoodItem,
  FoodItemCreate,
  FoodItemEditHistory,
  FoodItemNewVersionRequest,
  FoodItemUpdate,
  HealthObservation,
  HealthObservationCreate,
  HealthObservationUpdate,
  Ingredient,
  IngredientCreate,
  MealLog,
  MealLogCreate,
  MealLogUpdate,
  Pet,
  PetCreate,
  PetUpdate,
  RegistrationStatus,
  ScheduleSlotUpdate,
  Symptom,
  User,
} from '@/types/api'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post<User>('/api/auth/register', { name, email, password }),
  login: (email: string, password: string) =>
    api.post<User>('/api/auth/login', { email, password }),
  logout: () => api.post<void>('/api/auth/logout'),
  me: () => api.get<User>('/api/auth/me'),
  status: () => api.get<RegistrationStatus>('/api/auth/status'),
}

// ─── Pets ─────────────────────────────────────────────────────────────────────

export const petsApi = {
  list: () => api.get<Pet[]>('/api/pets'),
  get:  (id: number) => api.get<Pet>(`/api/pets/${id}`),
  create: (data: PetCreate) => api.post<Pet>('/api/pets', data),
  update: (id: number, data: PetUpdate) => api.patch<Pet>(`/api/pets/${id}`, data),
  delete: (id: number) => api.delete<void>(`/api/pets/${id}`),
  getSchedule: (id: number) => api.get<Pet['schedule_slots']>(`/api/pets/${id}/schedule`),
  updateSlot:  (petId: number, slotId: number, data: ScheduleSlotUpdate) =>
    api.patch(`/api/pets/${petId}/schedule/${slotId}`, data),
}

// ─── Food library ─────────────────────────────────────────────────────────────

export const foodApi = {
  categories: () => api.get<FoodCategory[]>('/api/food/categories'),
  ingredients: () => api.get<Ingredient[]>('/api/food/ingredients'),
  createIngredient: (data: IngredientCreate) => api.post<Ingredient>('/api/food/ingredients', data),
  items: (includeArchived = false) =>
    api.get<FoodItem[]>(`/api/food/items${includeArchived ? '?include_archived=true' : ''}`),
  getItem:       (id: number) => api.get<FoodItem>(`/api/food/items/${id}`),
  createItem:    (data: FoodItemCreate) => api.post<FoodItem>('/api/food/items', data),
  updateItem:    (id: number, data: FoodItemUpdate) => api.patch<FoodItem>(`/api/food/items/${id}`, data),
  archiveItem:   (id: number) => api.delete<void>(`/api/food/items/${id}`),
  newVersion:    (id: number, data: FoodItemNewVersionRequest) =>
    api.post<FoodItem>(`/api/food/items/${id}/new-version`, data),
  editHistory:   (id: number) => api.get<FoodItemEditHistory[]>(`/api/food/items/${id}/history`),
}

// ─── Meal logs ────────────────────────────────────────────────────────────────

export const mealLogsApi = {
  list: (params?: { pet_id?: number; date_from?: string; date_to?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.pet_id)    qs.set('pet_id',    String(params.pet_id))
    if (params?.date_from) qs.set('date_from', params.date_from)
    if (params?.date_to)   qs.set('date_to',   params.date_to)
    if (params?.limit)     qs.set('limit',     String(params.limit))
    return api.get<MealLog[]>(`/api/meal-logs${qs.size ? '?' + qs : ''}`)
  },
  get:    (id: number) => api.get<MealLog>(`/api/meal-logs/${id}`),
  create: (data: MealLogCreate) => api.post<MealLog>('/api/meal-logs', data),
  update: (id: number, data: MealLogUpdate) => api.patch<MealLog>(`/api/meal-logs/${id}`, data),
  delete: (id: number) => api.delete<void>(`/api/meal-logs/${id}`),
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  symptoms: (species?: 'dog' | 'cat') =>
    api.get<Symptom[]>(`/api/health/symptoms${species ? `?species=${species}` : ''}`),
  list: (params?: { pet_id?: number; date_from?: string; date_to?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.pet_id)    qs.set('pet_id',    String(params.pet_id))
    if (params?.date_from) qs.set('date_from', params.date_from)
    if (params?.date_to)   qs.set('date_to',   params.date_to)
    if (params?.limit)     qs.set('limit',     String(params.limit))
    return api.get<HealthObservation[]>(`/api/health${qs.size ? '?' + qs : ''}`)
  },
  get:    (id: number) => api.get<HealthObservation>(`/api/health/${id}`),
  create: (data: HealthObservationCreate) => api.post<HealthObservation>('/api/health', data),
  update: (id: number, data: HealthObservationUpdate) =>
    api.patch<HealthObservation>(`/api/health/${id}`, data),
  delete: (id: number) => api.delete<void>(`/api/health/${id}`),
  dashboard: () => api.get<DashboardData>('/api/dashboard'),
}
