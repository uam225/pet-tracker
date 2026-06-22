// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  name: string
  email: string
  created_at: string
}

export interface RegistrationStatus {
  is_open: boolean
  current_count: number
  max_users: number
}

// ─── Pets ─────────────────────────────────────────────────────────────────────

export type Species = 'dog' | 'cat'
export type MealType = 'breakfast' | 'snack' | 'dinner' | 'ad_hoc'

export interface ScheduleSlot {
  id: number
  meal_type: MealType
  window_start: string  // HH:MM:SS
  window_end: string
  reason_required_on_deviation: boolean
  updated_at: string
}

export interface Pet {
  id: number
  name: string
  species: Species
  breed: string | null
  date_of_birth: string | null
  weight_kg: number | null
  schedule_slots: ScheduleSlot[]
  created_at: string
  deleted_at: string | null
}

export interface PetCreate {
  name: string
  species: Species
  breed?: string
  date_of_birth?: string
  weight_kg?: number
  schedule_slots?: ScheduleSlotCreate[]
}

export interface PetUpdate {
  name?: string
  breed?: string
  date_of_birth?: string
  weight_kg?: number
}

export interface ScheduleSlotCreate {
  meal_type: MealType
  window_start: string
  window_end: string
  reason_required_on_deviation: boolean
}

export interface ScheduleSlotUpdate {
  window_start?: string
  window_end?: string
  reason_required_on_deviation?: boolean
}

// ─── Food library ─────────────────────────────────────────────────────────────

export type IngredientCategory =
  | 'Poultry' | 'Red Meat' | 'Fish' | 'Egg' | 'Grain' | 'Dairy'
  | 'Vegetable' | 'Fruit' | 'Supplement' | 'Other'

export interface FoodCategory {
  id: number
  name: string
  display_order: number
}

export interface Ingredient {
  id: number
  name: string
  category: IngredientCategory
  is_common_allergen: boolean
  created_at: string
  updated_at: string
}

export interface IngredientCreate {
  name: string
  category: IngredientCategory
  is_common_allergen?: boolean
}

export interface FoodItemIngredient {
  id: number
  ingredient_id: number
  ingredient: Ingredient
  percentage: number | null
  notes: string | null
}

export interface FoodItem {
  id: number
  name: string
  brand: string | null
  food_category_id: number | null
  description: string | null
  is_archived: boolean
  previous_version_id: number | null
  ingredients: FoodItemIngredient[]
  created_at: string
  updated_at: string
}

export interface FoodItemCreate {
  name: string
  brand?: string
  food_category_id?: number
  description?: string
  ingredients?: FoodItemIngredientCreate[]
}

export interface FoodItemIngredientCreate {
  ingredient_id: number
  percentage?: number
  notes?: string
}

export interface FoodItemUpdate extends FoodItemCreate {
  change_reason?: string
}

export interface FoodItemNewVersionRequest extends FoodItemCreate {
  change_reason?: string
}

export interface FoodItemEditHistory {
  id: number
  food_item_id: number
  changed_by: number
  snapshot_before: Record<string, unknown>
  snapshot_after: Record<string, unknown>
  change_reason: string | null
  changed_at: string
}

// ─── Meal logs ────────────────────────────────────────────────────────────────

export interface MealLogItem {
  id: number
  food_item_id: number
  food_item: FoodItem
  portion_grams: number
  notes: string | null
}

export interface MealLog {
  id: number
  pet_id: number
  logged_by: number
  meal_type: MealType
  fed_at: string
  scheduled_window_start: string | null
  scheduled_window_end: string | null
  deviation_minutes: number | null
  deviation_reason: string | null
  notes: string | null
  corrects_log_id: number | null
  items: MealLogItem[]
  created_at: string
  deleted_at: string | null
  is_within_correction_window: boolean
}

export interface MealLogItemCreate {
  food_item_id: number
  portion_grams: number
  notes?: string
}

export interface MealLogCreate {
  pet_id: number
  meal_type: MealType
  fed_at: string
  items: MealLogItemCreate[]
  deviation_reason?: string
  notes?: string
}

export interface MealLogUpdate {
  fed_at?: string
  items?: MealLogItemCreate[]
  deviation_reason?: string
  notes?: string
}

// ─── Health observations ──────────────────────────────────────────────────────

export interface Symptom {
  id: number
  name: string
  description: string | null
  applies_to_species: 'dog' | 'all'
  display_order: number
  is_active: boolean
}

export interface ObservationSymptom {
  symptom: Symptom
  notes: string | null
}

export interface HealthObservation {
  id: number
  pet_id: number
  logged_by: number
  observed_at: string
  observation_date: string
  energy_level: number | null
  digestion_comfort: number | null
  stool_quality: number | null
  reaction_severity: number | null
  symptoms: ObservationSymptom[]
  notes: string | null
  created_at: string
  deleted_at: string | null
}

export interface ObservationSymptomCreate {
  symptom_id: number
  notes?: string
}

export interface HealthObservationCreate {
  pet_id: number
  observation_date: string
  energy_level?: number
  digestion_comfort?: number
  stool_quality?: number
  reaction_severity?: number
  symptoms?: ObservationSymptomCreate[]
  notes?: string
}

export interface HealthObservationUpdate extends Partial<HealthObservationCreate> {}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface MissedSlot {
  meal_type: MealType
  window_start: string
  window_end: string
}

export interface PetDashboardSummary {
  pet_id: number
  pet_name: string
  pet_species: Species
  todays_meal_count: number
  missed_slots: MissedSlot[]
  latest_observation: HealthObservation | null
  active_symptoms: string[]
}

export interface DashboardData {
  pets: PetDashboardSummary[]
  generated_at: string
}

// ─── API error ────────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { msg: string; type: string }[]
}
