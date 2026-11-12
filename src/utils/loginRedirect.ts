export const safeLoginRedirect = (value: string | null) => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/dashboard';
  const url = new URL(value, 'https://eliteviptips.com');
  return url.origin === 'https://eliteviptips.com' && ['/checkout', '/tickets'].includes(url.pathname)
    ? url.pathname + url.search : '/dashboard';
};
