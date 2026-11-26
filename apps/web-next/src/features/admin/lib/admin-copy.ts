/** No fallback to a record ID: only the explicitly supplied full value is copied. */
export async function copyAdminValue(value: string | undefined, clipboard?: Pick<Clipboard, 'writeText'>) {
  if (!value) throw new Error('No plaintext available to copy')
  if (!clipboard) throw new Error('Clipboard unavailable')
  await clipboard.writeText(value)
}
