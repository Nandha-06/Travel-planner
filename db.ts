import fs from "fs";
import path from "path";

const DB_FILE = path.resolve(process.cwd(), "db.json");

export interface Trip {
  id: number;
  title: string;
  description?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  currency: string;
  is_archived: boolean;
  created_at: string;
}

export interface Day {
  id: number;
  trip_id: number;
  day_number: number;
  date?: string; // YYYY-MM-DD
  title?: string;
  notes?: string;
}

export interface Place {
  id: number;
  trip_id: number;
  name: string;
  description?: string;
  lat?: number;
  lng?: number;
  address?: string;
  category_id?: number;
  price?: number;
  currency?: string;
  notes?: string;
  website?: string;
  phone?: string;
  google_place_id?: string;
  osm_id?: string;
}

export interface DayAssignment {
  id: number;
  day_id: number;
  place_id: number;
  order_index: number;
  notes?: string;
  place_time?: string; // HH:MM
  end_time?: string; // HH:MM
}

export interface Reservation {
  id: number;
  trip_id: number;
  day_id?: number;
  end_day_id?: number;
  place_id?: number;
  assignment_id?: number;
  title: string;
  location?: string;
  confirmation_number?: string;
  notes?: string;
  status: "pending" | "confirmed" | "cancelled";
  type: "hotel" | "restaurant" | "event" | "tour" | "activity" | "other";
  price?: number;
  budget_category?: string;
  accommodation_id?: number;
  reservation_time?: string;
}

export interface Accommodation {
  id: number;
  trip_id: number;
  place_id: number;
  start_day_id: number;
  end_day_id: number;
  check_in?: string;
  check_out?: string;
  confirmation?: string;
}

export interface PackingItem {
  id: number;
  trip_id: number;
  name: string;
  checked: boolean;
  category?: string;
}

export interface BudgetItem {
  id: number;
  trip_id: number;
  category: string;
  name: string;
  total_price: number;
  note?: string;
}

export interface Todo {
  id: number;
  trip_id: number;
  name: string;
  checked: boolean;
}

interface DatabaseSchema {
  trips: Trip[];
  days: Day[];
  places: Place[];
  assignments: DayAssignment[];
  reservations: Reservation[];
  accommodations: Accommodation[];
  packing: PackingItem[];
  budget: BudgetItem[];
  todos: Todo[];
}

let data: DatabaseSchema = {
  trips: [],
  days: [],
  places: [],
  assignments: [],
  reservations: [],
  accommodations: [],
  packing: [],
  budget: [],
  todos: [],
};

// Helper: load DB
export function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, "utf8");
      data = JSON.parse(fileContent);
    } else {
      saveDb();
    }
  } catch (err) {
    console.error("Failed to load db.json, starting fresh", err);
  }
}

// Helper: save DB
export function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save db.json", err);
  }
}

// Initialize database on import
loadDb();

// Auto-increment IDs helper
function nextId(arr: { id: number }[]): number {
  return arr.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
}

// Date generator helper
function generateDaysForTrip(tripId: number, startStr?: string, endStr?: string): Day[] {
  if (!startStr || !endStr) return [];
  const days: Day[] = [];
  try {
    const start = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

    let current = new Date(start);
    let dayNum = 1;
    while (current <= end && dayNum <= 90) {
      const dateString = current.toISOString().slice(0, 10);
      const dayId = nextId(data.days) + days.length;
      days.push({
        id: dayId,
        trip_id: tripId,
        day_number: dayNum,
        date: dateString,
        title: `Day ${dayNum}`,
      });
      // Increment 1 day
      current.setUTCDate(current.getUTCDate() + 1);
      dayNum++;
    }
  } catch (e) {
    console.error("Error generating trip days", e);
  }
  return days;
}

// --- TRIPS ---
export function listTrips(): Trip[] {
  return data.trips.filter((t) => !t.is_archived);
}

export function createTrip(fields: {
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  currency?: string;
}): { trip: Trip; days: Day[] } {
  const tripId = nextId(data.trips);
  const trip: Trip = {
    id: tripId,
    title: fields.title,
    description: fields.description,
    start_date: fields.start_date,
    end_date: fields.end_date,
    currency: fields.currency || "USD",
    is_archived: false,
    created_at: new Date().toISOString(),
  };

  const generatedDays = generateDaysForTrip(tripId, fields.start_date, fields.end_date);
  
  data.trips.push(trip);
  data.days.push(...generatedDays);
  saveDb();

  return { trip, days: generatedDays };
}

