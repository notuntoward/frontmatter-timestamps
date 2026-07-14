export function formatTimestamp(date: Date, format: string): string {
  const parts: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };

  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => parts[token]);
}

export function formatTimestampForPropertyType(date: Date, propertyType: string, textFormat: string): string {
  if (propertyType === "date") {
    return formatTimestamp(date, "yyyy-MM-dd");
  }

  if (propertyType === "datetime") {
    return formatTimestamp(date, "yyyy-MM-ddTHH:mm:ss");
  }

  return formatTimestamp(date, textFormat);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
