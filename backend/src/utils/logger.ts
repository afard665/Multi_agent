export function log(message: string, meta?: any) {
  const time = new Date().toISOString();
  if (meta) console.log(`[${time}]`, message, meta);
  else console.log(`[${time}]`, message);
}
