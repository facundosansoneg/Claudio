import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/migration/parse-csv";

describe("parseCsv", () => {
  it("parsea encabezados y filas simples", () => {
    const result = parseCsv("display_name,document_number\nJuan Pérez,12345678\nMaría García,87654321");

    expect(result.headers).toEqual(["display_name", "document_number"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ display_name: "Juan Pérez", document_number: "12345678" });
    expect(result.rows[1]).toEqual({ display_name: "María García", document_number: "87654321" });
  });

  it("soporta campos citados con comas adentro", () => {
    const result = parseCsv('display_name,legal_name\n"Pérez, Juan",Individual');

    expect(result.rows[0]).toEqual({ display_name: "Pérez, Juan", legal_name: "Individual" });
  });

  it("soporta comillas escapadas dentro de un campo citado", () => {
    const result = parseCsv('display_name\n"Empresa ""La Buena"" SA"');

    expect(result.rows[0]?.display_name).toBe('Empresa "La Buena" SA');
  });

  it("devuelve vacío para un CSV vacío", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
