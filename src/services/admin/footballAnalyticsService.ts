import { auth } from "../../lib/firebase";

export async function analyticsRequest<T>(
  action: string,
  params: Record<string, string> = {},
  method = "GET",
  signal?: AbortSignal,
  payload?: unknown,
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Prijavite se administratorskim nalogom.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 100000);
  try {
    const token = await user.getIdToken();
    const response = await fetch(
      `/api/football-analytics?${new URLSearchParams({ action, ...params })}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        signal: controller.signal,
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(data.error || "Analizator trenutno nije dostupan."), {
        status: response.status,
      });
    return data as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Zahtev je prekinut ili traje predugo. Sačuvani uvoz može da se nastavi.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
