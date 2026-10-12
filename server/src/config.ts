function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3001)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

function parseOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: parsePort(process.env.PORT),
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGINS),
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  isProduction: process.env.NODE_ENV === 'production',
}
