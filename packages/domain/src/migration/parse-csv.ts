export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parser CSV genérico (spec, sección 16.4 `[OPEN]`: no hay formato de
 * exportación de SGA todavía, así que esto es deliberadamente un
 * parser CSV estándar, no un parser de un layout específico).
 * Soporta comillas dobles con comas y comillas escapadas (`""`) dentro
 * de un campo — no soporta saltos de línea dentro de un campo citado
 * (caso raro en exportaciones tabulares simples; si aparece, la fila
 * se corta antes de tiempo y la validación de columnas lo va a marcar
 * como error en vez de fallar en silencio).
 */
export function parseCsv(csvText: string): ParsedCsv {
  const lines = csvText.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current);
    return fields.map((f) => f.trim());
  };

  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}
