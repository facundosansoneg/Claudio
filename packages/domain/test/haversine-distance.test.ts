import { describe, expect, it } from "vitest";
import { haversineDistanceKm } from "../src/patrimonial/haversine-distance";

describe("haversineDistanceKm", () => {
  it("devuelve 0 para el mismo punto", () => {
    expect(haversineDistanceKm(-34.9011, -56.1645, -34.9011, -56.1645)).toBeCloseTo(0, 6);
  });

  it("calcula una distancia conocida (Montevideo - Punta del Este, ~130km)", () => {
    const distance = haversineDistanceKm(-34.9011, -56.1645, -34.9608, -54.9407);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(160);
  });
});
