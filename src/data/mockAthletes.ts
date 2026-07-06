import type { Athlete } from "./schemas";

export const MOCK_ATHLETES: Athlete[] = [
  { id: "quick-test", name: "Quick Test", sport: "—", notes: "Anonymous quick-test session" },
  { id: "a-001", name: "J. Carter", sport: "Baseball", position: "OF" },
  { id: "a-002", name: "M. Reyes", sport: "Hockey", position: "C" },
  { id: "a-003", name: "T. Brooks", sport: "Football", position: "WR" },
  { id: "a-004", name: "D. Kowalski", sport: "IndyCar", position: "Pit crew" },
  { id: "a-005", name: "K. Naylor", sport: "Tactical", position: "Unit" },
];