export function updateTrip(tripId: number, fields: Partial<Omit<Trip, "id" | "created_at">>): Trip | null {
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  Object.assign(trip, fields);
  saveDb();
  return trip;
}

export function deleteTrip(tripId: number): boolean {
  const initialLen = data.trips.length;
  data.trips = data.trips.filter((t) => t.id !== tripId);
  data.days = data.days.filter((d) => d.trip_id !== tripId);
  data.places = data.places.filter((p) => p.trip_id !== tripId);
  data.reservations = data.reservations.filter((r) => r.trip_id !== tripId);
  data.accommodations = data.accommodations.filter((a) => a.trip_id !== tripId);
  data.packing = data.packing.filter((pk) => pk.trip_id !== tripId);
  data.budget = data.budget.filter((b) => b.trip_id !== tripId);
  data.todos = data.todos.filter((td) => td.trip_id !== tripId);
  saveDb();
  return data.trips.length < initialLen;
}

// --- TRIP SUMMARY ---
export function getTripSummary(tripId: number) {
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const tripDays = data.days.filter((d) => d.trip_id === tripId);
  const tripPlaces = data.places.filter((p) => p.trip_id === tripId);
  const tripReservations = data.reservations.filter((r) => r.trip_id === tripId);
  const tripAccommodations = data.accommodations.filter((a) => a.trip_id === tripId);
  const tripPacking = data.packing.filter((pk) => pk.trip_id === tripId);
  const tripBudget = data.budget.filter((b) => b.trip_id === tripId);
  const tripTodos = data.todos.filter((td) => td.trip_id === tripId);

  // Group assignments by day
  const dayIds = tripDays.map((d) => d.id);
  const dayAssignments = data.assignments.filter((a) => dayIds.includes(a.day_id));

  // Map places onto assignments
  const daysWithAssignments = tripDays.map((day) => {
    const dayAsses = dayAssignments
      .filter((a) => a.day_id === day.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((a) => {
        const place = tripPlaces.find((p) => p.id === a.place_id);
        return {
          ...a,
          place,
        };
      });
    return {
      ...day,
      assignments: dayAsses,
    };
  });

  return {
    trip,
    days: daysWithAssignments,
    places: tripPlaces,
    reservations: tripReservations,
    accommodations: tripAccommodations,
    packing: tripPacking,
    budget: tripBudget,
    todos: tripTodos,
  };
}

// --- PLACES ---
export function createPlace(tripId: number, fields: Omit<Place, "id" | "trip_id">): Place {
  const placeId = nextId(data.places);
  const place: Place = {
    id: placeId,
    trip_id: tripId,
    ...fields,
  };
  data.places.push(place);
  saveDb();
  return place;
}

export function assignPlaceToDay(dayId: number, placeId: number, fields: { notes?: string; place_time?: string; end_time?: string }): DayAssignment {
  const currentAsses = data.assignments.filter((a) => a.day_id === dayId);
  const nextOrder = currentAsses.reduce((max, item) => (item.order_index > max ? item.order_index : max), -1) + 1;

  const id = nextId(data.assignments);
  const ass: DayAssignment = {
    id,
    day_id: dayId,
    place_id: placeId,
    order_index: nextOrder,
    ...fields,
  };
  data.assignments.push(ass);
  saveDb();
  return ass;
}

export function updatePlace(tripId: number, placeId: number, fields: Partial<Omit<Place, "id" | "trip_id">>): Place | null {
  const place = data.places.find((p) => p.id === placeId && p.trip_id === tripId);
  if (!place) return null;
  Object.assign(place, fields);
  saveDb();
  return place;
}

export function deletePlace(tripId: number, placeId: number): boolean {
  const initialLen = data.places.length;
  data.places = data.places.filter((p) => !(p.id === placeId && p.trip_id === tripId));
  // also delete day assignments for this place
  data.assignments = data.assignments.filter((a) => a.place_id !== placeId);
  saveDb();
  return data.places.length < initialLen;
}

// --- RESERVATIONS & ACCOMMODATIONS ---
export function createReservation(tripId: number, fields: {
  title: string;
  type: Reservation["type"];
  reservation_time?: string;
  location?: string;
  confirmation_number?: string;
  notes?: string;
  day_id?: number;
  place_id?: number;
  start_day_id?: number;
  end_day_id?: number;
  check_in?: string;
  check_out?: string;
  price?: number;
  budget_category?: string;
}): { reservation: Reservation; accommodation?: Accommodation } {
  const resId = nextId(data.reservations);

  let acc: Accommodation | undefined;
  if (fields.type === "hotel" && fields.place_id && fields.start_day_id && fields.end_day_id) {
    const accId = nextId(data.accommodations);
    acc = {
      id: accId,
      trip_id: tripId,
      place_id: fields.place_id,
      start_day_id: fields.start_day_id,
      end_day_id: fields.end_day_id,
      check_in: fields.check_in,
      check_out: fields.check_out,
      confirmation: fields.confirmation_number,
    };
    data.accommodations.push(acc);
  }

  const reservation: Reservation = {
    id: resId,
    trip_id: tripId,
    title: fields.title,
    type: fields.type,
    reservation_time: fields.reservation_time,
    location: fields.location,
    confirmation_number: fields.confirmation_number,
    notes: fields.notes,
    status: "pending",
    day_id: fields.day_id,
    place_id: fields.place_id,
    end_day_id: fields.end_day_id,
    accommodation_id: acc?.id,
    price: fields.price,
    budget_category: fields.budget_category,
  };

  data.reservations.push(reservation);

  // Link to budget if price exists
  if (fields.price != null && fields.price > 0) {
    const budgetId = nextId(data.budget);
    data.budget.push({
      id: budgetId,
      trip_id: tripId,
      name: fields.title,
      category: fields.budget_category || fields.type,
      total_price: fields.price,
      note: fields.notes || `Linked to reservation: ${fields.title}`,
    });
  }

  saveDb();
  return { reservation, accommodation: acc };
}

export function updateReservation(tripId: number, reservationId: number, fields: Partial<Reservation>): Reservation | null {
  const res = data.reservations.find((r) => r.id === reservationId && r.trip_id === tripId);
  if (!res) return null;
  Object.assign(res, fields);
  saveDb();
  return res;
}

export function deleteReservation(tripId: number, reservationId: number): boolean {
  const res = data.reservations.find((r) => r.id === reservationId && r.trip_id === tripId);
  if (!res) return false;

  data.reservations = data.reservations.filter((r) => r.id !== reservationId);
  if (res.accommodation_id) {
    data.accommodations = data.accommodations.filter((a) => a.id !== res.accommodation_id);
  }
  saveDb();
  return true;
}

// --- PACKING ITEMS ---
export function createPackingItem(tripId: number, name: string, category?: string): PackingItem {
  const id = nextId(data.packing);
  const item: PackingItem = { id, trip_id: tripId, name, checked: false, category };
  data.packing.push(item);
  saveDb();
  return item;
}

export function togglePackingItem(tripId: number, itemId: number, checked: boolean): PackingItem | null {
  const item = data.packing.find((p) => p.id === itemId && p.trip_id === tripId);
  if (!item) return null;
  item.checked = checked;
  saveDb();
  return item;
}

export function deletePackingItem(tripId: number, itemId: number): boolean {
  const len = data.packing.length;
  data.packing = data.packing.filter((p) => !(p.id === itemId && p.trip_id === tripId));
  saveDb();
  return data.packing.length < len;
}

// --- BUDGET ITEMS ---
export function createBudgetItem(tripId: number, name: string, category: string, total_price: number, note?: string): BudgetItem {
  const id = nextId(data.budget);
  const item: BudgetItem = { id, trip_id: tripId, category, name, total_price, note };
  data.budget.push(item);
  saveDb();
  return item;
}

export function deleteBudgetItem(tripId: number, itemId: number): boolean {
  const len = data.budget.length;
  data.budget = data.budget.filter((b) => !(b.id === itemId && b.trip_id === tripId));
  saveDb();
  return data.budget.length < len;
}

// --- TODOS ---
export function createTodo(tripId: number, name: string): Todo {
  const id = nextId(data.todos);
  const todo: Todo = { id, trip_id: tripId, name, checked: false };
  data.todos.push(todo);
  saveDb();
  return todo;
}

export function toggleTodo(tripId: number, todoId: number, checked: boolean): Todo | null {
  const todo = data.todos.find((t) => t.id === todoId && t.trip_id === tripId);
  if (!todo) return null;
  todo.checked = checked;
  saveDb();
  return todo;
}

export function deleteTodo(tripId: number, todoId: number): boolean {
  const len = data.todos.length;
  data.todos = data.todos.filter((t) => !(t.id === todoId && t.trip_id === tripId));
  saveDb();
  return data.todos.length < len;
}
