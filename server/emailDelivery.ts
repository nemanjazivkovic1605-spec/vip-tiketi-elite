type EmailClient = { emails: { send: (options: any) => Promise<{ data?: { id: string } | null; error?: { name?: string; message?: string } | null }> } };

export async function sendCheckedEmail(client: EmailClient, options: Record<string, unknown>) {
  const result = await client.emails.send(options);
  if (result.error || !result.data?.id) {
    throw new Error('Email servis nije prihvatio poruku. Pokusajte ponovo.');
  }
  return result.data;
}

export const escapeEmailHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
